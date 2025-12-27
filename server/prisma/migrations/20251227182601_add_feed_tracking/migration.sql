-- AlterTable
ALTER TABLE "Repo" ADD COLUMN     "lastFetchedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "lastSeenAt" TIMESTAMP(3);
