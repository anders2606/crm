-- CreateEnum
CREATE TYPE "TemplateType" AS ENUM ('QUOTE', 'ORDER_CONFIRMATION', 'EMAIL', 'FOLLOWUP', 'NEWSLETTER');

-- CreateEnum
CREATE TYPE "TemplateStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('DRAFT', 'SENT', 'ANSWERED', 'ACCEPTED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('CONFIRMED', 'IN_PRODUCTION', 'DELIVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FollowUpScope" AS ENUM ('DEFAULT', 'CUSTOMER_GROUP', 'CUSTOMER', 'QUOTE');

-- CreateTable
CREATE TABLE "templates" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "type" "TemplateType" NOT NULL,
    "name" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'nb',
    "customerGroupId" TEXT,
    "content" TEXT NOT NULL,
    "status" "TemplateStatus" NOT NULL DEFAULT 'DRAFT',
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "text_blocks" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "name" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'nb',
    "content" TEXT NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "text_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotes" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "baseNumber" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "number" TEXT NOT NULL,
    "status" "QuoteStatus" NOT NULL DEFAULT 'DRAFT',
    "customerId" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'nb',
    "validUntil" DATE,
    "templateId" TEXT,
    "termsSnapshot" TEXT,
    "subtotalMinor" INTEGER NOT NULL DEFAULT 0,
    "discountMinor" INTEGER NOT NULL DEFAULT 0,
    "vatMinor" INTEGER NOT NULL DEFAULT 0,
    "totalMinor" INTEGER NOT NULL DEFAULT 0,
    "dbMinor" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'NOK',
    "lostReason" TEXT,
    "sentAt" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),
    "followUpsSent" INTEGER NOT NULL DEFAULT 0,
    "nextFollowUpAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_lines" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "materialId" TEXT,
    "description" TEXT NOT NULL,
    "quantityMilli" INTEGER NOT NULL,
    "unit" TEXT NOT NULL,
    "unitPriceMinor" INTEGER NOT NULL,
    "discountPercent" INTEGER NOT NULL DEFAULT 0,
    "vatRatePercent" INTEGER NOT NULL DEFAULT 25,
    "lineTotalMinor" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "quote_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'CONFIRMED',
    "advancePercent" INTEGER,
    "poweroffice_id" TEXT,
    "transferredToPowerOffice" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "follow_up_rules" (
    "id" TEXT NOT NULL,
    "scope" "FollowUpScope" NOT NULL,
    "customerGroupId" TEXT,
    "customerId" TEXT,
    "quoteId" TEXT,
    "daysSequence" INTEGER[],
    "templateId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "follow_up_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "templates_groupId_idx" ON "templates"("groupId");

-- CreateIndex
CREATE INDEX "templates_type_isCurrent_idx" ON "templates"("type", "isCurrent");

-- CreateIndex
CREATE INDEX "text_blocks_groupId_idx" ON "text_blocks"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "quotes_number_key" ON "quotes"("number");

-- CreateIndex
CREATE INDEX "quotes_groupId_idx" ON "quotes"("groupId");

-- CreateIndex
CREATE INDEX "quotes_customerId_idx" ON "quotes"("customerId");

-- CreateIndex
CREATE INDEX "quotes_status_idx" ON "quotes"("status");

-- CreateIndex
CREATE INDEX "quotes_nextFollowUpAt_idx" ON "quotes"("nextFollowUpAt");

-- CreateIndex
CREATE INDEX "quote_lines_quoteId_idx" ON "quote_lines"("quoteId");

-- CreateIndex
CREATE UNIQUE INDEX "orders_number_key" ON "orders"("number");

-- CreateIndex
CREATE UNIQUE INDEX "orders_quoteId_key" ON "orders"("quoteId");

-- CreateIndex
CREATE UNIQUE INDEX "orders_poweroffice_id_key" ON "orders"("poweroffice_id");

-- CreateIndex
CREATE UNIQUE INDEX "follow_up_rules_customerGroupId_key" ON "follow_up_rules"("customerGroupId");

-- CreateIndex
CREATE UNIQUE INDEX "follow_up_rules_customerId_key" ON "follow_up_rules"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "follow_up_rules_quoteId_key" ON "follow_up_rules"("quoteId");

-- AddForeignKey
ALTER TABLE "templates" ADD CONSTRAINT "templates_customerGroupId_fkey" FOREIGN KEY ("customerGroupId") REFERENCES "customer_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "materials"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "quotes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_up_rules" ADD CONSTRAINT "follow_up_rules_customerGroupId_fkey" FOREIGN KEY ("customerGroupId") REFERENCES "customer_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_up_rules" ADD CONSTRAINT "follow_up_rules_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_up_rules" ADD CONSTRAINT "follow_up_rules_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_up_rules" ADD CONSTRAINT "follow_up_rules_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex (TO-15: rask oppslag av alle revisjoner av samme tilbudsnummer)
CREATE INDEX "quotes_baseNumber_idx" ON "quotes"("baseNumber");

-- OP-05: nøyaktig ett av customerGroupId/customerId/quoteId skal være satt,
-- avhengig av scope (DEFAULT peker ikke på noe). Håndskrevet fordi Prisma
-- ikke uttrykker denne typen betingede constraints (samme mønster som
-- Address/ContactPerson/Consent i M1-migreringen).
ALTER TABLE "follow_up_rules" ADD CONSTRAINT "follow_up_rules_scope_target_check" CHECK (
    (scope = 'DEFAULT' AND "customerGroupId" IS NULL AND "customerId" IS NULL AND "quoteId" IS NULL) OR
    (scope = 'CUSTOMER_GROUP' AND "customerGroupId" IS NOT NULL AND "customerId" IS NULL AND "quoteId" IS NULL) OR
    (scope = 'CUSTOMER' AND "customerId" IS NOT NULL AND "customerGroupId" IS NULL AND "quoteId" IS NULL) OR
    (scope = 'QUOTE' AND "quoteId" IS NOT NULL AND "customerGroupId" IS NULL AND "customerId" IS NULL)
);

-- TO-15: løpende nummerering fra oppstart, egne serier per type, starter på
-- 10001 og gjenbrukes aldri (ekte Postgres-sekvenser, ikke en tellerkolonne,
-- slik at samtidige forespørsler aldri kan få samme nummer).
CREATE SEQUENCE "quote_number_seq" START WITH 10001;
CREATE SEQUENCE "order_number_seq" START WITH 10001;
