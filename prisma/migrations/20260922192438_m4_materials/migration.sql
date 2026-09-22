-- CreateEnum
CREATE TYPE "MaterialType" AS ENUM ('MARBLE', 'GRANITE', 'QUARTZITE', 'COMPOSITE', 'OTHER');

-- CreateEnum
CREATE TYPE "MaterialFinish" AS ENUM ('POLISHED', 'HONED', 'BRUSHED', 'OTHER');

-- CreateEnum
CREATE TYPE "MaterialAvailability" AS ENUM ('AVAILABLE', 'ON_ORDER', 'DISCONTINUED');

-- CreateEnum
CREATE TYPE "PriceEntryType" AS ENUM ('PURCHASE', 'SALE');

-- CreateTable
CREATE TABLE "materials" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tradeName" TEXT,
    "type" "MaterialType" NOT NULL,
    "origin" TEXT,
    "color" TEXT,
    "finish" "MaterialFinish",
    "thicknessesMm" INTEGER[],
    "slabSizes" TEXT[],
    "maintenanceNotes" TEXT,
    "availability" "MaterialAvailability" NOT NULL DEFAULT 'AVAILABLE',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material_suppliers" (
    "materialId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,

    CONSTRAINT "material_suppliers_pkey" PRIMARY KEY ("materialId","supplierId")
);

-- CreateTable
CREATE TABLE "price_entries" (
    "id" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "type" "PriceEntryType" NOT NULL,
    "supplierId" TEXT,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "amountNokMinor" INTEGER NOT NULL,
    "unit" TEXT NOT NULL,
    "priceDate" DATE NOT NULL,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "price_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exchange_rates" (
    "id" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "microNokPerUnit" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exchange_rates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "materials_type_idx" ON "materials"("type");

-- CreateIndex
CREATE INDEX "materials_name_idx" ON "materials"("name");

-- CreateIndex
CREATE INDEX "price_entries_materialId_type_priceDate_idx" ON "price_entries"("materialId", "type", "priceDate");

-- CreateIndex
CREATE INDEX "exchange_rates_currency_date_idx" ON "exchange_rates"("currency", "date");

-- CreateIndex
CREATE UNIQUE INDEX "exchange_rates_currency_date_key" ON "exchange_rates"("currency", "date");

-- AddForeignKey
ALTER TABLE "material_suppliers" ADD CONSTRAINT "material_suppliers_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_suppliers" ADD CONSTRAINT "material_suppliers_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_entries" ADD CONSTRAINT "price_entries_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_entries" ADD CONSTRAINT "price_entries_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
