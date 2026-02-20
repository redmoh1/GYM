import type { DashboardDTO } from '@gym/shared';

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

  return { counters, nearestExpiring };
}