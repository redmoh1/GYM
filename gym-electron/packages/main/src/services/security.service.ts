import { createHash } from 'node:crypto';

import { prisma } from '../db/client';
import { getSettings } from './settings.service';

const MANAGER_PIN_HASH_KEY = 'managerPinHash';

export function hashManagerPin(pin: string): string {
  return createHash('sha256').update(pin.trim()).digest('hex');
}

export async function setManagerPin(pin: string): Promise<void> {
  const normalized = pin.trim();
  if (normalized.length < 4) {
    throw new Error('PIN must be at least 4 characters.');
  }

  await prisma.setting.upsert({
    where: { key: MANAGER_PIN_HASH_KEY },
    update: { value: hashManagerPin(normalized) },
    create: { key: MANAGER_PIN_HASH_KEY, value: hashManagerPin(normalized) },
  });
}

export async function hasManagerPinConfigured(): Promise<boolean> {
  const row = await prisma.setting.findUnique({ where: { key: MANAGER_PIN_HASH_KEY } });
  return Boolean(row?.value?.trim());
}

export async function verifyManagerPin(pin: string): Promise<boolean> {
  const normalized = pin.trim();
  if (!normalized) return false;

  const row = await prisma.setting.findUnique({ where: { key: MANAGER_PIN_HASH_KEY } });
  const stored = row?.value?.trim();
  if (!stored) return false;

  return stored === hashManagerPin(normalized);
}

export async function requireManagerPinForTransfer(managerPin?: string): Promise<void> {
  if (!managerPin?.trim()) {
    throw new Error('Manager PIN is required to transfer this card.');
  }

  const isValid = await verifyManagerPin(managerPin);
  if (!isValid) {
    throw new Error('Invalid manager PIN.');
  }
}

export async function requireManagerPinForDelete(managerPin?: string): Promise<void> {
  if (!managerPin?.trim()) {
    throw new Error('Manager PIN is required to delete a member.');
  }

  const isValid = await verifyManagerPin(managerPin);
  if (!isValid) {
    throw new Error('Invalid manager PIN.');
  }
}

export async function requireManagerPinIfStrict(actionLabel: string, managerPin?: string): Promise<void> {
  const settings = await getSettings();
  if (!settings.strictMode) return;

  if (!settings.managerPinConfigured) {
    throw new Error(`Strict mode is enabled. Configure manager PIN before: ${actionLabel}`);
  }

  if (!managerPin?.trim()) {
    throw new Error(`Manager PIN is required in strict mode: ${actionLabel}`);
  }

  const isValid = await verifyManagerPin(managerPin);
  if (!isValid) {
    throw new Error('Invalid manager PIN.');
  }
}