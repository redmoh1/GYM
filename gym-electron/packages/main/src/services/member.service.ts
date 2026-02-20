import { addMonths, formatISO } from 'date-fns';

import type { MemberDTO, MemberPayload, MembersQuery, RenewalPayload } from '@gym/shared';

import { prisma } from '../db/client';
import { statusFromDate } from '../utils/date';
import { getSettings } from './settings.service';

function toDTO(member: any, soonDays: number): MemberDTO {
  const { status, daysLeft } = statusFromDate(member.endDate, soonDays);
  return {
    id: member.id,
    fullName: member.fullName,
    phone: member.phone,
    startDate: formatISO(member.startDate, { representation: 'date' }),
    durationMonths: member.durationMonths,
    endDate: formatISO(member.endDate, { representation: 'date' }),
    notes: member.notes,
    planId: member.planId,
    planName: member.plan?.name ?? null,
    status,
    daysLeft,
  };
}

export async function listMembers(query: MembersQuery = {}): Promise<MemberDTO[]> {
  const settings = await getSettings();
  const where = query.search
    ? {
        OR: [{ fullName: { contains: query.search } }, { phone: { contains: query.search } }],
      }
    : {};

  const rows = await prisma.member.findMany({
    where,
    include: { plan: true },
    orderBy: { id: 'desc' },
  });

  let mapped = rows.map((row) => toDTO(row, settings.expiringSoonDays));
  if (query.status && query.status !== 'All') {
    mapped = mapped.filter((m) => m.status === query.status);
  }

  return mapped;
}

export async function getMemberById(id: number): Promise<MemberDTO | null> {
  const settings = await getSettings();
  const row = await prisma.member.findUnique({ where: { id }, include: { plan: true } });
  return row ? toDTO(row, settings.expiringSoonDays) : null;
}

export async function createMember(payload: MemberPayload): Promise<MemberDTO> {
  const settings = await getSettings();
  const endDate = addMonths(new Date(payload.startDate), payload.durationMonths);

  const row = await prisma.member.create({
    data: {
      fullName: payload.fullName,
      phone: payload.phone,
      startDate: new Date(payload.startDate),
      durationMonths: payload.durationMonths,
      endDate,
      notes: payload.notes ?? '',
      planId: payload.planId ?? null,
    },
    include: { plan: true },
  });

  return toDTO(row, settings.expiringSoonDays);
}

export async function updateMember(id: number, payload: MemberPayload): Promise<MemberDTO> {
  const settings = await getSettings();
  const endDate = addMonths(new Date(payload.startDate), payload.durationMonths);

  const row = await prisma.member.update({
    where: { id },
    data: {
      fullName: payload.fullName,
      phone: payload.phone,
      startDate: new Date(payload.startDate),
      durationMonths: payload.durationMonths,
      endDate,
      notes: payload.notes ?? '',
      planId: payload.planId ?? null,
    },
    include: { plan: true },
  });

  return toDTO(row, settings.expiringSoonDays);
}

export async function deleteMember(id: number): Promise<void> {
  await prisma.member.delete({ where: { id } });
}

export async function renewMember(payload: RenewalPayload): Promise<MemberDTO> {
  const settings = await getSettings();
  const existing = await prisma.member.findUnique({
    where: { id: payload.memberId },
    include: { plan: true },
  });

  if (!existing) throw new Error('Member not found');

  const now = new Date();
  const { status } = statusFromDate(existing.endDate, settings.expiringSoonDays);
  const isExpired = status === 'Expired';

  const baseDate = isExpired ? now : existing.endDate;
  const newEndDate = addMonths(baseDate, payload.months);
  const nextDurationMonths = isExpired ? payload.months : existing.durationMonths + payload.months;

  const row = await prisma.member.update({
    where: { id: payload.memberId },
    data: {
      startDate: isExpired ? now : existing.startDate,
      endDate: newEndDate,
      durationMonths: nextDurationMonths,
    },
    include: { plan: true },
  });

  return toDTO(row, settings.expiringSoonDays);
}