import { useEffect, useMemo, useRef, useState } from 'react';

import type { AppSettings, MemberDTO, MemberPayload } from '@gym/shared';
import { Alert, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField } from '@mui/material';

type CaptureState = 'idle' | 'waiting' | 'captured' | 'duplicate' | 'timeout' | 'error';

interface Props {
  open: boolean;
  member?: MemberDTO | null;
  initialCardId?: string;
  onClose: () => void;
  onSubmit: (payload: MemberPayload, managerPin?: string) => Promise<void>;
  onBindCard?: (memberId: number) => Promise<string>;
}

function defaultForm(): MemberPayload {
  return {
    fullName: '',
    phone: '',
    subscriptionType: 'MONTHLY',
    startDate: new Date().toISOString().slice(0, 10),
    durationMonths: 1,
    sessionsTotal: null,
    sessionsRemaining: null,
    sessionsExpiryDate: null,
    notes: '',
    planId: null,
    cardId: '',
  };
}

function isTimeoutError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /timed out|timeout|no card/i.test(message);
}

export function MemberDialog({ open, member, initialCardId, onClose, onSubmit, onBindCard }: Props) {
  const [form, setForm] = useState<MemberPayload>(defaultForm());
  const [saving, setSaving] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const [cardId, setCardId] = useState('');
  const [captureState, setCaptureState] = useState<CaptureState>('idle');
  const [captureMessage, setCaptureMessage] = useState('');
  const captureRequestRef = useRef(0);

  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [managerPinForNoCard, setManagerPinForNoCard] = useState('');

  const isCreateMode = !member;
  const strictMode = Boolean(settings?.strictMode);
  const allowSkip = !strictMode;

  const startCapture = async (): Promise<void> => {
    if (!isCreateMode) return;

    captureRequestRef.current += 1;
    const requestId = captureRequestRef.current;

    setCardId('');
    setForm((prev) => ({ ...prev, cardId: '' }));
    setCaptureState('waiting');
    setCaptureMessage('Waiting for card...');

    try {
      const captured = await window.api.k40.captureCard(10);
      if (requestId !== captureRequestRef.current) return;

      if (captured.ownerMemberId) {
        setCaptureState('duplicate');
        setCaptureMessage(`Card already linked to: ${captured.ownerName ?? `#${captured.ownerMemberId}`}`);
        setCardId(captured.cardId);
        setForm((prev) => ({ ...prev, cardId: captured.cardId }));
        return;
      }

      setCardId(captured.cardId);
      setForm((prev) => ({ ...prev, cardId: captured.cardId }));
      setCaptureState('captured');
      setCaptureMessage('Card captured.');
    } catch (error) {
      if (requestId !== captureRequestRef.current) return;

      if (isTimeoutError(error)) {
        setCaptureState('timeout');
        setCaptureMessage('No card detected within 10 seconds.');
      } else {
        const message = error instanceof Error ? error.message : 'Card capture failed.';
        setCaptureState('error');
        setCaptureMessage(message);
      }
    }
  };

  useEffect(() => {
    if (!open) return;

    setErrorText(null);
    setManagerPinForNoCard('');
    void window.api.settings.get().then((s) => setSettings(s));

    if (member) {
      setForm({
        fullName: member.fullName,
        phone: member.phone,
        subscriptionType: member.subscriptionType,
        startDate: member.startDate,
        durationMonths: member.durationMonths,
        sessionsTotal: member.sessionsTotal,
        sessionsRemaining: member.sessionsRemaining,
        sessionsExpiryDate: member.sessionsExpiryDate,
        notes: member.notes,
        planId: member.planId,
        cardId: member.cardId ?? '',
      });
      setCardId(member.cardId ?? '');
      setCaptureState('idle');
      setCaptureMessage('');
      return;
    }

    const initial = (initialCardId ?? '').trim();
    setForm({ ...defaultForm(), cardId: initial });
    setCardId(initial);

    if (initial) {
      setCaptureState('captured');
      setCaptureMessage('Card prepared.');
    } else {
      void startCapture();
    }
  }, [open, member, initialCardId]);

  const saveBlockedReason = useMemo(() => {
    if (!isCreateMode) return null;
    if (captureState === 'duplicate') return 'Cannot save with duplicate card.';
    if (strictMode && !cardId && !managerPinForNoCard.trim()) return 'Manager PIN required to save without card.';
    return null;
  }, [isCreateMode, captureState, strictMode, cardId, managerPinForNoCard]);

  const save = async () => {
    if (saving) return;
    setErrorText(null);

    if (!form.fullName.trim()) {
      setErrorText('Please enter full name.');
      return;
    }
    if (!form.phone.trim()) {
      setErrorText('Please enter phone.');
      return;
    }
    if (saveBlockedReason) {
      setErrorText(saveBlockedReason);
      return;
    }
    if (form.subscriptionType === 'SESSIONS' && Number(form.sessionsTotal ?? 0) <= 0) {
      setErrorText('Sessions total must be greater than zero.');
      return;
    }

    setSaving(true);
    try {
      await onSubmit(
        {
          ...form,
          fullName: form.fullName.trim(),
          phone: form.phone.trim(),
          notes: form.notes?.trim() ?? '',
          cardId: cardId.trim(),
          durationMonths: form.subscriptionType === 'MONTHLY' ? Number(form.durationMonths || 1) : 0,
          sessionsTotal: form.subscriptionType === 'SESSIONS' ? Number(form.sessionsTotal ?? 0) : null,
          sessionsRemaining: form.subscriptionType === 'SESSIONS' ? Number(form.sessionsRemaining ?? form.sessionsTotal ?? 0) : null,
          sessionsExpiryDate: form.subscriptionType === 'SESSIONS' ? form.sessionsExpiryDate ?? null : null,
        },
        isCreateMode && !cardId.trim() ? managerPinForNoCard.trim() : undefined,
      );
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save member';
      setErrorText(message);
    } finally {
      setSaving(false);
    }
  };

  const bindCard = async () => {
    if (!member || !onBindCard) return;
    const linkedCard = await onBindCard(member.id);
    setCardId(linkedCard);
  };

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>{member ? 'Edit Member' : 'Add Member'}</DialogTitle>
      <DialogContent sx={{ display: 'grid', gap: 2, pt: 2 }}>
        {errorText && <Alert severity="error">{errorText}</Alert>}

        {isCreateMode && (
          <Stack spacing={1} sx={{ border: '1px solid #E2E8F0', borderRadius: 2, p: 1.5 }}>
            <Stack direction="row" spacing={1} alignItems="center">
              {captureState === 'waiting' && <CircularProgress size={18} />}
              <span>{captureMessage || 'Waiting for card...'}</span>
            </Stack>
            <TextField label="card_id" value={cardId || '-'} InputProps={{ readOnly: true }} fullWidth />
            <Stack direction="row" spacing={1}>
              <Button variant="outlined" onClick={() => void startCapture()} disabled={captureState === 'waiting'}>
                Retry
              </Button>
              {allowSkip && (
                <Button
                  variant="text"
                  onClick={() => {
                    captureRequestRef.current += 1;
                    setCardId('');
                    setForm((prev) => ({ ...prev, cardId: '' }));
                    setCaptureState('idle');
                    setCaptureMessage('Skipped.');
                  }}
                  disabled={captureState === 'waiting'}
                >
                  Skip
                </Button>
              )}
            </Stack>
            {strictMode && !cardId && (
              <TextField
                type="password"
                label="Manager PIN (required if no card)"
                value={managerPinForNoCard}
                onChange={(event) => setManagerPinForNoCard(event.target.value)}
              />
            )}
          </Stack>
        )}

        <TextField label="Full Name" value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} />
        <TextField label="Phone" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />

        <TextField
          select
          label="Subscription Type"
          value={form.subscriptionType}
          onChange={(event) => {
            const nextType = event.target.value as 'MONTHLY' | 'SESSIONS';
            setForm((prev) => ({
              ...prev,
              subscriptionType: nextType,
              durationMonths: nextType === 'MONTHLY' ? Math.max(1, Number(prev.durationMonths || 1)) : 0,
              sessionsTotal: nextType === 'SESSIONS' ? Number(prev.sessionsTotal ?? 10) : null,
              sessionsRemaining:
                nextType === 'SESSIONS'
                  ? isCreateMode
                    ? Number(prev.sessionsTotal ?? 10)
                    : Number(prev.sessionsRemaining ?? prev.sessionsTotal ?? 0)
                  : null,
              sessionsExpiryDate: nextType === 'SESSIONS' ? prev.sessionsExpiryDate ?? null : null,
            }));
          }}
        >
          <MenuItem value="MONTHLY">اشتراك شهري</MenuItem>
          <MenuItem value="SESSIONS">اشتراك بالحصص</MenuItem>
        </TextField>

        {form.subscriptionType === 'MONTHLY' ? (
          <>
            <TextField
              type="date"
              label="Start Date"
              value={form.startDate}
              InputLabelProps={{ shrink: true }}
              onChange={(event) => setForm({ ...form, startDate: event.target.value })}
            />
            <TextField select label="Months" value={form.durationMonths} onChange={(event) => setForm({ ...form, durationMonths: Number(event.target.value) })}>
              {[1, 2, 3, 6, 12].map((months) => (
                <MenuItem key={months} value={months}>
                  {months}
                </MenuItem>
              ))}
            </TextField>
          </>
        ) : (
          <>
            <TextField
              type="number"
              label="Sessions Total"
              value={form.sessionsTotal ?? 10}
              inputProps={{ min: 1 }}
              onChange={(event) => {
                const total = Math.max(1, Number(event.target.value || 1));
                setForm((prev) => ({
                  ...prev,
                  sessionsTotal: total,
                  sessionsRemaining: isCreateMode ? total : Number(prev.sessionsRemaining ?? total),
                }));
              }}
            />
            <TextField
              type="number"
              label="Sessions Remaining"
              value={form.sessionsRemaining ?? form.sessionsTotal ?? 0}
              inputProps={{ min: 0 }}
              disabled={isCreateMode}
              onChange={(event) => setForm((prev) => ({ ...prev, sessionsRemaining: Math.max(0, Number(event.target.value || 0)) }))}
            />
            <TextField
              type="date"
              label="Sessions Expiry (optional)"
              value={form.sessionsExpiryDate ?? ''}
              InputLabelProps={{ shrink: true }}
              onChange={(event) => setForm((prev) => ({ ...prev, sessionsExpiryDate: event.target.value || null }))}
            />
          </>
        )}

        {!isCreateMode && (
          <Stack spacing={1}>
            <TextField label="Card" value={cardId || '-'} InputProps={{ readOnly: true }} fullWidth />
            <Button variant="outlined" onClick={bindCard} disabled={!member || !onBindCard}>
              Bind Card
            </Button>
          </Stack>
        )}

        <TextField label="Notes" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} multiline rows={3} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button variant="contained" onClick={save} disabled={saving || Boolean(saveBlockedReason)}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}
