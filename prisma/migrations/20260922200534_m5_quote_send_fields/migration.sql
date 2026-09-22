-- AlterTable
ALTER TABLE "quotes" ADD COLUMN     "selectedTextBlockIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "sentViaEmailAccountId" TEXT;
