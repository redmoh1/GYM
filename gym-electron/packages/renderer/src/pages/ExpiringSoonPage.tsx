import { useEffect } from 'react';

import { Paper } from '@mui/material';
import { DataGrid, GridColDef } from '@mui/x-data-grid';

import { useGymStore } from '../store/useGymStore';

interface Props { search: string }

export function ExpiringSoonPage({ search }: Props) {
  const { members, loadMembers } = useGymStore();

  useEffect(() => {
    void loadMembers({ search, status: 'ExpiringSoon' });
  }, [search, loadMembers]);

  const cols: GridColDef[] = [
    { field: 'id', headerName: 'ID', width: 80 },
    { field: 'fullName', headerName: 'الاسم', flex: 1 },
    { field: 'phone', headerName: 'الهاتف', width: 150 },
    { field: 'endDate', headerName: 'تاريخ النهاية', width: 150 },
    { field: 'daysLeft', headerName: 'متبقي (يوم)', width: 130 },
  ];

  return (
    <Paper sx={{ p: 2, borderRadius: 3, height: '100%' }}>
      <DataGrid rows={[...members].sort((a, b) => a.daysLeft - b.daysLeft)} columns={cols} pageSizeOptions={[10, 25]} />
    </Paper>
  );
}