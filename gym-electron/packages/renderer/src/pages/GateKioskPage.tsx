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

import type { CheckinDTO, K40ListenerStateDTO, MemberDTO, MemberPayload, RenewalPayload } from '@gym/shared';

import { MemberDialog } from '../components/MemberDialog';
import { RenewMemberDialog } from '../components/RenewMemberDialog';
import { GateProfilePanel } from '../components/gate/GateProfilePanel';
import { LinkCardDialog } from '../components/gate/LinkCardDialog';
import { UnknownCardDialog } from '../components/gate/UnknownCardDialog';
import { api } from '../lib/api';
import { enrollCardWithConflictResolution } from '../lib/card-enrollment';
import { useGymStore } from '../store/useGymStore';

const ltrValueSx = { direction: 'ltr', unicodeBidi: 'plaintext', whiteSpace: 'nowrap' } as const;

function formatDateTime(value: string | null): string {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('en-GB', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed);
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

  const withStrictPinRetry = async <T,>(action: (pin?: string) => Promise<T>, pinPrompt: string): Promise<T> => {
    try {
      return await action(undefined);
    } catch (error) {
      if (!shouldRequestPin(error)) throw error;
      const pin = requestManagerPin(pinPrompt);
      if (!pin) {
        throw new Error('تم إلغاء العملية.');
      }
      return action(pin);
    }
  };

  const assignCardToMemberFlow = async (memberId: number, cardId: string): Promise<void> => {
    const initial = await withStrictPinRetry(
      async (pin) => api.k40.assignCard(memberId, cardId, false, pin),
      'أدخل PIN المدير لإتمام الربط:',
    );

    if (initial.status === 'BOUND') return;

    const owner = initial.currentOwnerName || `#${initial.currentOwnerMemberId ?? '-'}`;
    const shouldTransfer = window.confirm(`هذه البطاقة مرتبطة باللاعب: ${owner}\nهل تريد نقل البطاقة لهذا اللاعب؟`);
    if (!shouldTransfer) {
      throw new Error('تم إلغاء نقل البطاقة.');
    }

    const transferPin = requestManagerPin('نقل البطاقة يتطلب PIN المدير:');
    if (!transferPin) {
      throw new Error('تم إلغاء العملية.');
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

  const handleRenew = async (months: number, startMode: NonNullable<RenewalPayload['startMode']>) => {
    if (!activeMember) return;

    setRenewing(true);
    try {
      const updated = await renewMember({ memberId: activeMember.id, months, startMode });
      await loadDashboard();
      await refreshMember(activeMember.id);

      if (updated.status !== 'Expired') {
        const cardForAllow = updated.cardId || currentEvent?.cardId || '';
        if (cardForAllow) {
          const allowCheckin = await api.k40.recordManualCheckin(updated.id, cardForAllow, 'ALLOW', 'اشتراك ساري بعد التجديد');
          setCurrentEvent(allowCheckin);
          setRecent((prev) => [allowCheckin, ...prev.filter((row) => row.id !== allowCheckin.id)].slice(0, 10));
        }
      }

      enqueueSnackbar('تم تجديد الاشتراك بنجاح', { variant: 'success' });
      setRenewOpen(false);
    } finally {
      setRenewing(false);
    }
  };

  const handleDelete = async () => {
    if (!activeMember || deleting) return;
    if (deleteWord.trim() !== 'حذف') return;

    const managerPin = deletePin.trim();
    if (!managerPin) {
      enqueueSnackbar('PIN المدير مطلوب للحذف.', { variant: 'error' });
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
      enqueueSnackbar('تم حذف اللاعب بنجاح', { variant: 'success' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'تعذر حذف اللاعب';
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
    enqueueSnackbar(`تم ربط البطاقة: ${cardId}`, { variant: 'success' });
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
      enqueueSnackbar('تم ربط البطاقة بنجاح', { variant: 'success' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'تعذر ربط البطاقة';
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
          آخر 10 عمليات مرور
        </Typography>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>الوقت</TableCell>
              <TableCell>الاسم</TableCell>
              <TableCell>رقم البطاقة</TableCell>
              <TableCell>الحالة</TableCell>
              <TableCell>السبب</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {recent.map((row) => (
              <TableRow key={row.id} hover sx={{ backgroundColor: rowColor(row.result) }}>
                <TableCell sx={ltrValueSx}>{formatDateTime(row.checkedAt)}</TableCell>
                <TableCell>{row.memberName || 'غير معروف'}</TableCell>
                <TableCell sx={ltrValueSx}>{row.cardId}</TableCell>
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
                  لا توجد عمليات مرور بعد.
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
          enqueueSnackbar('تم تحديث بيانات اللاعب', { variant: 'success' });
        }}
        onBindCard={activeMember ? bindCard : undefined}
      />

      <Dialog
        open={deleteOpen && Boolean(activeMember)}
        onClose={deleting ? undefined : () => setDeleteOpen(false)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>تأكيد حذف اللاعب</DialogTitle>
        <DialogContent sx={{ display: 'grid', gap: 1.5, pt: 1.5 }}>
          <Typography color="error">
            سيتم حذف اللاعب نهائياً. اكتب كلمة <strong>حذف</strong> ثم أدخل PIN المدير.
          </Typography>
          <TextField
            label="اكتب كلمة حذف"
            value={deleteWord}
            onChange={(event) => setDeleteWord(event.target.value)}
            disabled={deleting}
          />
          <TextField
            label="PIN المدير"
            type="password"
            value={deletePin}
            onChange={(event) => setDeletePin(event.target.value)}
            disabled={deleting}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteOpen(false)} disabled={deleting}>
            إلغاء
          </Button>
          <Button color="error" variant="contained" onClick={handleDelete} disabled={deleting || deleteWord.trim() !== 'حذف'}>
            حذف
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
