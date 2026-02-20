import { useEffect, useState } from 'react';

import { Button, MenuItem, Paper, Select, Stack, Typography } from '@mui/material';
import { DataGrid, GridColDef } from '@mui/x-data-grid';
import { useSnackbar } from 'notistack';

import { useGymStore } from '../store/useGymStore';

interface Props { search: string }

export function RenewalsPage({ search }: Props) {
  const { enqueueSnackbar } = useSnackbar();
  const { members, loadMembers, renewMember } = useGymStore();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [months, setMonths] = useState(1);

  useEffect(() => {
    void loadMembers({ search });
  }, [search, loadMembers]);

  const cols: GridColDef[] = [
    { field: 'id', headerName: 'ID', width: 80 },
    { field: 'fullName', headerName: 'الاسم', flex: 1 },
    { field: 'endDate', headerName: 'النهاية الحالية', width: 160 },
    { field: 'status', headerName: 'الحالة', width: 140 },
  ];

  return (
    <Stack spacing={2} sx={{ height: '100%' }}>
      <Paper sx={{ p: 2, borderRadius: 3 }}>
        <Stack direction="row" spacing={2} alignItems="center">
          <Typography>عدد الأشهر:</Typography>
          <Select size="small" value={months} onChange={(e) => setMonths(Number(e.target.value))}>
            {[1, 2, 3, 6, 12].map((m) => (<MenuItem key={m} value={m}>{m}</MenuItem>))}
          </Select>
          <Button
            variant="contained"
            onClick={async () => {
              if (!selectedId) return;
              await renewMember({ memberId: selectedId, months });
              await loadMembers({ search });
              enqueueSnackbar('تم التجديد بنجاح', { variant: 'success' });
            }}
          >
            تجديد الاشتراك
          </Button>
        </Stack>
      </Paper>

      <Paper sx={{ p: 2, borderRadius: 3, height: '100%' }}>
        <DataGrid rows={members} columns={cols} pageSizeOptions={[10, 25]} onRowSelectionModelChange={(ids) => setSelectedId(Number(ids[0] ?? 0) || null)} />
      </Paper>
    </Stack>
  );
}