import type { ReactNode } from 'react';

import { Paper, Typography } from '@mui/material';

interface Props {
  title: string;
  value: string | number;
  color: 'success' | 'warning' | 'error';
  icon?: ReactNode;
  onClick?: () => void;
}

export function CardWidget({ title, value, color, icon, onClick }: Props) {
  const palette = color === 'success'
    ? { border: '#16A34A', bg: '#F0FDF4' }
    : color === 'warning'
      ? { border: '#F59E0B', bg: '#FFF7ED' }
      : { border: '#DC2626', bg: '#FEF2F2' };

  return (
    <Paper
      elevation={0}
      sx={{
        p: 2.4,
        borderRadius: 3,
        border: `1px solid ${palette.border}33`,
        backgroundColor: palette.bg,
        boxShadow: '0 10px 24px rgba(15,23,42,0.08)',
        minHeight: 132,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'transform 140ms ease, box-shadow 140ms ease',
        '&:hover': onClick ? { transform: 'translateY(-2px)', boxShadow: '0 14px 30px rgba(15,23,42,0.12)' } : undefined,
      }}
      onClick={onClick}
    >
      <Typography color="text.secondary" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
        {icon}
        {title}
      </Typography>
      <Typography variant="h3" fontWeight={800}>{value}</Typography>
    </Paper>
  );
}
