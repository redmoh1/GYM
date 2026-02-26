import { addMonths } from 'date-fns';

import type { RenewalPayload } from '@gym/shared';

import { prisma } from '../db/client';
import { statusFromDate } from '../utils/date';
import { getSettings } from './settings.service';

export async function renewMemberSubscription(payload: RenewalPayload): Promise<any> {
  const settings = await getSettings();
  const existing = await prisma.member.findUnique({
    where: { id: payload.memberId },
    include: { plan: true },
  });

  if (!existing) throw new Error('Member not found');

  const now = new Date();
  const renewFromToday = payload.startMode === 'from_today';
  const baseDate = renewFromToday ? now : existing.endDate;
  const newEndDate = addMonths(baseDate, payload.months);
  const nextDurationMonths = renewFromToday ? payload.months : existing.durationMonths + payload.months;

  return prisma.member.update({
    where: { id: payload.memberId },
    data: {
      startDate: renewFromToday ? now : existing.startDate,
      endDate: newEndDate,
      durationMonths: nextDurationMonths,
    },
    include: { plan: true },
  });
}
