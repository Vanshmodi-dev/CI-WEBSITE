-- AlterTable
ALTER TABLE "admin_users" ADD COLUMN     "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "firstFailedLoginAt" TIMESTAMP(3),
ADD COLUMN     "sessionsValidFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "enquiries" ALTER COLUMN "ipHash" DROP NOT NULL;
