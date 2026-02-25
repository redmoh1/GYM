import { useEffect, useState } from 'react';

import {
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { useSnackbar } from 'notistack';
import { useNavigate } from 'react-router-dom';

import type { CheckinDTO, K40ListenerStateDTO, MemberDTO, MemberPayload } from '@gym/shared';

import { MemberDialog } from '../components/MemberDialog';
import { RenewMemberDialog } from '../components/RenewMemberDialog';
import { GateProfilePanel } from '../components/gate/GateProfilePanel';
import { LinkCardDialog } from '../components/gate/LinkCardDialog';
import { UnknownCardDialog } from '../components/gate/UnknownCardDialog';
import { api } from '../lib/api';
import { enrollCardWithConflictResolution } from '../lib/card-enrollment';
import { useGymStore } from '../store/useGymStore';

function formatDateTime(value: string | null): string {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('ar-EG');
}

function rowColor(result: CheckinDTO['result']): string {
  if (result === 'ALLOW') return '#ECFDF3';
  if (result === 'DENY') return '#FEF2F2';
  return '#FFF9E6';
}

function shouldRequestPin(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /pin|strict mode|manager/i.test(message);
}

function requestManagerPin(promptText: string): string | null {
  const value = window.prompt(promptText, '');
  if (!value) return null;
  const normalized = value.trim();
  return normalized || null;
}

export function GateKioskPage() {
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const { renewMember, updateMember, deleteMember, loadDashboard } = useGymStore();

  const [currentEvent, setCurrentEvent] = useState<CheckinDTO | null>(null);
  const [recent, setRecent] = useState<CheckinDTO[]>([]);
  const [listenerState, setListenerState] = useState<K40ListenerStateDTO | null>(null);
  const [activeMember, setActiveMember] = useState<MemberDTO | null>(null);

  const [renewOpen, setRenewOpen] = useState(false);
  const [renewing, setRenewing] = useState(false);

  const [editOpen, setEditOpen] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteWord, setDeleteWord] = useState('');
  const [deletePin, setDeletePin] = useState('');

  const [unknownCardId, setUnknownCardId] = useState<string | null>(null);
  const [pendingCardId, setPendingCardId] = useState<string>('');
  const [createFromUnknownOpen, setCreateFromUnknownOpen] = useState(false);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linking, setLinking] = useState(false);

  const refreshRecent = async (): Promise<void> => {
    const rows = await api.k40.recent(10);
    setRecent(rows);
  };

  const refreshMember = async (memberId: number | null): Promise<void> => {
    if (!memberId) {
      setActiveMember(null);
      return;
    }

    const member = await api.members.get(memberId);
    setActiveMember(member);
  };

  const withStrictPinRetry = async <T,>(
    action: (pin?: string) => Promise<T>,
    pinPrompt: string,
  ): Promise<T> => {
    try {
      return await action(undefined);
    } catch (error) {
      if (!shouldRequestPin(error)) throw error;
      const pin = requestManagerPin(pinPrompt);
      if (!pin) {
        throw new Error('ØªÙ… Ø¥Ù„ØºØ§Ø¡ Ø§Ù„Ø¹Ù…Ù„ÙŠØ©.');
      }
      return action(pin);
    }
  };

  const assignCardToMemberFlow = async (memberId: number, cardId: string): Promise<void> => {
    const initial = await withStrictPinRetry(
      async (pin) => api.k40.assignCard(memberId, cardId, false, pin),
      'Ø£Ø¯Ø®Ù„ PIN Ø§Ù„Ù…Ø¯ÙŠØ± Ù„Ø¥ØªÙ…Ø§Ù… Ø§Ù„Ø±Ø¨Ø·:',
    );

    if (initial.status === 'BOUND') return;

    const owner = initial.currentOwnerName || `#${initial.currentOwnerMemberId ?? '-'}`;
    const shouldTransfer = window.confirm(`Ù‡Ø°Ù‡ Ø§Ù„Ø¨Ø·Ø§Ù‚Ø© Ù…Ø±ØªØ¨Ø·Ø© Ø¨Ø§Ù„Ù„Ø§Ø¹Ø¨: ${owner}\nÙ‡Ù„ ØªØ±ÙŠØ¯ Ù†Ù‚Ù„ Ø§Ù„Ø¨Ø·Ø§Ù‚Ø© Ù„Ù‡Ø°Ø§ Ø§Ù„Ù„Ø§Ø¹Ø¨ØŸ`);
    if (!shouldTransfer) {
      throw new Error('ØªÙ… Ø¥Ù„ØºØ§Ø¡ Ù†Ù‚Ù„ Ø§Ù„Ø¨Ø·Ø§Ù‚Ø©.');
    }

    const transferPin = requestManagerPin('Ù†Ù‚Ù„ Ø§Ù„Ø¨Ø·Ø§Ù‚Ø© ÙŠØªØ·Ù„Ø¨ PIN Ø§Ù„Ù…Ø¯ÙŠØ±:');
    if (!transferPin) {
      throw new Error('ØªÙ… Ø¥Ù„ØºØ§Ø¡ Ø§Ù„Ø¹Ù…Ù„ÙŠØ©.');
    }

    await api.k40.assignCard(memberId, cardId, true, transferPin);
  };

  useEffect(() => {
    void (async () => {
      await refreshRecent();
      const state = await api.k40.state();
      setListenerState(state);
    })();

    const unsubEvent = api.k40.onEvent((event) => {
      setCurrentEvent(event);
      setRecent((prev) => {
        const without = prev.filter((row) => row.id !== event.id);
        return [event, ...without].slice(0, 10);
      });

      if (event.memberId) {
        void refreshMember(event.memberId);
        setUnknownCardId(null);
        setCreateFromUnknownOpen(false);
        setLinkDialogOpen(false);
      } else {
        setActiveMember(null);
        setUnknownCardId(event.cardId);
        setPendingCardId(event.cardId);
      }
    });

    const unsubState = api.k40.onState((state) => {
      setListenerState(state);
    });

    return () => {
      unsubEvent();
      unsubState();
    };
  }, []);

  const handleRenew = async (months: number) => {
    if (!activeMember) return;

    setRenewing(true);
    try {
      const updated = await renewMember({ memberId: activeMember.id, months });
      await loadDashboard();
      await refreshMember(activeMember.id);

      if (updated.status !== 'Expired') {
        const cardForAllow = updated.cardId || currentEvent?.cardId || '';
        if (cardForAllow) {
          const allowCheckin = await api.k40.recordManualCheckin(
            updated.id,
            cardForAllow,
            'ALLOW',
            'Ø§Ø´ØªØ±Ø§Ùƒ Ø³Ø§Ø±ÙŠ Ø¨Ø¹Ø¯ Ø§Ù„ØªØ¬Ø¯ÙŠØ¯',
          );
          setCurrentEvent(allowCheckin);
          setRecent((prev) => [allowCheckin, ...prev.filter((row) => row.id !== allowCheckin.id)].slice(0, 10));
        }
      }

      enqueueSnackbar('ØªÙ… ØªØ¬Ø¯ÙŠØ¯ Ø§Ù„Ø§Ø´ØªØ±Ø§Ùƒ Ø¨Ù†Ø¬Ø§Ø­', { variant: 'success' });
      setRenewOpen(false);
    } finally {
      setRenewing(false);
    }
  };

  const handleDelete = async () => {
    if (!activeMember || deleting) return;
    if (deleteWord.trim() !== 'Ø­Ø°Ù') return;

    const managerPin = deletePin.trim();
    if (!managerPin) {
      enqueueSnackbar('PIN Ø§Ù„Ù…Ø¯ÙŠØ± Ù…Ø·Ù„ÙˆØ¨ Ù„Ù„Ø­Ø°Ù.', { variant: 'error' });
      return;
    }

    setDeleting(true);
    try {
      await deleteMember(activeMember.id, managerPin);
      await loadDashboard();
      await refreshRecent();
      setActiveMember(null);
      setCurrentEvent(null);
      setDeleteOpen(false);
      setDeleteWord('');
      setDeletePin('');
      enqueueSnackbar('ØªÙ… Ø­Ø°Ù Ø§Ù„Ù„Ø§Ø¹Ø¨ Ø¨Ù†Ø¬Ø§Ø­', { variant: 'success' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'ØªØ¹Ø°Ø± Ø­Ø°Ù Ø§Ù„Ù„Ø§Ø¹Ø¨';
      enqueueSnackbar(message, { variant: 'error' });
    } finally {
      setDeleting(false);
    }
  };

  const bindCard = async (memberId: number): Promise<string> => {
    const cardId = await enrollCardWithConflictResolution(memberId);
    await refreshMember(memberId);
    await refreshRecent();
    await loadDashboard();
    enqueueSnackbar(`ØªÙ… Ø±Ø¨Ø· Ø§Ù„Ø¨Ø·Ø§Ù‚Ø©: ${cardId}`, { variant: 'success' });
    return cardId;
  };

  const handleCreateMemberFromUnknown = async (payload: MemberPayload, managerPin?: string): Promise<void> => {
    const effectiveCardId = pendingCardId || payload.cardId || '';
    if (!effectiveCardId) {
      throw new Error('لا يوجد card_id لربطه.');
    }

    const created = await withStrictPinRetry(
      async (pin) => api.members.create({ ...payload, cardId: effectiveCardId }, managerPin ?? pin),
      'تسجيل لاعب جديد يتطلب PIN المدير:',
    );

    await refreshMember(created.id);
    await refreshRecent();
    await loadDashboard();

    setUnknownCardId(null);
    setCreateFromUnknownOpen(false);
    enqueueSnackbar('تم تسجيل اللاعب وربط البطاقة بنجاح', { variant: 'success' });
  };

  const handleLinkUnknownToExisting = async (memberId: number): Promise<void> => {
    if (!pendingCardId) return;

    setLinking(true);
    try {
      await assignCardToMemberFlow(memberId, pendingCardId);
      await refreshMember(memberId);
      await refreshRecent();
      await loadDashboard();
      setUnknownCardId(null);
      setLinkDialogOpen(false);
      enqueueSnackbar('ØªÙ… Ø±Ø¨Ø· Ø§Ù„Ø¨Ø·Ø§Ù‚Ø© Ø¨Ù†Ø¬Ø§Ø­', { variant: 'success' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'ØªØ¹Ø°Ø± Ø±Ø¨Ø· Ø§Ù„Ø¨Ø·Ø§Ù‚Ø©';
      enqueueSnackbar(message, { variant: 'error' });
    } finally {
      setLinking(false);
    }
  };

  return (
    <Stack spacing={2} sx={{ height: '100%' }}>
      <GateProfilePanel
        event={currentEvent}
        member={activeMember}
        listenerState={listenerState}
        onRenew={() => setRenewOpen(true)}
        onEdit={() => setEditOpen(true)}
        onDelete={() => setDeleteOpen(true)}
        onViewProfile={() => {
          if (!activeMember) return;
          navigate(`/member/${activeMember.id}`);
        }}
      />

      <Paper sx={{ p: 2, borderRadius: 3, flex: 1, minHeight: 320 }}>
        <Typography fontWeight={800} mb={1.5}>
          Ø¢Ø®Ø± 10 Ø¹Ù…Ù„ÙŠØ§Øª Ù…Ø±ÙˆØ±
        </Typography>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Ø§Ù„ÙˆÙ‚Øª</TableCell>
              <TableCell>Ø§Ù„Ø§Ø³Ù…</TableCell>
              <TableCell>Ø±Ù‚Ù… Ø§Ù„Ø¨Ø·Ø§Ù‚Ø©</TableCell>
              <TableCell>Ø§Ù„Ø­Ø§Ù„Ø©</TableCell>
              <TableCell>Ø§Ù„Ø³Ø¨Ø¨</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {recent.map((row) => (
              <TableRow key={row.id} hover sx={{ backgroundColor: rowColor(row.result) }}>
                <TableCell>{formatDateTime(row.checkedAt)}</TableCell>
                <TableCell>{row.memberName || 'ØºÙŠØ± Ù…Ø¹Ø±ÙˆÙ'}</TableCell>
                <TableCell>{row.cardId}</TableCell>
                <TableCell>
                  <Chip
                    size="small"
                    label={row.result}
                    color={row.result === 'ALLOW' ? 'success' : row.result === 'DENY' ? 'error' : 'warning'}
                  />
                </TableCell>
                <TableCell>{row.reason}</TableCell>
              </TableRow>
            ))}
            {recent.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} align="center">
                  Ù„Ø§ ØªÙˆØ¬Ø¯ Ø¹Ù…Ù„ÙŠØ§Øª Ù…Ø±ÙˆØ± Ø¨Ø¹Ø¯.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Paper>

      <RenewMemberDialog
        open={renewOpen && Boolean(activeMember)}
        memberName={activeMember?.fullName ?? ''}
        loading={renewing}
        onClose={() => {
          if (!renewing) setRenewOpen(false);
        }}
        onConfirm={handleRenew}
      />

      <MemberDialog
        open={editOpen && Boolean(activeMember)}
        member={activeMember}
        onClose={() => setEditOpen(false)}
        onSubmit={async (payload: MemberPayload) => {
          if (!activeMember) return;
          await updateMember(activeMember.id, payload);
          await loadDashboard();
          await refreshMember(activeMember.id);
          enqueueSnackbar('ØªÙ… ØªØ­Ø¯ÙŠØ« Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„Ù„Ø§Ø¹Ø¨', { variant: 'success' });
        }}
        onBindCard={activeMember ? bindCard : undefined}
      />

      <Dialog
        open={deleteOpen && Boolean(activeMember)}
        onClose={deleting ? undefined : () => setDeleteOpen(false)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>ØªØ£ÙƒÙŠØ¯ Ø­Ø°Ù Ø§Ù„Ù„Ø§Ø¹Ø¨</DialogTitle>
        <DialogContent sx={{ display: 'grid', gap: 1.5, pt: 1.5 }}>
          <Typography color="error">
            Ø³ÙŠØªÙ… Ø­Ø°Ù Ø§Ù„Ù„Ø§Ø¹Ø¨ Ù†Ù‡Ø§Ø¦ÙŠØ§Ù‹. Ø§ÙƒØªØ¨ ÙƒÙ„Ù…Ø© <strong>Ø­Ø°Ù</strong> Ø«Ù… Ø£Ø¯Ø®Ù„ PIN Ø§Ù„Ù…Ø¯ÙŠØ±.
          </Typography>
          <TextField
            label="Ø§ÙƒØªØ¨ ÙƒÙ„Ù…Ø© Ø­Ø°Ù"
            value={deleteWord}
            onChange={(event) => setDeleteWord(event.target.value)}
            disabled={deleting}
          />
          <TextField
            label="PIN Ø§Ù„Ù…Ø¯ÙŠØ±"
            type="password"
            value={deletePin}
            onChange={(event) => setDeletePin(event.target.value)}
            disabled={deleting}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteOpen(false)} disabled={deleting}>
            Ø¥Ù„ØºØ§Ø¡
          </Button>
          <Button color="error" variant="contained" onClick={handleDelete} disabled={deleting || deleteWord.trim() !== 'Ø­Ø°Ù'}>
            Ø­Ø°Ù
          </Button>
        </DialogActions>
      </Dialog>

      <UnknownCardDialog
        open={Boolean(unknownCardId)}
        cardId={unknownCardId ?? ''}
        onCreateMember={() => {
          if (!unknownCardId) return;
          setPendingCardId(unknownCardId);
          setUnknownCardId(null);
          setCreateFromUnknownOpen(true);
        }}
        onLinkExisting={() => {
          if (!unknownCardId) return;
          setPendingCardId(unknownCardId);
          setUnknownCardId(null);
          setLinkDialogOpen(true);
        }}
        onCancel={() => setUnknownCardId(null)}
      />

      <MemberDialog
        open={createFromUnknownOpen}
        initialCardId={pendingCardId}
        onClose={() => setCreateFromUnknownOpen(false)}
        onSubmit={handleCreateMemberFromUnknown}
      />

      <LinkCardDialog
        open={linkDialogOpen}
        cardId={pendingCardId}
        loading={linking}
        onCancel={() => setLinkDialogOpen(false)}
        onLink={handleLinkUnknownToExisting}
      />
    </Stack>
  );
}
