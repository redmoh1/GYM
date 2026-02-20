import { format } from 'date-fns';

import type { DashboardDTO } from '@gym/shared';

import { prisma } from '../db/client';
import { listMembers } from './member.service';

export async function getDashboard(): Promise<DashboardDTO> {
  const members = await listMembers({});

  const counters = {
    active: members.filter((m) => m.status === 'Active').length,
    expiringSoon: members.filter((m) => m.status === 'ExpiringSoon').length,
    expired: members.filter((m) => m.status === 'Expired').length,
    total: members.length,
  };

  const nearestExpiring = [...members]
    .filter((m) => m.status !== 'Expired')
    .sort((a, b) => a.daysLeft - b.daysLeft)
    .slice(0, 10);

  const payments = await prisma.payment.findMany({
    orderBy: { paidAt: 'asc' },
    take: 120,
  });

  const grouped = new Map<string, number>();
  for (const p of payments) {
    const key = format(p.paidAt, 'yyyy-MM');
    grouped.set(key, (grouped.get(key) ?? 0) + 1);
  }

  const monthlyRenewals = [...grouped.entries()].map(([month, count]) => ({ month, count }));

  return { counters, nearestExpiring, monthlyRenewals };
}