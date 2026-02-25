import type { CapturedCardDTO, CheckinDTO, CheckinResult, EnrollCardResultDTO, K40ListenerStateDTO } from '@gym/shared';

import log from 'electron-log';

import { ensureRuntimeSchema, prisma } from '../db/client';
import { requireManagerPinForTransfer, requireManagerPinIfStrict } from './security.service';
import { getSettings } from './settings.service';
import { type K40ListenerState, type RawK40Event, zkK40ListenerService } from './zk-k40-listener.service';

type Unsubscribe = () => void;

interface CheckinRow {
  id: number;
  memberId: number | null;
  cardId: string;
  deviceName: string;
  checkedAt: string | Date;
  result: CheckinResult;
  reason: string;
  memberName: string | null;
  memberPhone: string | null;
  memberEndDate: string | Date | null;
  photoPath: string | null;
}

interface EnrollmentWaiter {
  timeout: NodeJS.Timeout;
  resolve: (cardId: string) => void;
  reject: (error: Error) => void;
}

interface CheckinInsertPayload {
  memberId: number | null;
  cardId: string;
  deviceName: string;
  checkedAt: string;
  result: CheckinResult;
  reason: string;
}

export class K40AccessService {
  private started = false;
  private rawUnsubscribe: Unsubscribe | null = null;
  private stateUnsubscribe: Unsubscribe | null = null;
  private processChain: Promise<void> = Promise.resolve();

  private checkinSubscribers = new Set<(event: CheckinDTO) => void>();
  private stateSubscribers = new Set<(state: K40ListenerStateDTO) => void>();
  private enrollmentWaiters = new Set<EnrollmentWaiter>();

  private stateCache: K40ListenerStateDTO = {
    connected: false,
    status: 'idle',
    enabled: true,
    deviceIp: '',
    devicePort: 4370,
    deviceName: 'ZKTeco K40',
    lastError: null,
  };

  onCheckin(handler: (event: CheckinDTO) => void): Unsubscribe {
    this.checkinSubscribers.add(handler);
    return () => {
      this.checkinSubscribers.delete(handler);
    };
  }

  onState(handler: (state: K40ListenerStateDTO) => void): Unsubscribe {
    this.stateSubscribers.add(handler);
    handler(this.stateCache);
    return () => {
      this.stateSubscribers.delete(handler);
    };
  }

  getState(): K40ListenerStateDTO {
    return this.stateCache;
  }

  async start(): Promise<void> {
    if (this.started) return;
    await ensureRuntimeSchema();

    this.rawUnsubscribe = zkK40ListenerService.onRawEvent((event) => {
      this.processChain = this.processChain
        .then(async () => this.handleRawEvent(event))
        .catch((error) => {
          const message = error instanceof Error ? error.message : String(error);
          log.error(`[k40:process] ${message}`);
        });
    });

    this.stateUnsubscribe = zkK40ListenerService.onState((state) => {
      void this.emitState(state);
    });

    await zkK40ListenerService.start();
    this.started = true;
  }

  async stop(): Promise<void> {
    if (!this.started) return;
    await zkK40ListenerService.stop();
    this.rawUnsubscribe?.();
    this.stateUnsubscribe?.();
    this.rawUnsubscribe = null;
    this.stateUnsubscribe = null;
    this.started = false;

    this.enrollmentWaiters.forEach((waiter) => {
      clearTimeout(waiter.timeout);
      waiter.reject(new Error('Device listener stopped.'));
    });
    this.enrollmentWaiters.clear();
  }

  async getRecentCheckins(limit = 10): Promise<CheckinDTO[]> {
    await ensureRuntimeSchema();
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(100, Math.floor(limit))) : 10;
    const rows = await prisma.$queryRawUnsafe<CheckinRow[]>(
      `
      SELECT
        c.id AS id,
        c.memberId AS memberId,
        c.cardId AS cardId,
        c.deviceName AS deviceName,
        c.checkedAt AS checkedAt,
        c.result AS result,
        c.reason AS reason,
        m.fullName AS memberName,
        m.phone AS memberPhone,
        m.endDate AS memberEndDate,
        m.photoPath AS photoPath
      FROM "Checkin" c
      LEFT JOIN "Member" m ON m.id = c.memberId
      ORDER BY c.id DESC
      LIMIT ?
      `,
      safeLimit,
    );
    return rows.map((row) => this.mapCheckinRow(row));
  }

  async captureNextCard(timeoutSeconds = 10): Promise<CapturedCardDTO> {
    await this.ensureEnrollmentReady();
    const cardId = await this.waitForNextCard(timeoutSeconds);

    const ownerRows = await prisma.$queryRawUnsafe<Array<{ id: number; fullName: string }>>(
      `SELECT id, fullName FROM "Member" WHERE "cardId" = ? LIMIT 1`,
      cardId,
    );
    const owner = ownerRows[0] ?? null;

    return {
      cardId,
      ownerMemberId: owner?.id ?? null,
      ownerName: owner?.fullName ?? null,
    };
  }

  async enrollMemberCard(memberId: number, timeoutSeconds = 10, managerPin?: string): Promise<EnrollCardResultDTO> {
    await this.ensureEnrollmentReady();
    await requireManagerPinIfStrict('Enroll card', managerPin);
    const cardId = await this.waitForNextCard(timeoutSeconds);
    return this.assignCardToMember(memberId, cardId, false, managerPin);
  }

  async assignCardToMember(
    memberId: number,
    cardId: string,
    forceTransfer = false,
    managerPin?: string,
  ): Promise<EnrollCardResultDTO> {
    await ensureRuntimeSchema();
    const normalizedCardId = cardId.trim();
    if (!normalizedCardId) {
      throw new Error('Card ID is required.');
    }

    if (forceTransfer) {
      await requireManagerPinForTransfer(managerPin);
    } else {
      await requireManagerPinIfStrict('Link card to member', managerPin);
    }

    const memberRows = await prisma.$queryRawUnsafe<Array<{ id: number }>>(
      `SELECT id FROM "Member" WHERE id = ? LIMIT 1`,
      memberId,
    );
    if (!memberRows[0]) {
      throw new Error('Target member not found.');
    }

    const ownerRows = await prisma.$queryRawUnsafe<Array<{ id: number; fullName: string }>>(
      `SELECT id, fullName FROM "Member" WHERE "cardId" = ? LIMIT 1`,
      normalizedCardId,
    );
    const owner = ownerRows[0] ?? null;

    if (owner && owner.id !== memberId && !forceTransfer) {
      return {
        status: 'CONFLICT',
        cardId: normalizedCardId,
        memberId,
        currentOwnerMemberId: owner.id,
        currentOwnerName: owner.fullName,
      };
    }

    if (owner && owner.id !== memberId) {
      await prisma.$executeRawUnsafe(`UPDATE "Member" SET "cardId" = '' WHERE "id" = ?`, owner.id);
    }
    await prisma.$executeRawUnsafe(`UPDATE "Member" SET "cardId" = ? WHERE "id" = ?`, normalizedCardId, memberId);

    return {
      status: 'BOUND',
      cardId: normalizedCardId,
      memberId,
      currentOwnerMemberId: null,
      currentOwnerName: null,
    };
  }

  async recordManualCheckin(memberId: number, cardId: string, result: CheckinResult, reason: string): Promise<CheckinDTO> {
    await ensureRuntimeSchema();

    const memberRows = await prisma.$queryRawUnsafe<Array<{ id: number; cardId: string }>>(
      `SELECT id, cardId FROM "Member" WHERE id = ? LIMIT 1`,
      memberId,
    );
    const member = memberRows[0];
    if (!member) {
      throw new Error('Member not found.');
    }

    const settings = await getSettings();
    const normalizedCard = cardId.trim() || member.cardId.trim();
    if (!normalizedCard) {
      throw new Error('Card ID is required for check-in record.');
    }

    const inserted = await this.insertAndFetchCheckin({
      memberId: member.id,
      cardId: normalizedCard,
      deviceName: settings.deviceName,
      checkedAt: new Date().toISOString(),
      result,
      reason,
    });

    this.checkinSubscribers.forEach((subscriber) => subscriber(inserted));
    return inserted;
  }

  private async ensureEnrollmentReady(): Promise<void> {
    await ensureRuntimeSchema();
    const settings = await getSettings();
    if (!settings.enableDeviceListener) {
      throw new Error('Device listener is disabled in settings.');
    }
    if (!settings.deviceIp.trim()) {
      throw new Error('Please configure device IP in settings.');
    }
  }

  private waitForNextCard(timeoutSeconds = 10): Promise<string> {
    const timeoutMs = Math.max(1, timeoutSeconds) * 1000;
    return new Promise<string>((resolve, reject) => {
      const waiter: EnrollmentWaiter = {
        resolve: (cardId) => {
          clearTimeout(waiter.timeout);
          this.enrollmentWaiters.delete(waiter);
          resolve(cardId);
        },
        reject: (error) => {
          clearTimeout(waiter.timeout);
          this.enrollmentWaiters.delete(waiter);
          reject(error);
        },
        timeout: setTimeout(() => {
          waiter.reject(new Error('Timed out: no card detected within the requested window.'));
        }, timeoutMs),
      };
      this.enrollmentWaiters.add(waiter);
    });
  }

  private async handleRawEvent(event: RawK40Event): Promise<void> {
    for (const waiter of [...this.enrollmentWaiters]) {
      waiter.resolve(event.cardId);
      break;
    }

    const settings = await getSettings();
    const memberRows = await prisma.$queryRawUnsafe<Array<{ id: number; endDate: string | Date }>>(
      `SELECT id, endDate FROM "Member" WHERE "cardId" = ? LIMIT 1`,
      event.cardId,
    );

    const member = memberRows[0] ?? null;
    let result: CheckinResult = 'UNKNOWN';
    let reason = 'البطاقة غير مسجلة';
    let memberId: number | null = null;

    if (member) {
      memberId = member.id;
      const isActive = this.isActive(this.normalizeDateString(member.endDate));
      result = isActive ? 'ALLOW' : 'DENY';
      reason = isActive ? 'اشتراك ساري' : 'اشتراك منتهي';
    }

    const payload = await this.insertAndFetchCheckin({
      memberId,
      cardId: event.cardId,
      deviceName: settings.deviceName,
      checkedAt: event.timestamp.toISOString(),
      result,
      reason,
    });

    this.checkinSubscribers.forEach((subscriber) => subscriber(payload));
  }

  private async insertAndFetchCheckin(payload: CheckinInsertPayload): Promise<CheckinDTO> {
    await prisma.$executeRawUnsafe(
      `
      INSERT INTO "Checkin" ("memberId", "cardId", "deviceName", "checkedAt", "result", "reason")
      VALUES (?, ?, ?, ?, ?, ?)
      `,
      payload.memberId,
      payload.cardId,
      payload.deviceName,
      payload.checkedAt,
      payload.result,
      payload.reason,
    );

    const idRow = await prisma.$queryRawUnsafe<Array<{ id: number }>>(`SELECT last_insert_rowid() AS id`);
    const insertedId = idRow[0]?.id;
    if (!insertedId) {
      throw new Error('Failed to create checkin record.');
    }

    const insertedRows = await prisma.$queryRawUnsafe<CheckinRow[]>(
      `
      SELECT
        c.id AS id,
        c.memberId AS memberId,
        c.cardId AS cardId,
        c.deviceName AS deviceName,
        c.checkedAt AS checkedAt,
        c.result AS result,
        c.reason AS reason,
        m.fullName AS memberName,
        m.phone AS memberPhone,
        m.endDate AS memberEndDate,
        m.photoPath AS photoPath
      FROM "Checkin" c
      LEFT JOIN "Member" m ON m.id = c.memberId
      WHERE c.id = ?
      LIMIT 1
      `,
      insertedId,
    );

    const inserted = insertedRows[0];
    if (!inserted) {
      throw new Error('Inserted checkin row was not found.');
    }

    return this.mapCheckinRow(inserted);
  }

  private async emitState(listenerState: K40ListenerState): Promise<void> {
    const settings = await getSettings();
    const next: K40ListenerStateDTO = {
      connected: listenerState.connected,
      status: listenerState.status,
      enabled: settings.enableDeviceListener,
      deviceIp: settings.deviceIp,
      devicePort: settings.devicePort,
      deviceName: settings.deviceName,
      lastError: listenerState.lastError,
    };

    const changed =
      next.connected !== this.stateCache.connected ||
      next.status !== this.stateCache.status ||
      next.enabled !== this.stateCache.enabled ||
      next.deviceIp !== this.stateCache.deviceIp ||
      next.devicePort !== this.stateCache.devicePort ||
      next.deviceName !== this.stateCache.deviceName ||
      next.lastError !== this.stateCache.lastError;

    this.stateCache = next;
    if (!changed) return;
    this.stateSubscribers.forEach((subscriber) => subscriber(next));
  }

  private mapCheckinRow(row: CheckinRow): CheckinDTO {
    const checkedAt = this.normalizeDateString(row.checkedAt);
    const memberEndDate = row.memberEndDate ? this.normalizeDateString(row.memberEndDate) : null;
    const daysLeft =
      memberEndDate && this.isValidDate(memberEndDate)
        ? Math.ceil((new Date(memberEndDate).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86400000)
        : null;

    return {
      id: row.id,
      memberId: row.memberId,
      memberName: row.memberName ?? '',
      memberPhone: row.memberPhone ?? '',
      memberEndDate,
      daysLeft,
      photoPath: row.photoPath ?? '',
      cardId: row.cardId,
      deviceName: row.deviceName,
      checkedAt,
      result: row.result,
      reason: row.reason,
    };
  }

  private isActive(endDateValue: string): boolean {
    if (!this.isValidDate(endDateValue)) return false;
    const end = new Date(endDateValue);
    const today = new Date();
    end.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    return end >= today;
  }

  private isValidDate(value: string): boolean {
    const parsed = new Date(value);
    return !Number.isNaN(parsed.getTime());
  }

  private normalizeDateString(value: unknown): string {
    if (value instanceof Date) return value.toISOString();
    const text = String(value);
    const parsed = new Date(text);
    if (Number.isNaN(parsed.getTime())) return text;
    return parsed.toISOString();
  }
}

export const k40AccessService = new K40AccessService();