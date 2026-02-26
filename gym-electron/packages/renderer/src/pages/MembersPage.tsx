import { useEffect, useMemo, useState } from 'react';

import AddRounded from '@mui/icons-material/AddRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import PictureAsPdfRounded from '@mui/icons-material/PictureAsPdfRounded';
import SaveAltRounded from '@mui/icons-material/SaveAltRounded';
import SyncRounded from '@mui/icons-material/SyncRounded';
import { Box, Chip, IconButton, MenuItem, Paper, Select, Stack, Typography } from '@mui/material';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { useSnackbar } from 'notistack';

import type { MemberDTO, RenewalPayload } from '@gym/shared';

import { MemberDialog } from '../components/MemberDialog';
import { RenewMemberDialog } from '../components/RenewMemberDialog';
import { TopUpSessionsDialog } from '../components/TopUpSessionsDialog';
import { DeleteMemberIcon } from '../components/icons/DeleteMemberIcon';
import { api } from '../lib/api';
import { enrollCardWithConflictResolution } from '../lib/card-enrollment';
import { useGymStore } from '../store/useGymStore';

interface Props {
  search: string;
}

function shouldRequestPin(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /pin|strict mode|manager/i.test(message);
}

function promptPin(label: string): string | null {
  const raw = window.prompt(label, '');
  if (!raw) return null;
  const normalized = raw.trim();
  return normalized || null;
}

function subscriptionTypeLabel(type: MemberDTO['subscriptionType']): string {
  return type === 'SESSIONS' ? 'اشتراك بالحصص' : 'اشتراك شهري';
}

function statusLabel(status: MemberDTO['status']): string {
  if (status === 'Active') return 'ساري';
  if (status === 'ExpiringSoon') return 'قريب ينتهي';
  return 'منتهي';
}

export function MembersPage({ search }: Props) {
  const { enqueueSnackbar } = useSnackbar();
  const { members, loadMembers, loadDashboard, createMember, updateMember, deleteMember, renewMember, topUpSessions } = useGymStore();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<MemberDTO | null>(null);
  const [status, setStatus] = useState<'All' | 'Active' | 'ExpiringSoon' | 'Expired'>('All');

  const [renewTarget, setRenewTarget] = useState<MemberDTO | null>(null);
  const [renewing, setRenewing] = useState(false);

  const [topUpTarget, setTopUpTarget] = useState<MemberDTO | null>(null);
  const [topUpLoading, setTopUpLoading] = useState(false);

  useEffect(() => {
    void loadMembers({ search, status });
  }, [search, status, loadMembers]);

  const rows = useMemo(() => members, [members]);

  const cols: GridColDef[] = [
    { field: 'id', headerName: 'ID', width: 80 },
    { field: 'fullName', headerName: 'الاسم', flex: 1, minWidth: 180 },
    { field: 'phone', headerName: 'الهاتف', width: 140 },
    { field: 'cardId', headerName: 'رقم البطاقة', width: 160 },
    {
      field: 'subscriptionType',
      headerName: 'نوع الاشتراك',
      width: 165,
      renderCell: (params) => <Chip size="small" label={subscriptionTypeLabel(params.row.subscriptionType)} variant="outlined" />,
    },
    {
      field: 'subscriptionInfo',
      headerName: 'تفاصيل الاشتراك',
      minWidth: 260,
      flex: 1,
      sortable: false,
      valueGetter: (_, row: MemberDTO) => {
        if (row.subscriptionType === 'MONTHLY') return `حتى ${row.endDate}`;
        const remaining = Number(row.sessionsRemaining ?? 0);
        const total = Number(row.sessionsTotal ?? 0);
        return `${remaining} / ${total}`;
      },
      renderCell: (params) => {
        const row = params.row as MemberDTO;
        if (row.subscriptionType === 'MONTHLY') {
          return <Typography variant="body2">ينتهي: {row.endDate}</Typography>;
        }

        const remaining = Number(row.sessionsRemaining ?? 0);
        const total = Number(row.sessionsTotal ?? 0);
        const color = remaining <= 0 ? 'error.main' : remaining <= 3 ? 'warning.main' : 'text.primary';
        return (
          <Stack>
            <Typography variant="body2" sx={{ color, fontWeight: 800 }}>
              المتبقي {remaining} / {total}
            </Typography>
            {row.sessionsExpiryDate && <Typography variant="caption">الصلاحية: {row.sessionsExpiryDate}</Typography>}
          </Stack>
        );
      },
    },
    {
      field: 'status',
      headerName: 'الحالة',
      width: 140,
      renderCell: (params) => {
        const row = params.row as MemberDTO;
        const chipColor = row.status === 'Expired' ? 'error' : row.status === 'ExpiringSoon' ? 'warning' : 'success';
        return <Chip size="small" label={statusLabel(row.status)} color={chipColor} variant="outlined" />;
      },
    },
    {
      field: 'daysLeft',
      headerName: 'المتبقي',
      width: 110,
      renderCell: (params) => {
        const row = params.row as MemberDTO;
        if (row.subscriptionType === 'SESSIONS') return <Typography variant="body2">-</Typography>;
        return <Typography variant="body2">{row.daysLeft}</Typography>;
      },
    },
    {
      field: 'actions',
      headerName: 'إجراءات',
      width: 180,
      sortable: false,
      renderCell: (params) => {
        const row = params.row as MemberDTO;
        const isSessions = row.subscriptionType === 'SESSIONS';
        return (
          <Stack direction="row" spacing={0.5}>
            <IconButton
              size="small"
              color="primary"
              disabled={renewing || topUpLoading}
              onClick={() => {
                if (isSessions) setTopUpTarget(row);
                else setRenewTarget(row);
              }}
            >
              {isSessions ? <AddRounded fontSize="small" /> : <SyncRounded fontSize="small" />}
            </IconButton>
            <IconButton
              size="small"
              onClick={() => {
                setEditing(row);
                setDialogOpen(true);
              }}
            >
              <EditRounded fontSize="small" />
            </IconButton>
            <IconButton
              size="small"
              color="error"
              onClick={async () => {
                if (!window.confirm(`حذف اللاعب: ${row.fullName}؟`)) return;
                const pin = promptPin('أدخل PIN المدير للحذف:');
                if (!pin) return;

                await deleteMember(row.id, pin);
                await loadMembers({ search, status });
                await loadDashboard();
                enqueueSnackbar('تم حذف اللاعب', { variant: 'success' });
              }}
            >
              <DeleteMemberIcon fontSize="small" />
            </IconButton>
          </Stack>
        );
      },
    },
  ];

  const handleRenew = async (months: number, startMode: NonNullable<RenewalPayload['startMode']>) => {
    if (!renewTarget) return;
    const ok = window.confirm(`هل تريد تجديد اشتراك (${renewTarget.fullName}) لمدة ${months} شهر؟`);
    if (!ok) return;

    setRenewing(true);
    try {
      const updated = await renewMember({ memberId: renewTarget.id, months, startMode });
      await loadMembers({ search, status });
      await loadDashboard();
      enqueueSnackbar(`تم تجديد اشتراك اللاعب بنجاح حتى: ${updated.endDate}`, { variant: 'success' });
      setRenewTarget(null);
    } finally {
      setRenewing(false);
    }
  };

  const handleTopUp = async (sessionsToAdd: number) => {
    if (!topUpTarget) return;
    setTopUpLoading(true);
    try {
      const updated = await topUpSessions({ memberId: topUpTarget.id, sessionsToAdd });
      await loadMembers({ search, status });
      await loadDashboard();
      enqueueSnackbar(`تمت إضافة الحصص. الرصيد الحالي: ${updated.sessionsRemaining ?? 0}`, { variant: 'success' });
      setTopUpTarget(null);
    } finally {
      setTopUpLoading(false);
    }
  };

  const bindCard = async (memberId: number): Promise<string> => {
    const cardId = await enrollCardWithConflictResolution(memberId);
    await loadMembers({ search, status });
    await loadDashboard();
    enqueueSnackbar(`تم ربط البطاقة: ${cardId}`, { variant: 'success' });
    return cardId;
  };

  return (
    <Paper sx={{ p: 2, borderRadius: 3, height: '100%' }}>
      <Stack direction="row" spacing={1} mb={1.5}>
        <Select size="small" value={status} onChange={(e) => setStatus(e.target.value as 'All' | 'Active' | 'ExpiringSoon' | 'Expired')}>
          <MenuItem value="All">الكل</MenuItem>
          <MenuItem value="Active">ساري</MenuItem>
          <MenuItem value="ExpiringSoon">قريب ينتهي</MenuItem>
          <MenuItem value="Expired">منتهي</MenuItem>
        </Select>

        <Box sx={{ flex: 1 }} />

        <IconButton
          onClick={async () => {
            await api.exportExcel();
            enqueueSnackbar('تم التصدير Excel', { variant: 'success' });
          }}
        >
          <SaveAltRounded />
        </IconButton>
        <IconButton
          onClick={async () => {
            await api.exportPdf();
            enqueueSnackbar('تم التصدير PDF', { variant: 'success' });
          }}
        >
          <PictureAsPdfRounded />
        </IconButton>
      </Stack>

      <DataGrid
        rows={rows}
        columns={cols}
        pageSizeOptions={[10, 25, 50]}
        disableRowSelectionOnClick
        getRowClassName={(params) => `row-status-${params.row.status}`}
        sx={{
          border: 0,
          '& .MuiDataGrid-row:hover': { backgroundColor: '#F8FAFF' },
          '& .MuiDataGrid-cell': { borderBottom: '1px solid #F1F5F9' },
          '& .row-status-Active': { backgroundColor: '#F0FDF4' },
          '& .row-status-ExpiringSoon': { backgroundColor: '#FFF7ED' },
          '& .row-status-Expired': { backgroundColor: '#FEF2F2' },
        }}
      />

      <MemberDialog
        open={dialogOpen}
        member={editing}
        onClose={() => {
          setDialogOpen(false);
          setEditing(null);
        }}
        onSubmit={async (payload, managerPin) => {
          if (editing) {
            await updateMember(editing.id, payload);
          } else {
            try {
              await createMember(payload, managerPin);
            } catch (error) {
              if (!shouldRequestPin(error)) throw error;
              const pin = promptPin('تسجيل لاعب جديد يتطلب PIN المدير:');
              if (!pin) return;
              await createMember(payload, pin);
            }
          }

          await loadMembers({ search, status });
          await loadDashboard();
          enqueueSnackbar('تم حفظ البيانات', { variant: 'success' });
        }}
        onBindCard={editing ? bindCard : undefined}
      />

      <RenewMemberDialog
        open={Boolean(renewTarget)}
        memberName={renewTarget?.fullName ?? ''}
        loading={renewing}
        onClose={() => {
          if (!renewing) setRenewTarget(null);
        }}
        onConfirm={handleRenew}
      />

      <TopUpSessionsDialog
        open={Boolean(topUpTarget)}
        memberName={topUpTarget?.fullName ?? ''}
        loading={topUpLoading}
        onClose={() => {
          if (!topUpLoading) setTopUpTarget(null);
        }}
        onConfirm={handleTopUp}
      />
    </Paper>
  );
}
