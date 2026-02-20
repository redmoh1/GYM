import path from 'path';

import fs from 'fs-extra';
import PDFDocument from 'pdfkit';
import * as XLSX from 'xlsx';

import { app } from 'electron';

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

export async function backupDatabase(targetPath: string): Promise<string> {
  const devDb = path.resolve(process.cwd(), 'packages', 'main', 'prisma', 'dev.db');
  const packedDb = path.resolve(process.resourcesPath, 'app.asar.unpacked', 'packages', 'main', 'prisma', 'dev.db');
  const fallback = path.resolve(app.getAppPath(), 'packages', 'main', 'prisma', 'dev.db');

  let source = fallback;
  if (await fs.pathExists(devDb)) source = devDb;
  else if (await fs.pathExists(packedDb)) source = packedDb;

  await fs.copy(source, targetPath);
  return targetPath;
}
