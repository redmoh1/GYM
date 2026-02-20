import { useEffect, useMemo, useState } from 'react';

import DeleteRounded from '@mui/icons-material/DeleteRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import PictureAsPdfRounded from '@mui/icons-material/PictureAsPdfRounded';
import SaveAltRounded from '@mui/icons-material/SaveAltRounded';
import { Box, IconButton, MenuItem, Paper, Select, Stack } from '@mui/material';
import { DataGrid, GridColDef } from '@mui/x-data-grid';
import { useSnackbar } from 'notistack';

import type { MemberDTO } from '@gym/shared';

import { MemberDialog } from '../components/MemberDialog';
import { api } from '../lib/api';
import { useGymStore } from '../store/useGymStore';

interface Props { search: string }

export function MembersPage({ search }: Props) {
  const { enqueueSnackbar } = useSnackbar();
  const { members, loadMembers, createMember, updateMember, deleteMember } = useGymStore();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<MemberDTO | null>(null);
  const [status, setStatus] = useState<'All' | 'Active' | 'ExpiringSoon' | 'Expired'>('All');

  useEffect(() => {
    void loadMembers({ search, status });
  }, [search, status, loadMembers]);

  const rows = useMemo(() => members, [members]);

  const cols: GridColDef[] = [
    { field: 'id', headerName: 'ID', width: 80 },
    { field: 'fullName', headerName: 'الاسم', flex: 1, minWidth: 180 },
    { field: 'phone', headerName: 'الهاتف', width: 140 },
    { field: 'startDate', headerName: 'البداية', width: 120 },
    { field: 'endDate', headerName: 'النهاية', width: 120 },
    { field: 'status', headerName: 'الحالة', width: 140 },
    { field: 'daysLeft', headerName: 'المتبقي', width: 110 },
    {
      field: 'actions',
      headerName: 'إجراءات',
      width: 120,
      sortable: false,
      renderCell: (params) => (
        <Stack direction="row" spacing={1}>
          <IconButton size="small" onClick={() => { setEditing(params.row as MemberDTO); setDialogOpen(true); }}>
            <EditRounded fontSize="small" />
          </IconButton>
          <IconButton
            size="small"
            color="error"
            onClick={async () => {
              await deleteMember((params.row as MemberDTO).id);
              await loadMembers({ search, status });
              enqueueSnackbar('تم حذف اللاعب', { variant: 'success' });
            }}
          >
            <DeleteRounded fontSize="small" />
          </IconButton>
        </Stack>
      ),
    },
  ];

  return (
    <Paper sx={{ p: 2, borderRadius: 3, height: '100%' }}>
      <Stack direction="row" spacing={1} mb={1.5}>
        <Select size="small" value={status} onChange={(e) => setStatus(e.target.value as any)}>
          <MenuItem value="All">الكل</MenuItem>
          <MenuItem value="Active">ساري</MenuItem>
          <MenuItem value="ExpiringSoon">قريب ينتهي</MenuItem>
          <MenuItem value="Expired">منتهي</MenuItem>
        </Select>

        <Box sx={{ flex: 1 }} />

        <IconButton onClick={async () => { await api.exportExcel(); enqueueSnackbar('تم التصدير Excel', { variant: 'success' }); }}>
          <SaveAltRounded />
        </IconButton>
        <IconButton onClick={async () => { await api.exportPdf(); enqueueSnackbar('تم التصدير PDF', { variant: 'success' }); }}>
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
        onClose={() => { setDialogOpen(false); setEditing(null); }}
        onSubmit={async (payload) => {
          if (editing) await updateMember(editing.id, payload);
          else await createMember(payload);
          await loadMembers({ search, status });
          enqueueSnackbar('تم حفظ البيانات', { variant: 'success' });
        }}
      />
    </Paper>
  );
}
