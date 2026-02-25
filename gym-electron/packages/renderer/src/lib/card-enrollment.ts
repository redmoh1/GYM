import type { EnrollCardResultDTO } from '@gym/shared';

import { api } from './api';

async function resolveConflict(memberId: number, result: EnrollCardResultDTO): Promise<EnrollCardResultDTO> {
  if (result.status !== 'CONFLICT') return result;

  const owner = result.currentOwnerName || `#${result.currentOwnerMemberId ?? '-'}`;
  const shouldTransfer = window.confirm(
    `هذه البطاقة مرتبطة حالياً باللاعب: ${owner}\nهل تريد نقل البطاقة إلى اللاعب الحالي؟`,
  );
  if (!shouldTransfer) {
    throw new Error('تم إلغاء ربط البطاقة.');
  }

  return api.k40.assignCard(memberId, result.cardId, true);
}

export async function enrollCardWithConflictResolution(memberId: number): Promise<string> {
  const initial = await api.k40.enrollCard(memberId, 10);
  const finalResult = await resolveConflict(memberId, initial);

  if (finalResult.status !== 'BOUND') {
    throw new Error('تعذر إتمام ربط البطاقة.');
  }
  return finalResult.cardId;
}

