import { useEffect, useMemo, useState } from 'react';

import AddRounded from '@mui/icons-material/AddRounded';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import ErrorRounded from '@mui/icons-material/ErrorRounded';
import SyncRounded from '@mui/icons-material/SyncRounded';
import WarningAmberRounded from '@mui/icons-material/WarningAmberRounded';
import { Alert, Button, Chip, IconButton, Paper, Stack, Typography } from '@mui/material';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { useSnackbar } from 'notistack';
import { useNavigate } from 'react-router-dom';

import type { MemberDTO, MemberPayload, RenewalPayload } from '@gym/shared';

import { CardWidget } from '../components/CardWidget';
import { MemberDialog } from '../components/MemberDialog';
import { RenewMemberDialog } from '../components/RenewMemberDialog';
import { TopUpSessionsDialog } from '../components/TopUpSessionsDialog';
import { DeleteMemberIcon } from '../components/icons/DeleteMemberIcon';
import { enrollCardWithConflictResolution } from '../lib/card-enrollment';
import { useGymStore } from '../store/useGymStore';

interface Props {
  search?: string;
}

function subscriptionTypeLabel(type: MemberDTO['subscriptionType']): string {
  return type === 'SESSIONS' ? 'حصص' : 'شهري';
}

export function DashboardPage({ search = '' }: Props) {
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const { dashboard, loadDashboard, updateMember, renewMember, topUpSessions, deleteMember } = useGymStore();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<MemberDTO | null>(null);
  const [renewTarget, setRenewTarget] = useState<MemberDTO | null>(null);
  const [renewing, setRenewing] = useState(false);

  const [topUpTarget, setTopUpTarget] = useState<MemberDTO | null>(null);
  const [topUpLoading, setTopUpLoading] = useState(false);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const nearestRows = useMemo(() => {
    if (!dashboard) return [];
    const q = search.trim().toLowerCase();
    const rows = [...dashboard.nearestExpiring].sort((a, b) => a.daysLeft - b.daysLeft);
    if (!q) return rows;
    return rows.filter((m) => m.fullName.toLowerCase().includes(q) || m.phone.includes(q) || m.cardId.includes(q));
  }, [dashboard, search]);

  const cols: GridColDef[] = [
    { field: 'fullName', headerName: 'الاسم', flex: 1, minWidth: 180 },
    {
      field: 'subscriptionType',
      headerName: 'النوع',
      width: 100,
      renderCell: (params) => <Chip size="small" label={subscriptionTypeLabel((params.row as MemberDTO).subscriptionType)} variant="outlined" />,
    },
    {
      field: 'subscriptionInfo',
      headerName: 'التفاصيل',
      minWidth: 220,
      flex: 1,
      sortable: false,
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
      field: 'daysLeft',
      headerName: 'الأيام المتبقية',
      width: 140,
      renderCell: (params) => {
        const row = params.row as MemberDTO;
        if (row.subscriptionType === 'SESSIONS') return <Typography>-</Typography>;
        const days = Number(params.value);
        const color = days <= 3 ? '#DC2626' : days <= 7 ? '#F59E0B' : '#16A34A';
        return <Typography sx={{ color, fontWeight: 800 }}>{days}</Typography>;
      },
    },
    {
      field: 'status',
      headerName: 'الحالة',
      width: 130,
      renderCell: (params) => {
        const status = String(params.value);
        const chipColor = status === 'Expired' ? 'error' : status === 'ExpiringSoon' ? 'warning' : 'success';
        const label = status === 'Expired' ? 'منتهي' : status === 'ExpiringSoon' ? 'قريب ينتهي' : 'ساري';
        return <Chip size="small" label={label} color={chipColor} variant="outlined" />;
      },
    },
    {
      field: 'actions',
      headerName: 'إجراءات',
      width: 180,
      sortable: false,
      filterable: false,
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
                const pin = window.prompt('أدخل PIN المدير للحذف:', '');
                if (!pin?.trim()) return;

                await deleteMember(row.id, pin.trim());
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
      await loadDashboard();
      enqueueSnackbar(`تمت إضافة الحصص. الرصيد الحالي: ${updated.sessionsRemaining ?? 0}`, { variant: 'success' });
      setTopUpTarget(null);
    } finally {
      setTopUpLoading(false);
    }
  };

  const bindCard = async (memberId: number): Promise<string> => {
    const cardId = await enrollCardWithConflictResolution(memberId);
    await loadDashboard();
    enqueueSnackbar(`تم ربط البطاقة: ${cardId}`, { variant: 'success' });
    return cardId;
  };

  if (!dashboard) return null;

  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
        <CardWidget
          title="المشتركون النشطون"
          value={dashboard.counters.active}
          color="success"
          icon={<CheckCircleRounded fontSize="small" />}
          onClick={() => navigate('/members')}
        />
        <CardWidget
          title="قريب ينتهي"
          value={dashboard.counters.expiringSoon}
          color="warning"
          icon={<WarningAmberRounded fontSize="small" />}
          onClick={() => navigate('/expiring')}
        />
        <CardWidget
          title="منتهي"
          value={dashboard.counters.expired}
          color="error"
          icon={<ErrorRounded fontSize="small" />}
          onClick={() => navigate('/expired')}
        />
      </Stack>

      {dashboard.counters.expiringSoon > 0 && (
        <Alert
          severity="warning"
          action={
            <Button color="inherit" size="small" onClick={() => navigate('/expiring')}>
              عرض التفاصيل
            </Button>
          }
        >
          يوجد {dashboard.counters.expiringSoon} اشتراكات ستنتهي خلال 7 أيام
        </Alert>
      )}

      <Paper sx={{ p: 2, borderRadius: 3, minHeight: 460 }}>
        <Typography fontWeight={800} mb={1.5}>
          أقرب 10 اشتراكات تنتهي
        </Typography>
        <DataGrid
          rows={nearestRows}
          columns={cols}
          pageSizeOptions={[10]}
          disableColumnMenu
          disableRowSelectionOnClick
          hideFooter
          sx={{
            border: 0,
            '& .MuiDataGrid-cell': { borderBottom: '1px solid #F1F5F9' },
            '& .MuiDataGrid-row:hover': { backgroundColor: '#F8FAFF' },
          }}
        />
      </Paper>

      <MemberDialog
        open={dialogOpen}
        member={editing}
        onClose={() => {
          setDialogOpen(false);
          setEditing(null);
        }}
        onSubmit={async (payload: MemberPayload) => {
          if (!editing) return;
          await updateMember(editing.id, payload);
          await loadDashboard();
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
    </Stack>
  );
}
