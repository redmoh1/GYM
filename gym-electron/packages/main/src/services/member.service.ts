import { addMonths, formatISO } from 'date-fns';

import type { MemberDTO, MemberPayload, MembersQuery, RenewalPayload } from '@gym/shared';

import { prisma } from '../db/client';
import { statusFromDate } from '../utils/date';
import { requireManagerPinForDelete, requireManagerPinIfStrict } from './security.service';
import { getSettings } from './settings.service';
import { renewMemberSubscription } from './subscription.service';

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
    cardId: member.cardId ?? '',
    photoPath: member.photoPath ?? '',
    planId: member.planId,
    planName: member.plan?.name ?? null,
    status,
    daysLeft,
  };
}

async function ensureCardNotUsed(cardId: string): Promise<void> {
  const normalized = cardId.trim();
  if (!normalized) return;

  const existing = await prisma.member.findFirst({
    where: { cardId: normalized },
    select: { id: true, fullName: true },
  });

  if (!existing) return;
  throw new Error(`هذه البطاقة مرتبطة باللاعب: ${existing.fullName}`);
}

export async function listMembers(query: MembersQuery = {}): Promise<MemberDTO[]> {
  const settings = await getSettings();
  const where: any = query.search
    ? {
        OR: [
          { fullName: { contains: query.search } },
          { phone: { contains: query.search } },
          { cardId: { contains: query.search } },
        ],
      }
    : {};

  const rows = await prisma.member.findMany({
    where,
    include: { plan: true },
    orderBy: { id: 'desc' },
  });

  let mapped = rows.map((row) => toDTO(row, settings.expiringSoonDays));
  if (query.status && query.status !== 'All') {
    mapped = mapped.filter((member) => member.status === query.status);
  }

  return mapped;
}

export async function getMemberById(id: number): Promise<MemberDTO | null> {
  const settings = await getSettings();
  const row = await prisma.member.findUnique({ where: { id }, include: { plan: true } });
  return row ? toDTO(row, settings.expiringSoonDays) : null;
}

export async function createMember(payload: MemberPayload, managerPin?: string): Promise<MemberDTO> {
  const settings = await getSettings();

  const normalizedCardId = (payload.cardId ?? '').trim();
  if (settings.strictMode && !normalizedCardId) {
    await requireManagerPinIfStrict('Create member without card', managerPin);
  }

  if (normalizedCardId) {
    await ensureCardNotUsed(normalizedCardId);
  }

  const endDate = addMonths(new Date(payload.startDate), payload.durationMonths);

  const row = await prisma.member.create({
    data: {
      fullName: payload.fullName.trim(),
      phone: (payload.phone ?? '').trim(),
      startDate: new Date(payload.startDate),
      durationMonths: payload.durationMonths,
      endDate,
      notes: (payload.notes ?? '').trim(),
      planId: payload.planId ?? null,
      cardId: normalizedCardId,
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
      fullName: payload.fullName.trim(),
      phone: (payload.phone ?? '').trim(),
      startDate: new Date(payload.startDate),
      durationMonths: payload.durationMonths,
      endDate,
      notes: (payload.notes ?? '').trim(),
      planId: payload.planId ?? null,
    },
    include: { plan: true },
  });

  return toDTO(row, settings.expiringSoonDays);
}

export async function deleteMember(id: number, managerPin?: string): Promise<void> {
  await requireManagerPinForDelete(managerPin);
  await prisma.member.delete({ where: { id } });
}

export async function renewMember(payload: RenewalPayload): Promise<MemberDTO> {
  const settings = await getSettings();
  const row = await renewMemberSubscription(payload);

  return toDTO(row, settings.expiringSoonDays);
}