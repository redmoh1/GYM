import { contextBridge, ipcRenderer } from 'electron';

import type {
  AppSettings,
  DashboardDTO,
  MemberDTO,
  MemberPayload,
  MembersQuery,
  RenewalPayload,
} from '@gym/shared';

const api = {
  members: {
    list: (query: MembersQuery = {}) => ipcRenderer.invoke('members:list', query) as Promise<MemberDTO[]>,
    get: (id: number) => ipcRenderer.invoke('members:get', id) as Promise<MemberDTO | null>,
    create: (payload: MemberPayload) => ipcRenderer.invoke('members:create', payload) as Promise<MemberDTO>,
    update: (id: number, payload: MemberPayload) =>
      ipcRenderer.invoke('members:update', id, payload) as Promise<MemberDTO>,
    delete: (id: number) => ipcRenderer.invoke('members:delete', id) as Promise<void>,
    renew: (payload: RenewalPayload) => ipcRenderer.invoke('members:renew', payload) as Promise<MemberDTO>,
  },
  dashboard: {
    get: () => ipcRenderer.invoke('dashboard:get') as Promise<DashboardDTO>,
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get') as Promise<AppSettings>,
    update: (payload: Partial<AppSettings>) =>
      ipcRenderer.invoke('settings:update', payload) as Promise<AppSettings>,
  },
  exportExcel: () => ipcRenderer.invoke('export:excel') as Promise<string | null>,
  exportPdf: () => ipcRenderer.invoke('export:pdf') as Promise<string | null>,
  backupDatabase: () => ipcRenderer.invoke('backup:create') as Promise<string | null>,
  restoreDatabase: () =>
    ipcRenderer.invoke('backup:restore') as Promise<{ restored: boolean }>,
  writeLog: (message: string) => ipcRenderer.invoke('logs:write', message) as Promise<boolean>,
  onShortcut: (handler: (action: string) => void) => {
    const listener = (_: unknown, action: string) => handler(action);
    ipcRenderer.on('shortcut:trigger', listener);
    return () => ipcRenderer.removeListener('shortcut:trigger', listener);
  },
};

contextBridge.exposeInMainWorld('api', api);
