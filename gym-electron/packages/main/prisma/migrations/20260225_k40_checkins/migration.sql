-- AlterTable
ALTER TABLE "Member" ADD COLUMN "cardId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Member" ADD COLUMN "photoPath" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "Checkin" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "memberId" INTEGER,
    "cardId" TEXT NOT NULL,
    "deviceName" TEXT NOT NULL,
    "checkedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "result" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    CONSTRAINT "Checkin_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- Indexes
CREATE INDEX "Member_cardId_idx" ON "Member"("cardId");
CREATE INDEX "Checkin_checkedAt_idx" ON "Checkin"("checkedAt");
CREATE INDEX "Checkin_memberId_idx" ON "Checkin"("memberId");
CREATE INDEX "Checkin_cardId_idx" ON "Checkin"("cardId");

