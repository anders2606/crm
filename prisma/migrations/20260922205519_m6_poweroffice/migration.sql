-- CreateEnum
CREATE TYPE "PowerOfficeEnvironment" AS ENUM ('DEMO', 'PRODUCTION');

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "balanceSyncedAt" TIMESTAMP(3),
ADD COLUMN     "outstandingBalanceMinor" INTEGER,
ADD COLUMN     "overdueAmountMinor" INTEGER;

-- CreateTable
CREATE TABLE "poweroffice_settings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "environment" "PowerOfficeEnvironment" NOT NULL DEFAULT 'DEMO',
    "encryptedApplicationKey" TEXT,
    "encryptedClientKey" TEXT,
    "encryptedSubscriptionKey" TEXT,
    "writeEnabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "poweroffice_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_logs" (
    "id" TEXT NOT NULL,
    "integration" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "status" TEXT NOT NULL,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sync_logs_integration_createdAt_idx" ON "sync_logs"("integration", "createdAt");

-- CreateIndex
CREATE INDEX "sync_logs_status_idx" ON "sync_logs"("status");
