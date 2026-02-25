import type { EnrollCardResultDTO } from '@gym/shared';

import { api } from './api';

function shouldAskForPin(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /pin|strict mode|manager/i.test(message);
}

function askForPin(promptText: string): string | null {
  const input = window.prompt(promptText, '');
  if (!input) return null;
  return input.trim() || null;
}

async function resolveConflict(memberId: number, result: EnrollCardResultDTO): Promise<EnrollCardResultDTO> {
  if (result.status !== 'CONFLICT') return result;

  const owner = result.currentOwnerName || `#${result.currentOwnerMemberId ?? '-'}`;
  const shouldTransfer = window.confirm(
    `هذه البطاقة مرتبطة باللاعب: ${owner}\nهل تريد نقل البطاقة لهذا اللاعب؟`,
  );

  if (!shouldTransfer) {
    throw new Error('تم إلغاء نقل البطاقة.');
  }

  const pin = askForPin('أدخل PIN المدير لنقل البطاقة:');
  if (!pin) {
    throw new Error('تم إلغاء العملية.');
  }

  return api.k40.assignCard(memberId, result.cardId, true, pin);
}

export async function enrollCardWithConflictResolution(memberId: number): Promise<string> {
  let managerPin: string | undefined;
  let initial: EnrollCardResultDTO;

  try {
    initial = await api.k40.enrollCard(memberId, 10);
  } catch (error) {
    if (!shouldAskForPin(error)) throw error;

    const pin = askForPin('أدخل PIN المدير لإكمال الربط:');
    if (!pin) {
      throw new Error('تم إلغاء العملية.');
    }

    managerPin = pin;
    initial = await api.k40.enrollCard(memberId, 10, managerPin);
  }

  const finalResult = await resolveConflict(memberId, initial);

  if (finalResult.status !== 'BOUND') {
    throw new Error('تعذر إتمام ربط البطاقة.');
  }

  return finalResult.cardId;
}