/*
  Warnings:

  - You are about to drop the column `emailAccountId` on the `campaign_settings` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "campaign_settings" DROP CONSTRAINT "campaign_settings_emailAccountId_fkey";

-- AlterTable
ALTER TABLE "campaign_settings" DROP COLUMN "emailAccountId";

-- AlterTable
ALTER TABLE "templates" ADD COLUMN     "subject" TEXT;
