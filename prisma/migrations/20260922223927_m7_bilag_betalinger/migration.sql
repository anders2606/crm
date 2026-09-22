-- CreateEnum
CREATE TYPE "InvoicePaymentStatus" AS ENUM ('UNPAID', 'PARTIALLY_PAID', 'PAID');

-- CreateEnum
CREATE TYPE "BankStatementFormat" AS ENUM ('CAMT053', 'CSV');

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "contentHash" TEXT;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "paymentStatus" "InvoicePaymentStatus",
ADD COLUMN     "paymentSyncedAt" TIMESTAMP(3),
ADD COLUMN     "powerOfficeInvoiceNo" TEXT;

-- CreateTable
CREATE TABLE "supplier_invoice_statuses" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "powerOfficeId" TEXT NOT NULL,
    "invoiceNo" TEXT,
    "totalAmountMinor" INTEGER NOT NULL,
    "balanceMinor" INTEGER NOT NULL,
    "dueDate" DATE,
    "status" "InvoicePaymentStatus" NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_invoice_statuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_statement_imports" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "format" "BankStatementFormat" NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "importedById" TEXT,

    CONSTRAINT "bank_statement_imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_transactions" (
    "id" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "bookingDate" DATE NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "kid" TEXT,
    "reference" TEXT,
    "counterpartyName" TEXT,
    "matchedEntityType" TEXT,
    "matchedEntityId" TEXT,
    "matchedInvoiceNo" TEXT,
    "matchedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "supplier_invoice_statuses_supplierId_powerOfficeId_key" ON "supplier_invoice_statuses"("supplierId", "powerOfficeId");

-- CreateIndex
CREATE INDEX "bank_transactions_importId_idx" ON "bank_transactions"("importId");

-- CreateIndex
CREATE INDEX "bank_transactions_kid_idx" ON "bank_transactions"("kid");

-- CreateIndex
CREATE INDEX "documents_entityType_entityId_contentHash_idx" ON "documents"("entityType", "entityId", "contentHash");

-- AddForeignKey
ALTER TABLE "supplier_invoice_statuses" ADD CONSTRAINT "supplier_invoice_statuses_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_importId_fkey" FOREIGN KEY ("importId") REFERENCES "bank_statement_imports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
