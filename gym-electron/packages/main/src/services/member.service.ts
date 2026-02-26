import { addMonths, differenceInCalendarDays, formatISO } from 'date-fns';

import type {
  MemberDTO,
  MemberPayload,
  MembersQuery,
  RenewalPayload,
  SessionsTopUpPayload,
  SubscriptionStatus,
  SubscriptionType,
} from '@gym/shared';

import { prisma } from '../db/client';
import { statusFromDate } from '../utils/date';
import { requireManagerPinForDelete, requireManagerPinIfStrict } from './security.service';
import { getSettings } from './settings.service';
import { renewMemberSubscription } from './subscription.service';

interface MemberRow {
  id: number;
  fullName: string;
  phone: string;
  subscriptionType: string | null;
  startDate: string | Date;
  durationMonths: number;
  endDate: string | Date;
  sessionsTotal: number | null;
  sessionsRemaining: number | null;
  sessionsExpiryDate: string | Date | null;
  notes: string;
  cardId: string;
  photoPath: string;
  planId: number | null;
  planName: string | null;
}

function normalizeDate(value: string | Date | null): string | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return formatISO(parsed, { representation: 'date' });
}

function safeSubscriptionType(value: string | null): SubscriptionType {
  return value === 'SESSIONS' ? 'SESSIONS' : 'MONTHLY';
}

function resolveStatus(row: MemberRow, soonDays: number): { status: SubscriptionStatus; daysLeft: number } {
  const subscriptionType = safeSubscriptionType(row.subscriptionType);
  if (subscriptionType === 'MONTHLY') {
    return statusFromDate(new Date(row.endDate), soonDays);
  }

  const remaining = Math.max(0, Number(row.sessionsRemaining ?? 0));
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const expiry = row.sessionsExpiryDate ? new Date(row.sessionsExpiryDate) : null;
  const hasValidExpiry = Boolean(expiry && !Number.isNaN(expiry.getTime()));
  const expiryDaysLeft = hasValidExpiry ? differenceInCalendarDays(expiry as Date, today) : 9999;

  if (hasValidExpiry && today > (expiry as Date)) {
    return { status: 'Expired', daysLeft: expiryDaysLeft };
  }
  if (remaining <= 0) {
    return { status: 'Expired', daysLeft: hasValidExpiry ? expiryDaysLeft : -1 };
  }
  if (hasValidExpiry && expiryDaysLeft <= soonDays) {
    return { status: 'ExpiringSoon', daysLeft: expiryDaysLeft };
  }
  return { status: 'Active', daysLeft: hasValidExpiry ? expiryDaysLeft : 9999 };
}

function toDTO(row: MemberRow, soonDays: number): MemberDTO {
  const { status, daysLeft } = resolveStatus(row, soonDays);
  return {
    id: row.id,
    fullName: row.fullName,
    phone: row.phone,
    subscriptionType: safeSubscriptionType(row.subscriptionType),
    startDate: normalizeDate(row.startDate) ?? '',
    durationMonths: Number(row.durationMonths ?? 0),
    endDate: normalizeDate(row.endDate) ?? '',
    sessionsTotal: row.sessionsTotal ?? null,
    sessionsRemaining: row.sessionsRemaining ?? null,
    sessionsExpiryDate: normalizeDate(row.sessionsExpiryDate),
    notes: row.notes ?? '',
    cardId: row.cardId ?? '',
    photoPath: row.photoPath ?? '',
    planId: row.planId ?? null,
    planName: row.planName ?? null,
    status,
    daysLeft,
  };
}

async function ensureCardNotUsed(cardId: string, excludeMemberId?: number): Promise<void> {
  const normalized = cardId.trim();
  if (!normalized) return;

  const rows = await prisma.$queryRawUnsafe<Array<{ id: number; fullName: string }>>(
    `
    SELECT id, fullName
    FROM "Member"
    WHERE "cardId" = ?
      AND (? IS NULL OR id <> ?)
    LIMIT 1
    `,
    normalized,
    excludeMemberId ?? null,
    excludeMemberId ?? null,
  );

  const existing = rows[0];
  if (existing) {
    throw new Error(`Card already linked to: ${existing.fullName}`);
  }
}

async function getMemberRowById(id: number): Promise<MemberRow | null> {
  const rows = await prisma.$queryRawUnsafe<MemberRow[]>(
    `
    SELECT
      m.id,
      m.fullName,
      m.phone,
      m.subscriptionType,
      m.startDate,
      m.durationMonths,
      m.endDate,
      m.sessionsTotal,
      m.sessionsRemaining,
      m.sessionsExpiryDate,
      m.notes,
      m.cardId,
      m.photoPath,
      m.planId,
      p.name AS planName
    FROM "Member" m
    LEFT JOIN "Plan" p ON p.id = m.planId
    WHERE m.id = ?
    LIMIT 1
    `,
    id,
  );
  return rows[0] ?? null;
}

export async function listMembers(query: MembersQuery = {}): Promise<MemberDTO[]> {
  const settings = await getSettings();
  const search = query.search?.trim() ?? '';
  const pattern = `%${search}%`;

  const rows = await prisma.$queryRawUnsafe<MemberRow[]>(
    `
    SELECT
      m.id,
      m.fullName,
      m.phone,
      m.subscriptionType,
      m.startDate,
      m.durationMonths,
      m.endDate,
      m.sessionsTotal,
      m.sessionsRemaining,
      m.sessionsExpiryDate,
      m.notes,
      m.cardId,
      m.photoPath,
      m.planId,
      p.name AS planName
    FROM "Member" m
    LEFT JOIN "Plan" p ON p.id = m.planId
    WHERE (? = '' OR m.fullName LIKE ? OR m.phone LIKE ? OR m.cardId LIKE ?)
    ORDER BY m.id DESC
    `,
    search,
    pattern,
    pattern,
    pattern,
  );

  let mapped = rows.map((row) => toDTO(row, settings.expiringSoonDays));
  if (query.status && query.status !== 'All') {
    mapped = mapped.filter((member) => member.status === query.status);
  }
  return mapped;
}

export async function getMemberById(id: number): Promise<MemberDTO | null> {
  const settings = await getSettings();
  const row = await getMemberRowById(id);
  return row ? toDTO(row, settings.expiringSoonDays) : null;
}

export async function createMember(payload: MemberPayload, managerPin?: string): Promise<MemberDTO> {
  const settings = await getSettings();
  const normalizedCardId = (payload.cardId ?? '').trim();
  const subscriptionType = payload.subscriptionType === 'SESSIONS' ? 'SESSIONS' : 'MONTHLY';

  if (settings.strictMode && !normalizedCardId) {
    await requireManagerPinIfStrict('Create member without card', managerPin);
  }
  if (normalizedCardId) {
    await ensureCardNotUsed(normalizedCardId);
  }

  const startDate = new Date(payload.startDate);
  if (Number.isNaN(startDate.getTime())) {
    throw new Error('Invalid start date');
  }

  if (subscriptionType === 'SESSIONS') {
    const sessionsTotal = Math.max(1, Number(payload.sessionsTotal ?? 0));
    const sessionsRemaining = sessionsTotal;
    const sessionsExpiryDate = payload.sessionsExpiryDate ? new Date(payload.sessionsExpiryDate) : null;
    const endDate = sessionsExpiryDate && !Number.isNaN(sessionsExpiryDate.getTime()) ? sessionsExpiryDate : startDate;

    await prisma.$executeRawUnsafe(
      `
      INSERT INTO "Member" (
        "fullName", "phone", "subscriptionType", "startDate", "durationMonths", "endDate",
        "sessionsTotal", "sessionsRemaining", "sessionsExpiryDate",
        "notes", "planId", "cardId"
      ) VALUES (?, ?, 'SESSIONS', ?, 0, ?, ?, ?, ?, ?, ?, ?)
      `,
      payload.fullName.trim(),
      (payload.phone ?? '').trim(),
      startDate.toISOString(),
      endDate.toISOString(),
      sessionsTotal,
      sessionsRemaining,
      sessionsExpiryDate && !Number.isNaN(sessionsExpiryDate.getTime()) ? sessionsExpiryDate.toISOString() : null,
      (payload.notes ?? '').trim(),
      payload.planId ?? null,
      normalizedCardId,
    );
  } else {
    const durationMonths = Math.max(1, Number(payload.durationMonths || 1));
    const endDate = addMonths(startDate, durationMonths);

    await prisma.$executeRawUnsafe(
      `
      INSERT INTO "Member" (
        "fullName", "phone", "subscriptionType", "startDate", "durationMonths", "endDate",
        "sessionsTotal", "sessionsRemaining", "sessionsExpiryDate",
        "notes", "planId", "cardId"
      ) VALUES (?, ?, 'MONTHLY', ?, ?, ?, NULL, NULL, NULL, ?, ?, ?)
      `,
      payload.fullName.trim(),
      (payload.phone ?? '').trim(),
      startDate.toISOString(),
      durationMonths,
      endDate.toISOString(),
      (payload.notes ?? '').trim(),
      payload.planId ?? null,
      normalizedCardId,
    );
  }

  const idRows = await prisma.$queryRawUnsafe<Array<{ id: number }>>(`SELECT last_insert_rowid() AS id`);
  const id = idRows[0]?.id;
  if (!id) throw new Error('Failed to create member');

  const created = await getMemberById(id);
  if (!created) throw new Error('Created member not found');
  return created;
}

export async function updateMember(id: number, payload: MemberPayload): Promise<MemberDTO> {
  const existing = await getMemberRowById(id);
  if (!existing) throw new Error('Member not found');

  const normalizedCardId = (payload.cardId ?? existing.cardId ?? '').trim();
  if (normalizedCardId) {
    await ensureCardNotUsed(normalizedCardId, id);
  }

  const subscriptionType = payload.subscriptionType === 'SESSIONS' ? 'SESSIONS' : 'MONTHLY';
  const startDate = new Date(payload.startDate);
  if (Number.isNaN(startDate.getTime())) {
    throw new Error('Invalid start date');
  }

  if (subscriptionType === 'SESSIONS') {
    const sessionsTotal = Math.max(1, Number(payload.sessionsTotal ?? existing.sessionsTotal ?? 1));
    const sessionsRemaining = Math.max(0, Number(payload.sessionsRemaining ?? existing.sessionsRemaining ?? sessionsTotal));
    const sessionsExpiryDate = payload.sessionsExpiryDate ? new Date(payload.sessionsExpiryDate) : null;
    const endDate = sessionsExpiryDate && !Number.isNaN(sessionsExpiryDate.getTime()) ? sessionsExpiryDate : startDate;

    await prisma.$executeRawUnsafe(
      `
      UPDATE "Member"
      SET
        "fullName" = ?,
        "phone" = ?,
        "subscriptionType" = 'SESSIONS',
        "startDate" = ?,
        "durationMonths" = 0,
        "endDate" = ?,
        "sessionsTotal" = ?,
        "sessionsRemaining" = ?,
        "sessionsExpiryDate" = ?,
        "notes" = ?,
        "planId" = ?,
        "cardId" = ?
      WHERE id = ?
      `,
      payload.fullName.trim(),
      (payload.phone ?? '').trim(),
      startDate.toISOString(),
      endDate.toISOString(),
      sessionsTotal,
      sessionsRemaining,
      sessionsExpiryDate && !Number.isNaN(sessionsExpiryDate.getTime()) ? sessionsExpiryDate.toISOString() : null,
      (payload.notes ?? '').trim(),
      payload.planId ?? null,
      normalizedCardId,
      id,
    );
  } else {
    const durationMonths = Math.max(1, Number(payload.durationMonths || 1));
    const endDate = addMonths(startDate, durationMonths);

    await prisma.$executeRawUnsafe(
      `
      UPDATE "Member"
      SET
        "fullName" = ?,
        "phone" = ?,
        "subscriptionType" = 'MONTHLY',
        "startDate" = ?,
        "durationMonths" = ?,
        "endDate" = ?,
        "sessionsTotal" = NULL,
        "sessionsRemaining" = NULL,
        "sessionsExpiryDate" = NULL,
        "notes" = ?,
        "planId" = ?,
        "cardId" = ?
      WHERE id = ?
      `,
      payload.fullName.trim(),
      (payload.phone ?? '').trim(),
      startDate.toISOString(),
      durationMonths,
      endDate.toISOString(),
      (payload.notes ?? '').trim(),
      payload.planId ?? null,
      normalizedCardId,
      id,
    );
  }

  const updated = await getMemberById(id);
  if (!updated) throw new Error('Updated member not found');
  return updated;
}

export async function deleteMember(id: number, managerPin?: string): Promise<void> {
  await requireManagerPinForDelete(managerPin);
  await prisma.member.delete({ where: { id } });
}

export async function renewMember(payload: RenewalPayload): Promise<MemberDTO> {
  await renewMemberSubscription(payload);
  const updated = await getMemberById(payload.memberId);
  if (!updated) throw new Error('Member not found');
  return updated;
}

export async function topUpMemberSessions(payload: SessionsTopUpPayload): Promise<MemberDTO> {
  const sessionsToAdd = Math.max(1, Number(payload.sessionsToAdd || 0));
  const row = await getMemberRowById(payload.memberId);
  if (!row) throw new Error('Member not found');
  if (safeSubscriptionType(row.subscriptionType) !== 'SESSIONS') {
    throw new Error('Top-up is available only for session packs');
  }

  await prisma.$executeRawUnsafe(
    `
    UPDATE "Member"
    SET
      "sessionsTotal" = COALESCE("sessionsTotal", 0) + ?,
      "sessionsRemaining" = COALESCE("sessionsRemaining", 0) + ?
    WHERE id = ?
    `,
    sessionsToAdd,
    sessionsToAdd,
    payload.memberId,
  );

  const updated = await getMemberById(payload.memberId);
  if (!updated) throw new Error('Member not found');
  return updated;
}
