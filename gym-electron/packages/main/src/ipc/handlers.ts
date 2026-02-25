import path from 'path';

import type { AppSettings, CheckinResult, MemberPayload, MembersQuery, RenewalPayload } from '@gym/shared';

import { dialog, ipcMain } from 'electron';
import log from 'electron-log';

import { app } from 'electron';

import {
  backupDatabase,
  exportMembersExcel,
  exportMembersPdf,
  getDefaultBackupName,
  restoreDatabase,
} from '../services/file.service';
import {
  createMember,
  deleteMember,
  getMemberById,
  listMembers,
  renewMember,
  updateMember,
} from '../services/member.service';
import { k40AccessService } from '../services/k40-access.service';
import { setManagerPin, verifyManagerPin } from '../services/security.service';
import { getSettings, updateSettings } from '../services/settings.service';
import { getDashboard } from '../services/dashboard.service';

export function registerIpcHandlers(): void {
  ipcMain.handle('members:list', async (_, query: MembersQuery) => listMembers(query));
  ipcMain.handle('members:get', async (_, id: number) => getMemberById(id));
  ipcMain.handle('members:create', async (_, payload: MemberPayload, managerPin?: string) => createMember(payload, managerPin));
  ipcMain.handle('members:update', async (_, id: number, payload: MemberPayload) => updateMember(id, payload));
  ipcMain.handle('members:delete', async (_, id: number, managerPin?: string) => deleteMember(id, managerPin));
  ipcMain.handle('members:renew', async (_, payload: RenewalPayload) => renewMember(payload));

  ipcMain.handle('dashboard:get', async () => getDashboard());

  ipcMain.handle('settings:get', async () => getSettings());
  ipcMain.handle('settings:update', async (_, payload: Partial<AppSettings>) => updateSettings(payload));
  ipcMain.handle('security:verify-pin', async (_, pin: string) => verifyManagerPin(pin));
  ipcMain.handle('security:set-pin', async (_, pin: string) => {
    await setManagerPin(pin);
    return true;
  });

  ipcMain.handle('k40:state', async () => k40AccessService.getState());
  ipcMain.handle('k40:recent', async (_, limit?: number) => k40AccessService.getRecentCheckins(limit ?? 10));
  ipcMain.handle('k40:capture-card', async (_, timeoutSeconds?: number) => k40AccessService.captureNextCard(timeoutSeconds ?? 10));
  ipcMain.handle('k40:enroll-card', async (_, memberId: number, timeoutSeconds?: number, managerPin?: string) =>
    k40AccessService.enrollMemberCard(memberId, timeoutSeconds ?? 10, managerPin),
  );
  ipcMain.handle(
    'k40:assign-card',
    async (_, memberId: number, cardId: string, forceTransfer?: boolean, managerPin?: string) =>
      k40AccessService.assignCardToMember(memberId, cardId, Boolean(forceTransfer), managerPin),
  );
  ipcMain.handle(
    'k40:record-manual-checkin',
    async (_, memberId: number, cardId: string, result: CheckinResult, reason: string) =>
      k40AccessService.recordManualCheckin(memberId, cardId, result, reason),
  );

  ipcMain.handle('export:excel', async () => {
    const result = await dialog.showSaveDialog({
      title: 'Export Excel',
      defaultPath: path.join(process.cwd(), `members-${Date.now()}.xlsx`),
      filters: [{ name: 'Excel', extensions: ['xlsx'] }],
    });

    if (result.canceled || !result.filePath) return null;
    return exportMembersExcel(result.filePath);
  });

  ipcMain.handle('export:pdf', async () => {
    const result = await dialog.showSaveDialog({
      title: 'Export PDF',
      defaultPath: path.join(process.cwd(), `members-${Date.now()}.pdf`),
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });

    if (result.canceled || !result.filePath) return null;
    return exportMembersPdf(result.filePath);
  });

  ipcMain.handle('backup:create', async () => {
    const result = await dialog.showSaveDialog({
      title: 'تحميل نسخة احتياطية',
      defaultPath: path.join(app.getPath('documents'), getDefaultBackupName()),
      filters: [{ name: 'Database', extensions: ['db'] }],
    });

    if (result.canceled || !result.filePath) return null;
    return backupDatabase(result.filePath);
  });

  ipcMain.handle('backup:restore', async () => {
    const openResult = await dialog.showOpenDialog({
      title: 'استرجاع نسخة احتياطية',
      properties: ['openFile'],
      filters: [{ name: 'Database', extensions: ['db'] }],
    });
    if (openResult.canceled || openResult.filePaths.length === 0) return { restored: false };

    const selectedBackup = openResult.filePaths[0];
    await restoreDatabase(selectedBackup);

    process.env.SKIP_AUTO_BACKUP_ON_QUIT = '1';
    setTimeout(() => {
      app.relaunch();
      app.quit();
    }, 350);

    return { restored: true };
  });

  ipcMain.handle('logs:write', async (_, message: string) => {
    log.info(message);
    return true;
  });
}