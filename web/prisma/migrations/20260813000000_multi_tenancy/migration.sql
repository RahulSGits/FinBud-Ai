-- Multi-tenancy, phase 1: the tenant, and everything hung off it.
--
-- Additive and reversible in effect: every companyId is NULLABLE, so the app
-- keeps working through the deploy whether or not the backfill has run. A
-- later migration tightens them to NOT NULL once every row is assigned and the
-- code that sets them is live.
--
-- Two unique constraints change because they are wrong under tenancy:
--   Contact.phone   — globally unique meant the first company to import a lead
--                     permanently blocked every other company from holding it.
--   User.employeeId — FB-001 exists in every company.
-- Both become composite with companyId.
--
-- NOTE ON THE ENUM: Postgres forbids USING a new enum value in the same
-- transaction that adds it. The backfill below therefore assigns companies
-- only; nobody is promoted to super_admin here. scripts/promote-super-admin.mjs
-- does that afterwards, as a separate committed statement.

-- CreateEnum
CREATE TYPE "CompanyStatus" AS ENUM ('pending', 'active', 'suspended');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Role" ADD VALUE 'super_admin';
ALTER TYPE "Role" ADD VALUE 'manager';
ALTER TYPE "Role" ADD VALUE 'viewer';

-- DropIndex
DROP INDEX "Contact_phone_key";

-- DropIndex
DROP INDEX "User_employeeId_key";

-- AlterTable
ALTER TABLE "Agent" ADD COLUMN     "companyId" TEXT;

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "companyId" TEXT;

-- AlterTable
ALTER TABLE "Call" ADD COLUMN     "companyId" TEXT;

-- AlterTable
ALTER TABLE "CallFinding" ADD COLUMN     "companyId" TEXT;

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "companyId" TEXT;

-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "companyId" TEXT;

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "companyId" TEXT;

-- AlterTable
ALTER TABLE "Invite" ADD COLUMN     "companyId" TEXT;

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "companyId" TEXT;

-- AlterTable
ALTER TABLE "MessageTemplate" ADD COLUMN     "companyId" TEXT;

-- AlterTable
ALTER TABLE "Note" ADD COLUMN     "companyId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "companyId" TEXT;

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "CompanyStatus" NOT NULL DEFAULT 'pending',
    "contactName" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "requestNotes" TEXT,
    "theme" JSONB,
    "logoUrl" TEXT,
    "maxUsers" INTEGER,
    "maxAgents" INTEGER,
    "maxCampaigns" INTEGER,
    "maxContacts" INTEGER,
    "maxCallsPerDay" INTEGER,
    "maxCallMinutes" INTEGER,
    "maxConcurrent" INTEGER,
    "plan" TEXT,
    "omnidimApiKeyEnc" TEXT,
    "fromNumberId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanySetting" (
    "companyId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanySetting_pkey" PRIMARY KEY ("companyId","key")
);

-- CreateIndex
CREATE UNIQUE INDEX "Company_slug_key" ON "Company"("slug");

-- CreateIndex
CREATE INDEX "Company_status_idx" ON "Company"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_companyId_phone_key" ON "Contact"("companyId", "phone");

-- CreateIndex
CREATE INDEX "User_companyId_role_idx" ON "User"("companyId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "User_companyId_employeeId_key" ON "User"("companyId", "employeeId");

-- AddForeignKey
ALTER TABLE "CompanySetting" ADD CONSTRAINT "CompanySetting_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agent" ADD CONSTRAINT "Agent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Call" ADD CONSTRAINT "Call_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageTemplate" ADD CONSTRAINT "MessageTemplate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallFinding" ADD CONSTRAINT "CallFinding_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Backfill: everything that exists today belongs to the founding company.
--
-- Written so a re-run is harmless: the insert is guarded on the slug and every
-- update only touches rows that are still unassigned.
-- ---------------------------------------------------------------------------

INSERT INTO "Company" (
  "id", "name", "slug", "status", "plan", "approvedAt", "createdAt", "updatedAt"
)
SELECT gen_random_uuid()::text, 'Finance Buddha', 'finance-buddha', 'active', 'founding', now(), now(), now()
WHERE NOT EXISTS (SELECT 1 FROM "Company" WHERE "slug" = 'finance-buddha');

UPDATE "User"            SET "companyId" = c."id" FROM "Company" c WHERE c."slug" = 'finance-buddha' AND "User"."companyId"            IS NULL;
UPDATE "Invite"          SET "companyId" = c."id" FROM "Company" c WHERE c."slug" = 'finance-buddha' AND "Invite"."companyId"          IS NULL;
UPDATE "Agent"           SET "companyId" = c."id" FROM "Company" c WHERE c."slug" = 'finance-buddha' AND "Agent"."companyId"           IS NULL;
UPDATE "Contact"         SET "companyId" = c."id" FROM "Company" c WHERE c."slug" = 'finance-buddha' AND "Contact"."companyId"         IS NULL;
UPDATE "Campaign"        SET "companyId" = c."id" FROM "Company" c WHERE c."slug" = 'finance-buddha' AND "Campaign"."companyId"        IS NULL;
UPDATE "Call"            SET "companyId" = c."id" FROM "Company" c WHERE c."slug" = 'finance-buddha' AND "Call"."companyId"            IS NULL;
UPDATE "Note"            SET "companyId" = c."id" FROM "Company" c WHERE c."slug" = 'finance-buddha' AND "Note"."companyId"            IS NULL;
UPDATE "Document"        SET "companyId" = c."id" FROM "Company" c WHERE c."slug" = 'finance-buddha' AND "Document"."companyId"        IS NULL;
UPDATE "MessageTemplate" SET "companyId" = c."id" FROM "Company" c WHERE c."slug" = 'finance-buddha' AND "MessageTemplate"."companyId" IS NULL;
UPDATE "Message"         SET "companyId" = c."id" FROM "Company" c WHERE c."slug" = 'finance-buddha' AND "Message"."companyId"         IS NULL;
UPDATE "AuditLog"        SET "companyId" = c."id" FROM "Company" c WHERE c."slug" = 'finance-buddha' AND "AuditLog"."companyId"        IS NULL;
UPDATE "CallFinding"     SET "companyId" = c."id" FROM "Company" c WHERE c."slug" = 'finance-buddha' AND "CallFinding"."companyId"     IS NULL;
