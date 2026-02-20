import { addMonths, differenceInCalendarDays } from 'date-fns';

import type { SubscriptionStatus } from '@gym/shared';

export function computeEndDate(startDateIso: string, durationMonths: number): Date {
  return addMonths(new Date(startDateIso), durationMonths);
}

export function statusFromDate(endDate: Date, soonDays: number): { status: SubscriptionStatus; daysLeft: number } {
  const today = new Date();
  const daysLeft = differenceInCalendarDays(endDate, today);
  if (daysLeft < 0) return { status: 'Expired', daysLeft };
  if (daysLeft <= soonDays) return { status: 'ExpiringSoon', daysLeft };
  return { status: 'Active', daysLeft };
}