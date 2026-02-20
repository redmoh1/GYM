import type { AppSettings } from '@gym/shared';

import { prisma } from '../db/client';

const DEFAULTS: AppSettings = {
  expiringSoonDays: 7,
  currency: 'EGP',
  gymName: 'Pro Gym',
};

export async function getSettings(): Promise<AppSettings> {
  const rows = await prisma.setting.findMany();
  const map = new Map(rows.map((r) => [r.key, r.value]));

  return {
    expiringSoonDays: Number(map.get('expiringSoonDays') ?? DEFAULTS.expiringSoonDays),
    currency: map.get('currency') ?? DEFAULTS.currency,
    gymName: map.get('gymName') ?? DEFAULTS.gymName,
  };
}

export async function updateSettings(next: Partial<AppSettings>): Promise<AppSettings> {
  const entries = Object.entries(next).filter(([, v]) => v !== undefined);

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