import path from 'path';

import fs from 'fs-extra';
import PDFDocument from 'pdfkit';
import * as XLSX from 'xlsx';

import { app } from 'electron';

import { connectDatabase, disconnectDatabase, prisma } from '../db/client';
import { listMembers } from './member.service';

export async function exportMembersExcel(targetPath: string): Promise<string> {
  const members = await listMembers({});
  const rows = members.map((m) => ({
    ID: m.id,
    Name: m.fullName,
    Phone: m.phone,
    StartDate: m.startDate,
    DurationMonths: m.durationMonths,
    EndDate: m.endDate,
    Status: m.status,
    DaysLeft: m.daysLeft,
    Notes: m.notes,
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'Members');
  XLSX.writeFile(wb, targetPath);

  return targetPath;
}

export async function exportMembersPdf(targetPath: string): Promise<string> {
  const members = await listMembers({});

  await new Promise<void>((resolve, reject) => {
    const doc = new PDFDocument({ margin: 30 });
    const stream = fs.createWriteStream(targetPath);

    doc.pipe(stream);
    doc.fontSize(18).text('Gym Members Report');
    doc.moveDown();

    members.forEach((m) => {
      doc
        .fontSize(11)
        .text(`#${m.id} | ${m.fullName} | ${m.phone} | ${m.status} | End: ${m.endDate}`);
    });

    doc.end();

    stream.on('finish', () => resolve());
    stream.on('error', reject);
  });

  return targetPath;
}

function formatBackupFilename(prefix = 'نسخة_احتياطية'): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const h = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  return `${prefix}_${y}_${m}_${d}_${h}_${min}.db`;
}

export function getDefaultBackupName(): string {
  return formatBackupFilename();
}

export async function resolveDatabasePath(): Promise<string> {
  // Most reliable: ask SQLite itself for the currently attached main DB file.
  try {
    const dbRows = await prisma.$queryRawUnsafe<Array<{ name: string; file: string }>>('PRAGMA database_list;');
    const mainDb = dbRows.find((row) => row.name === 'main' && row.file);
    if (mainDb?.file && (await fs.pathExists(mainDb.file))) {
      return mainDb.file;
    }
  } catch {
    // fallback to path probing below
  }

  const candidates = [
    // Monorepo root (when cwd is gym-electron)
    path.resolve(process.cwd(), 'packages', 'main', 'prisma', 'dev.db'),
    // Main workspace cwd (when cwd is gym-electron/packages/main)
    path.resolve(process.cwd(), 'prisma', 'dev.db'),
    // Running from dist/main/src
    path.resolve(__dirname, '..', '..', '..', 'prisma', 'dev.db'),
    // Packaged app (unpacked resources)
    path.resolve(process.resourcesPath, 'app.asar.unpacked', 'packages', 'main', 'prisma', 'dev.db'),
    // Packaged app fallback
    path.resolve(app.getAppPath(), 'packages', 'main', 'prisma', 'dev.db'),
  ];

  for (const candidate of candidates) {
    if (await fs.pathExists(candidate)) return candidate;
  }

  throw new Error(`تعذر العثور على قاعدة البيانات. paths=${candidates.join(' | ')}`);
}

export async function backupDatabase(targetPath: string): Promise<string> {
  const source = await resolveDatabasePath();

  // Disconnect then reconnect to avoid copying during active writes.
  await disconnectDatabase();
  try {
    await fs.copy(source, targetPath, { overwrite: true, errorOnExist: false });
  } finally {
    await connectDatabase();
  }

  return targetPath;
}

export async function restoreDatabase(backupFilePath: string): Promise<void> {
  const dbPath = await resolveDatabasePath();
  if (!(await fs.pathExists(backupFilePath))) {
    throw new Error('ملف النسخة الاحتياطية غير موجود');
  }

  // Ensure DB is not open before replacing file.
  await disconnectDatabase();

  const tempPath = `${dbPath}.restore_tmp`;
  await fs.copy(backupFilePath, tempPath, { overwrite: true, errorOnExist: false });
  await fs.move(tempPath, dbPath, { overwrite: true });
}

export async function createAutoBackupOnExit(): Promise<string | null> {
  const backupDir = path.join(app.getPath('documents'), 'النسخ_الاحتياطية');
  await fs.ensureDir(backupDir);
  const targetPath = path.join(backupDir, formatBackupFilename('نسخة_تلقائية'));
  return backupDatabase(targetPath);
}
