import path from 'path';

import { app, BrowserWindow, Menu, Notification, globalShortcut, ipcMain } from 'electron';
import log from 'electron-log';

import { registerIpcHandlers } from './ipc/handlers';
import { getDashboard } from './services/dashboard.service';

const isDev = process.env.NODE_ENV === 'development';
let mainWindow: BrowserWindow | null = null;

function resolveRendererUrl(): string {
  return 'http://localhost:5190';
}

function resolveRendererIndex(): string {
  return path.join(process.cwd(), 'packages', 'renderer', 'dist', 'index.html');
}

function resolvePreloadPath(): string {
  return path.join(__dirname, 'preload.js');
}

function resolveSplash(): string {
  return path.join(process.cwd(), 'packages', 'renderer', 'public', 'splash', 'splash.html');
}

async function createMainWindow() {
  const splash = new BrowserWindow({
    width: 460,
    height: 300,
    frame: false,
    transparent: false,
    alwaysOnTop: true,
    resizable: false,
    show: true,
  });

  splash.loadFile(resolveSplash());

  mainWindow = new BrowserWindow({
    width: 1420,
    height: 920,
    minWidth: 1180,
    minHeight: 720,
    show: false,
    webPreferences: {
      preload: resolvePreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    await mainWindow.loadURL(resolveRendererUrl());
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    await mainWindow.loadFile(resolveRendererIndex());
  }

  mainWindow.webContents.on('did-fail-load', (_event, code, desc, url) => {
    const html = `
      <html><body style="font-family:Segoe UI;padding:20px">
      <h2>Renderer Load Failed</h2>
      <p><b>Code:</b> ${code}</p>
      <p><b>Description:</b> ${desc}</p>
      <p><b>URL:</b> ${url}</p>
      <p>تأكد أن Vite يعمل على http://127.0.0.1:5190</p>
      </body></html>
    `;
    void mainWindow?.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  });

  mainWindow.once('ready-to-show', () => {
    splash.close();
    mainWindow?.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  const dashboard = await getDashboard();
  const expiringCount = dashboard.counters.expiringSoon;
  const expiredCount = dashboard.counters.expired;

  if (expiringCount > 0 || expiredCount > 0) {
    new Notification({
      title: 'GymManager',
      body: `تنبيه: ${expiringCount} قريب ينتهي - ${expiredCount} منتهي`,
    }).show();
  }
}

function registerShortcuts() {
  globalShortcut.register('CommandOrControl+N', () => {
    mainWindow?.webContents.send('shortcut:trigger', 'add-member');
  });

  globalShortcut.register('CommandOrControl+R', () => {
    mainWindow?.webContents.send('shortcut:trigger', 'renew');
  });
}

app.whenReady().then(async () => {
  log.initialize();
  log.info('Application started');

  Menu.setApplicationMenu(null);
  registerIpcHandlers();
  registerShortcuts();

  await createMainWindow();

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

ipcMain.on('renderer:error', (_, message: string) => {
  log.error(message);
});
