-- AlterTable
ALTER TABLE "Member" ADD COLUMN "subscriptionType" TEXT NOT NULL DEFAULT 'MONTHLY';
ALTER TABLE "Member" ADD COLUMN "sessionsTotal" INTEGER;
ALTER TABLE "Member" ADD COLUMN "sessionsRemaining" INTEGER;
ALTER TABLE "Member" ADD COLUMN "sessionsExpiryDate" DATETIME;

-- AlterTable
ALTER TABLE "Checkin" ADD COLUMN "consumedSessions" INTEGER NOT NULL DEFAULT 0;
