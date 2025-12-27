/*
  Warnings:

  - You are about to drop the column `githubToken` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `openaiApiKey` on the `User` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "User" DROP COLUMN "githubToken",
DROP COLUMN "openaiApiKey";
