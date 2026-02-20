import { useEffect } from 'react';

import { Paper, Stack, Typography } from '@mui/material';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { CardWidget } from '../components/CardWidget';
import { useGymStore } from '../store/useGymStore';

export function DashboardPage() {
  const { dashboard, loadDashboard } = useGymStore();

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  if (!dashboard) return null;

  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
        <CardWidget title="نشط" value={dashboard.counters.active} color="success" />
        <CardWidget title="قريب ينتهي" value={dashboard.counters.expiringSoon} color="warning" />
        <CardWidget title="منتهي" value={dashboard.counters.expired} color="error" />
      </Stack>

      <Paper sx={{ p: 2, borderRadius: 3 }}>
        <Typography fontWeight={700} mb={2}>أقرب 10 اشتراكات تنتهي</Typography>
        {dashboard.nearestExpiring.map((m) => (
          <Typography key={m.id} sx={{ py: 0.5 }}>{m.fullName} - {m.endDate} ({m.daysLeft} يوم)</Typography>
        ))}
      </Paper>

      <Paper sx={{ p: 2, borderRadius: 3, height: 280 }}>
        <Typography fontWeight={700} mb={2}>الاشتراكات الشهرية</Typography>
        <ResponsiveContainer width="100%" height="90%">
          <BarChart data={dashboard.monthlyRenewals}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" />
            <YAxis />
            <Tooltip />
            <Bar dataKey="count" fill="#2F6BFF" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Paper>
    </Stack>
  );
}