import { addMonths } from 'date-fns';

import type { RenewalPayload } from '@gym/shared';

import { prisma } from '../db/client';

interface RenewalRow {
  id: number;
  subscriptionType: string | null;
  startDate: string | Date;
  endDate: string | Date;
  durationMonths: number;
}

export async function renewMemberSubscription(payload: RenewalPayload): Promise<void> {
  const rows = await prisma.$queryRawUnsafe<RenewalRow[]>(
    `
    SELECT id, subscriptionType, startDate, endDate, durationMonths
    FROM "Member"
    WHERE id = ?
    LIMIT 1
    `,
    payload.memberId,
  );
  const existing = rows[0];

  if (!existing) throw new Error('Member not found');
  if ((existing.subscriptionType ?? 'MONTHLY') === 'SESSIONS') {
    throw new Error('Use sessions top-up for session pack members');
  }

  const now = new Date();
  const renewFromToday = payload.startMode === 'from_today';
  const baseDate = renewFromToday ? now : new Date(existing.endDate);
  const newEndDate = addMonths(baseDate, payload.months);
  const nextDurationMonths = renewFromToday ? payload.months : Number(existing.durationMonths) + payload.months;
  const nextStartDate = renewFromToday ? now : new Date(existing.startDate);

  await prisma.$executeRawUnsafe(
    `
    UPDATE "Member"
    SET "startDate" = ?, "endDate" = ?, "durationMonths" = ?, "updatedAt" = CURRENT_TIMESTAMP
    WHERE id = ?
    `,
    nextStartDate.toISOString(),
    newEndDate.toISOString(),
    nextDurationMonths,
    payload.memberId,
  );
}
