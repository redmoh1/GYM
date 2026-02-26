import { useEffect, useMemo, useRef, useState } from 'react';

import type { AppSettings, MemberDTO, MemberPayload } from '@gym/shared';
import {
  Alert,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';

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
    startDate: new Date().toISOString().slice(0, 10),
    durationMonths: 1,
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
  const [captureOwnerName, setCaptureOwnerName] = useState<string | null>(null);
  const captureRequestRef = useRef(0);

  const [bindingOpen, setBindingOpen] = useState(false);
  const [bindingSecondsLeft, setBindingSecondsLeft] = useState(10);
  const [bindingError, setBindingError] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

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
    setCaptureOwnerName(null);
    setCaptureState('waiting');
    setCaptureMessage('في انتظار تمرير البطاقة...');

    try {
      const captured = await window.api.k40.captureCard(10);
      if (requestId !== captureRequestRef.current) return;

      if (captured.ownerMemberId) {
        setCaptureState('duplicate');
        setCaptureOwnerName(captured.ownerName || null);
        setCaptureMessage(`هذه البطاقة مرتبطة باللاعب: ${captured.ownerName ?? `#${captured.ownerMemberId}`}`);
        setCardId(captured.cardId);
        setForm((prev) => ({ ...prev, cardId: captured.cardId }));
        return;
      }

      setCardId(captured.cardId);
      setForm((prev) => ({ ...prev, cardId: captured.cardId }));
      setCaptureState('captured');
      setCaptureMessage('تم التقاط البطاقة بنجاح.');
    } catch (error) {
      if (requestId !== captureRequestRef.current) return;

      if (isTimeoutError(error)) {
        setCaptureState('timeout');
        setCaptureMessage('لم يتم التقاط بطاقة خلال 10 ثوانٍ.');
      } else {
        const message = error instanceof Error ? error.message : 'تعذر الاستماع لبطاقة جديدة.';
        setCaptureState('error');
        setCaptureMessage(message);
      }
    }
  };

  useEffect(() => {
    if (!open) return;

    setErrorText(null);
    setBindingError(null);
    setManagerPinForNoCard('');

    void (async () => {
      const appSettings = await window.api.settings.get();
      setSettings(appSettings);
    })();

    if (member) {
      setForm({
        fullName: member.fullName,
        phone: member.phone,
        startDate: member.startDate,
        durationMonths: member.durationMonths,
        notes: member.notes,
        planId: member.planId,
        cardId: member.cardId ?? '',
      });
      setCardId(member.cardId ?? '');
      setCaptureState('idle');
      setCaptureOwnerName(null);
      setCaptureMessage('');
      return;
    }

    const initial = (initialCardId ?? '').trim();
    setForm({ ...defaultForm(), cardId: initial });
    setCardId(initial);
    setCaptureOwnerName(null);

    if (initial) {
      setCaptureState('captured');
      setCaptureMessage('تم تجهيز البطاقة للربط.');
      return;
    }

    void startCapture();
  }, [open, member, initialCardId]);

  useEffect(() => {
    return () => {
      captureRequestRef.current += 1;
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, []);

  const saveBlockedReason = useMemo(() => {
    if (!isCreateMode) return null;
    if (captureState === 'duplicate') return 'لا يمكن الحفظ ببطاقة مكررة.';
    if (strictMode && !cardId && !managerPinForNoCard.trim()) return 'في strict_mode: أدخل PIN المدير للحفظ بدون بطاقة.';
    return null;
  }, [isCreateMode, captureState, strictMode, cardId, managerPinForNoCard]);

  const save = async () => {
    if (saving) return;
    setErrorText(null);

    if (!form.fullName.trim()) {
      setErrorText('الرجاء إدخال الاسم الكامل');
      return;
    }

    if (saveBlockedReason) {
      setErrorText(saveBlockedReason);
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
        },
        isCreateMode && !cardId.trim() ? managerPinForNoCard.trim() : undefined,
      );
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'فشل حفظ بيانات اللاعب';
      setErrorText(`خطأ: ${message}`);
    } finally {
      setSaving(false);
    }
  };

  const bindCard = async () => {
    if (!member || !onBindCard) return;

    setBindingError(null);
    setBindingSecondsLeft(10);
    setBindingOpen(true);

    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = window.setInterval(() => {
      setBindingSecondsLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    try {
      const linkedCard = await onBindCard(member.id);
      setCardId(linkedCard);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'تعذر ربط البطاقة';
      setBindingError(message);
    } finally {
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = null;
      setBindingOpen(false);
    }
  };

  return (
    <>
      <Dialog open={open} onClose={saving ? undefined : onClose} fullWidth maxWidth="sm">
        <DialogTitle>{member ? 'تعديل لاعب' : 'إضافة لاعب'}</DialogTitle>
        <DialogContent sx={{ display: 'grid', gap: 2, pt: 2 }}>
          {errorText && <Alert severity="error">{errorText}</Alert>}
          {bindingError && <Alert severity="error">{bindingError}</Alert>}

          {isCreateMode && (
            <Stack spacing={1} sx={{ border: '1px solid #E2E8F0', borderRadius: 2, p: 1.5 }}>
              <Typography fontWeight={800}>ربط البطاقة</Typography>

              <Stack direction="row" spacing={1} alignItems="center">
                {captureState === 'waiting' && <CircularProgress size={18} />}
                <Typography color={captureState === 'duplicate' ? 'error.main' : 'text.secondary'}>
                  {captureMessage || 'في انتظار تمرير البطاقة...'}
                </Typography>
              </Stack>

              <TextField label="card_id" value={cardId || '-'} InputProps={{ readOnly: true }} fullWidth />

              {captureState === 'duplicate' && (
                <Alert severity="error">هذه البطاقة مرتبطة باللاعب: {captureOwnerName || 'غير معروف'}</Alert>
              )}

              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <Button variant="outlined" onClick={() => void startCapture()} disabled={captureState === 'waiting'}>
                  إعادة المحاولة
                </Button>

                {allowSkip && (
                  <Button
                    variant="text"
                    onClick={() => {
                      captureRequestRef.current += 1;
                      setCardId('');
                      setForm((prev) => ({ ...prev, cardId: '' }));
                      setCaptureState('idle');
                      setCaptureMessage('تم التخطي.');
                    }}
                    disabled={captureState === 'waiting'}
                  >
                    تخطي
                  </Button>
                )}

                {captureState === 'duplicate' && (
                  <Button
                    color="warning"
                    onClick={() => {
                      setCardId('');
                      setForm((prev) => ({ ...prev, cardId: '' }));
                      void startCapture();
                    }}
                  >
                    استخدم بطاقة أخرى
                  </Button>
                )}

                {captureState === 'duplicate' && (
                  <Button color="inherit" onClick={onClose}>
                    إلغاء
                  </Button>
                )}
              </Stack>

              {strictMode && !cardId && (
                <TextField
                  type="password"
                  label="PIN المدير (مطلوب للحفظ بدون بطاقة)"
                  value={managerPinForNoCard}
                  onChange={(event) => setManagerPinForNoCard(event.target.value)}
                />
              )}
            </Stack>
          )}

          <TextField
            label="الاسم الكامل"
            value={form.fullName}
            onChange={(event) => {
              setErrorText(null);
              setForm({ ...form, fullName: event.target.value });
            }}
          />

          <TextField
            label="الهاتف"
            value={form.phone}
            onChange={(event) => {
              setErrorText(null);
              setForm({ ...form, phone: event.target.value });
            }}
          />

          <TextField
            type="date"
            label="تاريخ البداية"
            value={form.startDate}
            InputLabelProps={{ shrink: true }}
            onChange={(event) => {
              setErrorText(null);
              setForm({ ...form, startDate: event.target.value });
            }}
          />

          <TextField
            select
            label="المدة بالأشهر"
            value={form.durationMonths}
            onChange={(event) => {
              setErrorText(null);
              setForm({ ...form, durationMonths: Number(event.target.value) });
            }}
          >
            {[1, 2, 3, 6, 12].map((months) => (
              <MenuItem key={months} value={months}>
                {months}
              </MenuItem>
            ))}
          </TextField>

          {!isCreateMode && (
            <Stack spacing={0.75}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'stretch', sm: 'center' }}>
                <TextField label="رقم البطاقة" value={cardId || '-'} InputProps={{ readOnly: true }} fullWidth />
                <Button variant="outlined" onClick={bindCard} disabled={!member || !onBindCard} sx={{ minWidth: 130 }}>
                  ربط بطاقة
                </Button>
              </Stack>
            </Stack>
          )}

          <TextField
            label="ملاحظات"
            value={form.notes}
            onChange={(event) => {
              setErrorText(null);
              setForm({ ...form, notes: event.target.value });
            }}
            multiline
            rows={3}
          />
        </DialogContent>

        <DialogActions>
          <Button onClick={onClose} disabled={saving}>
            إلغاء
          </Button>
          <Button variant="contained" onClick={save} disabled={saving || Boolean(saveBlockedReason)}>
            {saving ? 'جارٍ الحفظ...' : 'حفظ'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={bindingOpen} onClose={undefined} fullWidth maxWidth="xs">
        <DialogTitle>ربط بطاقة</DialogTitle>
        <DialogContent>
          <Typography>مرّر البطاقة على الجهاز الآن خلال {bindingSecondsLeft} ثوانٍ.</Typography>
        </DialogContent>
      </Dialog>
    </>
  );
}
