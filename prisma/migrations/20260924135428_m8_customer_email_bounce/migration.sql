-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "emailBounced" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "emailBouncedAt" TIMESTAMP(3);
