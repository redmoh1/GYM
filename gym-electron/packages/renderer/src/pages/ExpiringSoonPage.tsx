import { useEffect, useState } from 'react';

import EditRounded from '@mui/icons-material/EditRounded';
import SyncRounded from '@mui/icons-material/SyncRounded';
import { IconButton, Paper, Stack } from '@mui/material';
import { DataGrid, GridColDef } from '@mui/x-data-grid';
import { useSnackbar } from 'notistack';

import type { MemberDTO, MemberPayload } from '@gym/shared';

import { MemberDialog } from '../components/MemberDialog';
import { RenewMemberDialog } from '../components/RenewMemberDialog';
import { useGymStore } from '../store/useGymStore';

interface Props {
  search: string;
}

export function ExpiringSoonPage({ search }: Props) {
  const { enqueueSnackbar } = useSnackbar();
  const { members, loadMembers, loadDashboard, renewMember, updateMember } = useGymStore();
  const [renewTarget, setRenewTarget] = useState<MemberDTO | null>(null);
  const [renewing, setRenewing] = useState(false);
  const [editing, setEditing] = useState<MemberDTO | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  useEffect(() => {
    void loadMembers({ search, status: 'ExpiringSoon' });
  }, [search, loadMembers]);

  const cols: GridColDef[] = [
    { field: 'id', headerName: 'ID', width: 80 },
    { field: 'fullName', headerName: 'الاسم', flex: 1 },
    { field: 'phone', headerName: 'الهاتف', width: 150 },
    { field: 'endDate', headerName: 'تاريخ النهاية', width: 150 },
    { field: 'daysLeft', headerName: 'متبقي (يوم)', width: 130 },
    {
      field: 'actions',
      headerName: 'إجراءات',
      width: 150,
      sortable: false,
      renderCell: (params) => {
        const row = params.row as MemberDTO;
        return (
          <Stack direction="row" spacing={0.5}>
            <IconButton size="small" color="primary" disabled={renewing} onClick={() => setRenewTarget(row)}>
              <SyncRounded fontSize="small" />
            </IconButton>
            <IconButton
              size="small"
              onClick={() => {
                setEditing(row);
                setEditOpen(true);
              }}
            >
              <EditRounded fontSize="small" />
            </IconButton>
          </Stack>
        );
      },
    },
  ];

  const handleRenew = async (months: number) => {
    if (!renewTarget) return;
    const ok = window.confirm(`هل تريد تجديد اشتراك (${renewTarget.fullName}) لمدة ${months} شهر؟`);
    if (!ok) return;

    setRenewing(true);
    try {
      const updated = await renewMember({ memberId: renewTarget.id, months });
      await loadMembers({ search, status: 'ExpiringSoon' });
      await loadDashboard();
      enqueueSnackbar(`تم تجديد اشتراك اللاعب بنجاح حتى: ${updated.endDate}`, { variant: 'success' });
      setRenewTarget(null);
    } finally {
      setRenewing(false);
    }
  };

  return (
    <Paper sx={{ p: 2, borderRadius: 3, height: '100%' }}>
      <DataGrid rows={[...members].sort((a, b) => a.daysLeft - b.daysLeft)} columns={cols} pageSizeOptions={[10, 25]} />

      <MemberDialog
        open={editOpen}
        member={editing}
        onClose={() => {
          setEditOpen(false);
          setEditing(null);
        }}
        onSubmit={async (payload: MemberPayload) => {
          if (!editing) return;
          await updateMember(editing.id, payload);
          await loadMembers({ search, status: 'ExpiringSoon' });
          await loadDashboard();
          enqueueSnackbar('تم تعديل بيانات اللاعب', { variant: 'success' });
        }}
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
    </Paper>
  );
}
