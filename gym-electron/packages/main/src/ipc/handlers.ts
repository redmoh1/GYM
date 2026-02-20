import path from 'path';

import type { AppSettings, MemberPayload, MembersQuery, RenewalPayload } from '@gym/shared';

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
import { getSettings, updateSettings } from '../services/settings.service';
import { getDashboard } from '../services/dashboard.service';

export function registerIpcHandlers(): void {
  ipcMain.handle('members:list', async (_, query: MembersQuery) => listMembers(query));
  ipcMain.handle('members:get', async (_, id: number) => getMemberById(id));
  ipcMain.handle('members:create', async (_, payload: MemberPayload) => createMember(payload));
  ipcMain.handle('members:update', async (_, id: number, payload: MemberPayload) => updateMember(id, payload));
  ipcMain.handle('members:delete', async (_, id: number) => deleteMember(id));
  ipcMain.handle('members:renew', async (_, payload: RenewalPayload) => renewMember(payload));

  ipcMain.handle('dashboard:get', async () => getDashboard());

  ipcMain.handle('settings:get', async () => getSettings());
  ipcMain.handle('settings:update', async (_, payload: Partial<AppSettings>) => updateSettings(payload));

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

    // Prevent auto-backup from running during restore-triggered restart.
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
