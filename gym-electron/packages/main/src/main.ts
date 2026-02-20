import fs from 'node:fs';
import path from 'node:path';
import { ChildProcess, spawn } from 'node:child_process';

import chokidar, { FSWatcher } from 'chokidar';
import { app, BrowserWindow, Menu, Notification, globalShortcut, ipcMain } from 'electron';
import log from 'electron-log';

import { registerIpcHandlers } from './ipc/handlers';
import { getDashboard } from './services/dashboard.service';
import { createAutoBackupOnExit } from './services/file.service';

const DEFAULT_BACKEND_PORT = '5050';
const DEFAULT_BACKEND_ENTRY = 'main.py';
const DEFAULT_BACKEND_EXECUTABLE = process.platform === 'win32' ? path.join('backend', 'backend.exe') : path.join('backend', 'backend');

const isDev = !app.isPackaged && process.env.NODE_ENV !== 'production';
let mainWindow: BrowserWindow | null = null;
let backendProcess: ChildProcess | null = null;
let backendWatcher: FSWatcher | null = null;
let backendRestartTimer: NodeJS.Timeout | null = null;
let isQuitting = false;

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

function resolveDevProjectRoot(): string {
  return path.resolve(process.cwd(), '..', '..', '..');
}

function resolveBackendPort(): string {
  return process.env.BACKEND_PORT || DEFAULT_BACKEND_PORT;
}

function resolveBackendEntryRelative(): string {
  return process.env.BACKEND_ENTRY || DEFAULT_BACKEND_ENTRY;
}

function resolveBackendWatchRelative(): string {
  const fromEnv = process.env.BACKEND_WATCH_DIR;
  if (fromEnv && fromEnv.trim()) return fromEnv;
  return path.dirname(resolveBackendEntryRelative());
}

function resolvePythonBin(): string {
  return process.env.PYTHON_BIN || 'python';
}

function resolveDevEntryAbsolute(): string {
  const rel = resolveBackendEntryRelative();
  if (path.isAbsolute(rel)) return rel;
  return path.resolve(resolveDevProjectRoot(), rel);
}

function resolveDevWatchAbsolute(): string {
  const rel = resolveBackendWatchRelative();
  if (path.isAbsolute(rel)) return rel;
  return path.resolve(resolveDevProjectRoot(), rel);
}

function resolveProdExecutableAbsolute(): string {
  const rel = process.env.BACKEND_EXECUTABLE || DEFAULT_BACKEND_EXECUTABLE;
  if (path.isAbsolute(rel)) return rel;
  return path.join(process.resourcesPath, rel);
}

function resolveProdEntryAbsolute(): string {
  const rel = resolveBackendEntryRelative();
  if (path.isAbsolute(rel)) return rel;
  return path.join(process.resourcesPath, rel);
}

function pipeBackendLogs(proc: ChildProcess, label: string): void {
  proc.stdout?.on('data', (chunk: Buffer) => {
    const text = chunk.toString().trim();
    if (text) {
      log.info(`[backend:${label}:stdout] ${text}`);
      console.log(`[backend:${label}:stdout] ${text}`);
    }
  });

  proc.stderr?.on('data', (chunk: Buffer) => {
    const text = chunk.toString().trim();
    if (text) {
      log.error(`[backend:${label}:stderr] ${text}`);
      console.error(`[backend:${label}:stderr] ${text}`);
    }
  });
}

function startBackendProcess(): void {
  const backendPort = resolveBackendPort();

  if (isDev) {
    const entry = resolveDevEntryAbsolute();
    const watchDir = resolveDevWatchAbsolute();

    if (!fs.existsSync(entry)) {
      log.error(`Backend entry not found in DEV: ${entry}`);
      console.error(`[backend] Backend entry not found in DEV: ${entry}`);
      return;
    }

    const python = resolvePythonBin();
    const cwd = path.dirname(entry);
    const args = [entry, '--port', backendPort];

    log.info(`Starting backend (DEV): ${python} ${args.join(' ')} (cwd=${cwd})`);
    backendProcess = spawn(python, args, {
      cwd,
      env: { ...process.env, BACKEND_PORT: backendPort },
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
      windowsHide: true,
    });

    pipeBackendLogs(backendProcess, 'dev');

    backendProcess.on('exit', (code, signal) => {
      log.warn(`Backend DEV process exited. code=${String(code)} signal=${String(signal)}`);
      backendProcess = null;
    });

    if (!backendWatcher && fs.existsSync(watchDir)) {
      backendWatcher = chokidar.watch(watchDir, {
        ignoreInitial: true,
        persistent: true,
        awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 80 },
      });

      backendWatcher.on('all', (eventName, changedPath) => {
        if (!changedPath.endsWith('.py')) return;
        log.info(`Python file changed (${eventName}): ${changedPath}`);
        scheduleBackendRestart();
      });

      log.info(`Watching python files in: ${watchDir}`);
      console.log(`[backend] watching .py files in: ${watchDir}`);
    }

    return;
  }

  const backendExe = resolveProdExecutableAbsolute();
  const backendPortArg = `--port=${backendPort}`;

  if (fs.existsSync(backendExe)) {
    log.info(`Starting backend (PROD executable): ${backendExe}`);
    backendProcess = spawn(backendExe, [backendPortArg], {
      cwd: path.dirname(backendExe),
      env: { ...process.env, BACKEND_PORT: backendPort },
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
      windowsHide: true,
    });
    pipeBackendLogs(backendProcess, 'prod-exe');
    backendProcess.on('exit', (code, signal) => {
      log.warn(`Backend PROD executable exited. code=${String(code)} signal=${String(signal)}`);
      backendProcess = null;
    });
    return;
  }

  const prodScriptEntry = resolveProdEntryAbsolute();
  if (!fs.existsSync(prodScriptEntry)) {
    log.error(`No backend executable and no python entry in resources. looked for: ${backendExe} and ${prodScriptEntry}`);
    console.error(`[backend] missing executable and script in resources: ${backendExe} | ${prodScriptEntry}`);
    return;
  }

  const python = resolvePythonBin();
  const args = [prodScriptEntry, '--port', backendPort];
  log.warn(`Backend executable not found; fallback to python script in resources: ${python} ${args.join(' ')}`);

  backendProcess = spawn(python, args, {
    cwd: path.dirname(prodScriptEntry),
    env: { ...process.env, BACKEND_PORT: backendPort },
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
    windowsHide: true,
  });

  pipeBackendLogs(backendProcess, 'prod-py');

  backendProcess.on('exit', (code, signal) => {
    log.warn(`Backend PROD python fallback exited. code=${String(code)} signal=${String(signal)}`);
    backendProcess = null;
  });
}

async function stopBackendProcess(): Promise<void> {
  const proc = backendProcess;
  backendProcess = null;

  if (!proc) return;

  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      try {
        if (!proc.killed) proc.kill('SIGKILL');
      } catch {
        // ignore
      }
      resolve();
    }, 3000);

    proc.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });

    try {
      proc.kill('SIGTERM');
    } catch {
      clearTimeout(timeout);
      resolve();
    }
  });
}

function scheduleBackendRestart(): void {
  if (backendRestartTimer) {
    clearTimeout(backendRestartTimer);
    backendRestartTimer = null;
  }

  backendRestartTimer = setTimeout(() => {
    backendRestartTimer = null;
    void restartBackendProcess();
  }, 180);
}

async function restartBackendProcess(): Promise<void> {
  if (isQuitting) return;
  await stopBackendProcess();
  startBackendProcess();
}

async function shutdownBackendManager(): Promise<void> {
  isQuitting = true;

  if (backendRestartTimer) {
    clearTimeout(backendRestartTimer);
    backendRestartTimer = null;
  }

  if (backendWatcher) {
    await backendWatcher.close();
    backendWatcher = null;
  }

  await stopBackendProcess();
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

  startBackendProcess();

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

app.on('before-quit', () => {
  void (async () => {
    if (process.env.SKIP_AUTO_BACKUP_ON_QUIT === '1') {
      await shutdownBackendManager();
      return;
    }

    try {
      await createAutoBackupOnExit();
    } catch (error) {
      log.error(`Auto backup failed on exit: ${String(error)}`);
    }
    await shutdownBackendManager();
  })();
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
