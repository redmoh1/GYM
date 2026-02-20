-- CreateTable
CREATE TABLE "Member" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "fullName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "startDate" DATETIME NOT NULL,
    "durationMonths" INTEGER NOT NULL DEFAULT 1,
    "endDate" DATETIME NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "planId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Member_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "memberId" INTEGER NOT NULL,
    "planId" INTEGER,
    "amount" REAL NOT NULL,
    "months" INTEGER NOT NULL DEFAULT 1,
    "paidAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "method" TEXT NOT NULL DEFAULT 'cash',
    "note" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "Payment_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Payment_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Plan" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "months" INTEGER NOT NULL,
    "price" REAL NOT NULL
);

-- CreateTable
CREATE TABLE "Setting" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL
);

-- Indexes
CREATE UNIQUE INDEX "Plan_name_key" ON "Plan"("name");
CREATE UNIQUE INDEX "Setting_key_key" ON "Setting"("key");
CREATE INDEX "Member_fullName_idx" ON "Member"("fullName");
CREATE INDEX "Member_phone_idx" ON "Member"("phone");
CREATE INDEX "Member_endDate_idx" ON "Member"("endDate");
CREATE INDEX "Payment_memberId_idx" ON "Payment"("memberId");
CREATE INDEX "Payment_paidAt_idx" ON "Payment"("paidAt");