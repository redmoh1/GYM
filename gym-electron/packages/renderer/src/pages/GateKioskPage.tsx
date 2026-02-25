import { useEffect, useMemo, useRef, useState } from 'react';

import {
  Avatar,
  Box,
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
import { api } from '../lib/api';
import { enrollCardWithConflictResolution } from '../lib/card-enrollment';
import { useGymStore } from '../store/useGymStore';

const MANAGER_PIN = '1234';

function statusLabel(result: CheckinDTO['result'] | 'WAITING'): string {
  if (result === 'ALLOW') return 'ALLOW';
  if (result === 'DENY') return 'DENY';
  if (result === 'UNKNOWN') return 'UNKNOWN';
  return 'WAITING';
}

function statusColor(result: CheckinDTO['result'] | 'WAITING'): 'success' | 'error' | 'warning' | 'default' {
  if (result === 'ALLOW') return 'success';
  if (result === 'DENY') return 'error';
  if (result === 'UNKNOWN') return 'warning';
  return 'default';
}

function subscriptionLabel(status: MemberDTO['status'] | null): string {
  if (!status) return '-';
  if (status === 'Active') return 'ساري';
  if (status === 'ExpiringSoon') return 'قريب ينتهي';
  return 'منتهي';
}

function formatDateTime(value: string | null): string {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('ar-EG');
}

function toFileUrl(pathValue: string): string | undefined {
  if (!pathValue) return undefined;
  return `file:///${pathValue.replace(/\\/g, '/')}`;
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

  const timerRef = useRef<number | null>(null);

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
      void refreshMember(event.memberId);

      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
      }
      timerRef.current = window.setTimeout(() => {
        setCurrentEvent(null);
      }, 3000);
    });

    const unsubState = api.k40.onState((state) => {
      setListenerState(state);
    });

    return () => {
      unsubEvent();
      unsubState();
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  const latestStatus = currentEvent?.result ?? 'WAITING';
  const avatarSrc = activeMember?.photoPath ? toFileUrl(activeMember.photoPath) : undefined;

  const latestEndDate = activeMember?.endDate ?? currentEvent?.memberEndDate ?? null;
  const latestDaysLeft =
    activeMember?.daysLeft ?? (currentEvent?.daysLeft !== undefined ? currentEvent.daysLeft : null);

  const deleteAllowed = deleteWord.trim() === 'حذف' || deletePin.trim() === MANAGER_PIN;

  const handleRenew = async (months: number) => {
    if (!activeMember) return;
    const ok = window.confirm(`هل تريد تجديد اشتراك (${activeMember.fullName}) لمدة ${months} شهر؟`);
    if (!ok) return;

    setRenewing(true);
    try {
      const updated = await renewMember({ memberId: activeMember.id, months });
      await loadDashboard();
      await refreshMember(activeMember.id);
      enqueueSnackbar(`تم تجديد الاشتراك حتى ${updated.endDate}`, { variant: 'success' });
      setRenewOpen(false);
    } finally {
      setRenewing(false);
    }
  };

  const handleDelete = async () => {
    if (!activeMember || !deleteAllowed || deleting) return;
    setDeleting(true);
    try {
      await deleteMember(activeMember.id);
      await loadDashboard();
      await refreshRecent();
      setActiveMember(null);
      setCurrentEvent(null);
      setDeleteOpen(false);
      setDeleteWord('');
      setDeletePin('');
      enqueueSnackbar('تم حذف اللاعب بنجاح', { variant: 'success' });
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

  const actionDisabled = !activeMember;

  const listenerText = useMemo(() => {
    if (!listenerState) return 'غير متاح';
    return `${listenerState.connected ? 'متصل' : 'غير متصل'} - ${listenerState.status}`;
  }, [listenerState]);

  return (
    <Stack spacing={2} sx={{ height: '100%' }}>
      <Paper sx={{ p: 2.5, borderRadius: 3 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ xs: 'flex-start', md: 'center' }}>
          <Avatar
            src={avatarSrc}
            variant="rounded"
            sx={{ width: 150, height: 150, bgcolor: '#F1F5F9', color: '#64748B', fontWeight: 800, fontSize: 18 }}
          >
            {activeMember?.fullName ? activeMember.fullName.slice(0, 1) : '?'}
          </Avatar>

          <Box sx={{ flex: 1 }}>
            <Stack direction="row" spacing={1} alignItems="center" mb={1.5} flexWrap="wrap" useFlexGap>
              <Typography variant="h5" fontWeight={900}>
                Gate / Reception
              </Typography>
              <Chip label={statusLabel(latestStatus)} color={statusColor(latestStatus)} sx={{ fontWeight: 800 }} />
              <Chip label={subscriptionLabel(activeMember?.status ?? null)} variant="outlined" />
            </Stack>

            <Stack spacing={0.75}>
              <Typography><strong>الاسم:</strong> {activeMember?.fullName || currentEvent?.memberName || 'غير معروف'}</Typography>
              <Typography><strong>الهاتف:</strong> {activeMember?.phone || currentEvent?.memberPhone || '-'}</Typography>
              <Typography><strong>رقم البطاقة:</strong> {currentEvent?.cardId || activeMember?.cardId || '-'}</Typography>
              <Typography><strong>تاريخ الانتهاء:</strong> {latestEndDate ? formatDateTime(latestEndDate) : '-'}</Typography>
              <Typography><strong>الأيام المتبقية:</strong> {latestDaysLeft ?? '-'}</Typography>
              <Typography><strong>السبب:</strong> {currentEvent?.reason || 'بانتظار تمرير بطاقة...'}</Typography>
              <Typography color="text.secondary">
                <strong>آخر عملية:</strong> {currentEvent ? formatDateTime(currentEvent.checkedAt) : 'بانتظار تمرير بطاقة...'}
              </Typography>
              <Typography color="text.secondary">
                <strong>حالة الجهاز:</strong> {listenerText}
              </Typography>
            </Stack>

            <Stack direction="row" spacing={1} mt={2} flexWrap="wrap" useFlexGap>
              <Button variant="contained" onClick={() => setRenewOpen(true)} disabled={actionDisabled}>
                تجديد
              </Button>
              <Button variant="outlined" onClick={() => setEditOpen(true)} disabled={actionDisabled}>
                تعديل
              </Button>
              <Button variant="outlined" color="error" onClick={() => setDeleteOpen(true)} disabled={actionDisabled}>
                حذف
              </Button>
              <Button
                variant="outlined"
                onClick={() => {
                  if (!activeMember) return;
                  navigate(`/member/${activeMember.id}`);
                }}
                disabled={actionDisabled}
              >
                عرض الملف
              </Button>
            </Stack>
          </Box>
        </Stack>
      </Paper>

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
              <TableRow key={row.id} hover>
                <TableCell>{formatDateTime(row.checkedAt)}</TableCell>
                <TableCell>{row.memberName || 'غير معروف'}</TableCell>
                <TableCell>{row.cardId}</TableCell>
                <TableCell>
                  <Chip size="small" label={row.result} color={statusColor(row.result)} />
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

      <Dialog open={deleteOpen && Boolean(activeMember)} onClose={deleting ? undefined : () => setDeleteOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>تأكيد حذف اللاعب</DialogTitle>
        <DialogContent sx={{ display: 'grid', gap: 1.5, pt: 1.5 }}>
          <Typography color="error">
            سيتم حذف اللاعب نهائياً. للتأكيد اكتب كلمة <strong>حذف</strong> أو أدخل PIN المدير.
          </Typography>
          <TextField
            label="اكتب كلمة حذف"
            value={deleteWord}
            onChange={(e) => setDeleteWord(e.target.value)}
            disabled={deleting}
          />
          <TextField
            label="PIN المدير"
            value={deletePin}
            onChange={(e) => setDeletePin(e.target.value)}
            disabled={deleting}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteOpen(false)} disabled={deleting}>
            إلغاء
          </Button>
          <Button color="error" variant="contained" onClick={handleDelete} disabled={!deleteAllowed || deleting}>
            حذف
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

