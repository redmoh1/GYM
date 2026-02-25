import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var prismaClient: PrismaClient | undefined;
}

export const prisma = global.prismaClient ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  global.prismaClient = prisma;
}

let runtimeSchemaEnsured = false;

async function hasColumn(table: string, column: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ name: string }>>(`PRAGMA table_info("${table}")`);
  return rows.some((row) => row.name === column);
}

export async function ensureRuntimeSchema(): Promise<void> {
  if (runtimeSchemaEnsured) return;

  if (!(await hasColumn('Member', 'cardId'))) {
    await prisma.$executeRawUnsafe(`ALTER TABLE "Member" ADD COLUMN "cardId" TEXT NOT NULL DEFAULT ''`);
  }

  if (!(await hasColumn('Member', 'photoPath'))) {
    await prisma.$executeRawUnsafe(`ALTER TABLE "Member" ADD COLUMN "photoPath" TEXT NOT NULL DEFAULT ''`);
  }

  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Member_cardId_idx" ON "Member"("cardId")`);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Checkin" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "memberId" INTEGER,
      "cardId" TEXT NOT NULL,
      "deviceName" TEXT NOT NULL,
      "checkedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "result" TEXT NOT NULL,
      "reason" TEXT NOT NULL,
      CONSTRAINT "Checkin_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member" ("id") ON DELETE SET NULL ON UPDATE CASCADE
    )
  `);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Checkin_checkedAt_idx" ON "Checkin"("checkedAt")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Checkin_memberId_idx" ON "Checkin"("memberId")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Checkin_cardId_idx" ON "Checkin"("cardId")`);

  runtimeSchemaEnsured = true;
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}

export async function connectDatabase(): Promise<void> {
  await prisma.$connect();
}
