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
  if (!(await hasColumn('Member', 'subscriptionType'))) {
    await prisma.$executeRawUnsafe(`ALTER TABLE "Member" ADD COLUMN "subscriptionType" TEXT NOT NULL DEFAULT 'MONTHLY'`);
  }
  if (!(await hasColumn('Member', 'sessionsTotal'))) {
    await prisma.$executeRawUnsafe(`ALTER TABLE "Member" ADD COLUMN "sessionsTotal" INTEGER`);
  }
  if (!(await hasColumn('Member', 'sessionsRemaining'))) {
    await prisma.$executeRawUnsafe(`ALTER TABLE "Member" ADD COLUMN "sessionsRemaining" INTEGER`);
  }
  if (!(await hasColumn('Member', 'sessionsExpiryDate'))) {
    await prisma.$executeRawUnsafe(`ALTER TABLE "Member" ADD COLUMN "sessionsExpiryDate" DATETIME`);
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
      "consumedSessions" INTEGER NOT NULL DEFAULT 0,
      CONSTRAINT "Checkin_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member" ("id") ON DELETE SET NULL ON UPDATE CASCADE
    )
  `);
  if (!(await hasColumn('Checkin', 'consumedSessions'))) {
    await prisma.$executeRawUnsafe(`ALTER TABLE "Checkin" ADD COLUMN "consumedSessions" INTEGER NOT NULL DEFAULT 0`);
  }
  if (!(await hasColumn('Checkin', 'reason'))) {
    await prisma.$executeRawUnsafe(`ALTER TABLE "Checkin" ADD COLUMN "reason" TEXT NOT NULL DEFAULT ''`);
  }
  if (!(await hasColumn('Checkin', 'result'))) {
    await prisma.$executeRawUnsafe(`ALTER TABLE "Checkin" ADD COLUMN "result" TEXT NOT NULL DEFAULT 'UNKNOWN'`);
  }
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
