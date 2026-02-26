import log from 'electron-log';

import { getSettings } from './settings.service';

export interface RawK40Event {
  cardId: string;
  userId: string;
  timestamp: Date;
}

export interface K40ListenerState {
  connected: boolean;
  status: string;
  lastError: string | null;
}

type Unsubscribe = () => void;

interface ZkClientLike {
  createSocket?: () => Promise<void> | void;
  connect?: () => Promise<void> | void;
  disconnect?: () => Promise<void> | void;
  getAttendances?: () => Promise<unknown[]>;
  getAttendance?: () => Promise<unknown[]>;
  getLogs?: () => Promise<unknown[]>;
}

interface RawLogLike {
  timestamp?: Date | string;
  recordTime?: Date | string;
  time?: Date | string;
  user_id?: string | number;
  userId?: string | number;
  uid?: string | number;
  card?: string | number;
  cardNo?: string | number;
}

export class ZkK40ListenerService {
  private pollTimer: NodeJS.Timeout | null = null;
  private client: ZkClientLike | null = null;
  private pollInFlight = false;
  private reconnectFingerprint = '';
  private primed = false;
  private checkpointMs: number | null = null;
  private seenAtCheckpoint = new Set<string>();
  private state: K40ListenerState = { connected: false, status: 'idle', lastError: null };
  private lastEmittedError: string | null = null;

  private rawEventSubscribers = new Set<(event: RawK40Event) => void>();
  private stateSubscribers = new Set<(state: K40ListenerState) => void>();

  onRawEvent(handler: (event: RawK40Event) => void): Unsubscribe {
    this.rawEventSubscribers.add(handler);
    return () => {
      this.rawEventSubscribers.delete(handler);
    };
  }

  onState(handler: (state: K40ListenerState) => void): Unsubscribe {
    this.stateSubscribers.add(handler);
    handler(this.state);
    return () => {
      this.stateSubscribers.delete(handler);
    };
  }

  getState(): K40ListenerState {
    return this.state;
  }

  async start(): Promise<void> {
    if (this.pollTimer) return;
    await this.pollOnce();
    this.pollTimer = setInterval(() => {
      void this.pollOnce();
    }, 1000);
  }

  async stop(): Promise<void> {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    await this.disconnect();
    this.emitState({ connected: false, status: 'stopped' });
  }

  private async pollOnce(): Promise<void> {
    if (this.pollInFlight) return;
    this.pollInFlight = true;
    try {
      const settings = await getSettings();
      const ip = settings.deviceIp.trim();
      const fingerprint = `${ip}:${settings.devicePort}`;

      if (!settings.enableDeviceListener) {
        await this.disconnect();
        this.emitState({ connected: false, status: 'disabled' });
        return;
      }

      if (!ip) {
        await this.disconnect();
        this.emitState({ connected: false, status: 'missing-ip' });
        return;
      }

      if (!this.client || this.reconnectFingerprint !== fingerprint) {
        await this.disconnect();
        this.client = await this.connectToDevice(ip, settings.devicePort);
        this.reconnectFingerprint = fingerprint;
        this.primed = false;
      }

      const logs = await this.readAttendances(this.client);
      const events = this.extractNewEvents(logs);
      if (!this.primed) {
        this.primeCheckpoint(events);
        this.primed = true;
        this.emitState({ connected: true, status: `connected:${fingerprint}`, lastError: null });
        return;
      }

      for (const event of events) {
        this.emitRawEvent(event);
      }
      this.emitState({ connected: true, status: `connected:${fingerprint}`, lastError: null });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(`[k40] ${message}`);
      this.emitState({ connected: false, status: 'reconnecting', lastError: message });
      await this.disconnect();
    } finally {
      this.pollInFlight = false;
    }
  }

  private emitRawEvent(event: RawK40Event): void {
    this.rawEventSubscribers.forEach((subscriber) => subscriber(event));
  }

  private emitState(next: Partial<K40ListenerState>): void {
    const merged: K40ListenerState = {
      connected: next.connected ?? this.state.connected,
      status: next.status ?? this.state.status,
      lastError: next.lastError ?? null,
    };
    const changed =
      merged.connected !== this.state.connected ||
      merged.status !== this.state.status ||
      merged.lastError !== this.state.lastError;
    this.state = merged;
    if (!changed) return;

    if (merged.lastError && merged.lastError !== this.lastEmittedError) {
      this.lastEmittedError = merged.lastError;
    }
    this.stateSubscribers.forEach((subscriber) => subscriber(merged));
  }

  private async connectToDevice(ip: string, port: number): Promise<ZkClientLike> {
    const moduleRef = this.loadDriver();
    const client = this.createClient(moduleRef, ip, port);
    if (!client) {
      throw new Error('Cannot initialize zkteco-terminal client instance.');
    }

    if (typeof client.createSocket === 'function') {
      await client.createSocket();
      return client;
    }

    if (typeof client.connect === 'function') {
      await client.connect();
      return client;
    }

    throw new Error('Unable to connect to K40: zkteco-terminal does not expose createSocket/connect.');
  }

  private async disconnect(): Promise<void> {
    if (!this.client) return;
    try {
      if (typeof this.client.disconnect === 'function') {
        await this.client.disconnect();
      }
    } catch {
      // ignore disconnect errors
    } finally {
      this.client = null;
      this.reconnectFingerprint = '';
    }
  }

  private async readAttendances(client: ZkClientLike): Promise<RawK40Event[]> {
    let rows: unknown[] = [];

    if (typeof client.getAttendances === 'function') {
      rows = await client.getAttendances();
    } else if (typeof client.getAttendance === 'function') {
      rows = await client.getAttendance();
    } else if (typeof client.getLogs === 'function') {
      rows = await client.getLogs();
    } else {
      throw new Error('zkteco-terminal does not provide getAttendances/getAttendance/getLogs.');
    }

    return rows
      .map((entry) => this.parseLog(entry as RawLogLike))
      .filter((entry): entry is RawK40Event => entry !== null)
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  private extractNewEvents(events: RawK40Event[]): RawK40Event[] {
    if (events.length === 0) return [];

    const fresh: RawK40Event[] = [];
    for (const event of events) {
      const ts = event.timestamp.getTime();
      const signature = `${ts}:${event.cardId}`;

      if (this.checkpointMs === null) {
        this.checkpointMs = ts;
        this.seenAtCheckpoint = new Set([signature]);
        continue;
      }

      if (ts < this.checkpointMs) continue;
      if (ts === this.checkpointMs && this.seenAtCheckpoint.has(signature)) continue;

      if (ts > this.checkpointMs) {
        this.checkpointMs = ts;
        this.seenAtCheckpoint = new Set([signature]);
      } else {
        this.seenAtCheckpoint.add(signature);
      }

      fresh.push(event);
    }
    return fresh;
  }

  private primeCheckpoint(events: RawK40Event[]): void {
    if (events.length === 0) return;
    const latest = events[events.length - 1];
    this.checkpointMs = latest.timestamp.getTime();
    this.seenAtCheckpoint = new Set(
      events
        .filter((event) => event.timestamp.getTime() === this.checkpointMs)
        .map((event) => `${event.timestamp.getTime()}:${event.cardId}`),
    );
  }

  private parseLog(raw: RawLogLike): RawK40Event | null {
    const ts = this.parseTimestamp(raw.timestamp ?? raw.recordTime ?? raw.time);
    if (!ts) return null;

    const userId = String(raw.user_id ?? raw.userId ?? raw.uid ?? '').trim();
    const cardId = String(raw.card ?? raw.cardNo ?? userId ?? '').trim();
    if (!cardId) return null;

    return {
      cardId,
      userId: userId || cardId,
      timestamp: ts,
    };
  }

  private parseTimestamp(value: unknown): Date | null {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
    if (typeof value === 'string' && value.trim()) {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
    return null;
  }

  private loadDriver(): any {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      return require('zkteco-terminal');
    } catch {
      throw new Error('zkteco-terminal package is not installed.');
    }
  }

  private createClient(moduleRef: any, ip: string, port: number): ZkClientLike | null {
    const Candidate = moduleRef?.default ?? moduleRef?.Zkteco ?? moduleRef?.ZKLib ?? moduleRef;

    if (typeof Candidate === 'function') {
      try {
        return new Candidate(ip, port, 5000, 4000);
      } catch {
        try {
          return new Candidate({ ip, port });
        } catch {
          return null;
        }
      }
    }

    if (typeof moduleRef?.createClient === 'function') {
      return moduleRef.createClient({ ip, port }) as ZkClientLike;
    }
    return null;
  }
}

export const zkK40ListenerService = new ZkK40ListenerService();
