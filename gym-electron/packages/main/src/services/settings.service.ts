import type { AppSettings } from '@gym/shared';

import { prisma } from '../db/client';

const DEFAULTS: AppSettings = {
  expiringSoonDays: 7,
  currency: 'EGP',
  gymName: 'Pro Gym',
  deviceIp: '',
  devicePort: 4370,
  deviceName: 'ZKTeco K40',
  enableDeviceListener: true,
};

export async function getSettings(): Promise<AppSettings> {
  const rows = await prisma.setting.findMany();
  const map = new Map(rows.map((r) => [r.key, r.value]));

  const enabledRaw = (map.get('enableDeviceListener') ?? String(DEFAULTS.enableDeviceListener)).toLowerCase();
  const enableDeviceListener = enabledRaw === 'true' || enabledRaw === '1';
  const port = Number(map.get('devicePort') ?? DEFAULTS.devicePort);

  return {
    expiringSoonDays: Number(map.get('expiringSoonDays') ?? DEFAULTS.expiringSoonDays),
    currency: map.get('currency') ?? DEFAULTS.currency,
    gymName: map.get('gymName') ?? DEFAULTS.gymName,
    deviceIp: map.get('deviceIp') ?? DEFAULTS.deviceIp,
    devicePort: Number.isFinite(port) ? Math.max(1, Math.min(port, 65535)) : DEFAULTS.devicePort,
    deviceName: map.get('deviceName') ?? DEFAULTS.deviceName,
    enableDeviceListener,
  };
}

export async function updateSettings(next: Partial<AppSettings>): Promise<AppSettings> {
  const normalized: Partial<AppSettings> = {
    ...next,
    deviceIp: next.deviceIp?.trim(),
    deviceName: next.deviceName?.trim() || undefined,
    devicePort: next.devicePort !== undefined ? Math.max(1, Math.min(Number(next.devicePort), 65535)) : undefined,
  };
  const entries = Object.entries(normalized).filter(([, v]) => v !== undefined);

  await Promise.all(
    entries.map(([key, value]) =>
      prisma.setting.upsert({
        where: { key },
        update: { value: String(value) },
        create: { key, value: String(value) },
      }),
    ),
  );

  return getSettings();
}
