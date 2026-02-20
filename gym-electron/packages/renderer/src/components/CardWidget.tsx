import type { ReactNode } from 'react';

import { Paper, Typography } from '@mui/material';

interface Props {
  title: string;
  value: string | number;
  color: 'success' | 'warning' | 'error';
  icon?: ReactNode;
}

export function CardWidget({ title, value, color, icon }: Props) {
  const border = color === 'success' ? '#16A34A' : color === 'warning' ? '#F59E0B' : '#DC2626';

  return (
    <Paper
      elevation={0}
      sx={{
        p: 2.2,
        borderRadius: 3,
        borderTop: `4px solid ${border}`,
        boxShadow: '0 10px 24px rgba(15,23,42,0.08)',
        minHeight: 124,
      }}
    >
      <Typography color="text.secondary" sx={{ mb: 1 }}>{title}</Typography>
      <Typography variant="h4" fontWeight={800}>{value}</Typography>
      {icon}
    </Paper>
  );
}