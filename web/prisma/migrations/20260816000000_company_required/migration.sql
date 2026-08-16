-- AlterTable
ALTER TABLE "Agent" ALTER COLUMN "companyId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Call" ALTER COLUMN "companyId" SET NOT NULL;

-- AlterTable
ALTER TABLE "CallFinding" ALTER COLUMN "companyId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Campaign" ALTER COLUMN "companyId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Contact" ALTER COLUMN "companyId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Document" ALTER COLUMN "companyId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Invite" ALTER COLUMN "companyId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Message" ALTER COLUMN "companyId" SET NOT NULL;

-- AlterTable
ALTER TABLE "MessageTemplate" ALTER COLUMN "companyId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Note" ALTER COLUMN "companyId" SET NOT NULL;

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "companyId" SET NOT NULL;


-- Indexes on companyId.
--
-- A Postgres foreign key does NOT create one, and every scoped read now filters
-- on this column — so without these each of them is a sequential scan that gets
-- worse with every company added. User already had one from the composite
-- uniques; these are the rest.
--
-- Not CONCURRENTLY: Prisma runs a migration inside a transaction, which forbids
-- it. At current row counts the lock is measured in milliseconds; on a large
-- table these should be created out of band instead.
CREATE INDEX IF NOT EXISTS "Agent_companyId_idx"           ON "Agent"("companyId");
CREATE INDEX IF NOT EXISTS "Call_companyId_idx"            ON "Call"("companyId");
CREATE INDEX IF NOT EXISTS "CallFinding_companyId_idx"     ON "CallFinding"("companyId");
CREATE INDEX IF NOT EXISTS "Campaign_companyId_idx"        ON "Campaign"("companyId");
CREATE INDEX IF NOT EXISTS "Document_companyId_idx"        ON "Document"("companyId");
CREATE INDEX IF NOT EXISTS "Invite_companyId_idx"          ON "Invite"("companyId");
CREATE INDEX IF NOT EXISTS "Message_companyId_idx"         ON "Message"("companyId");
CREATE INDEX IF NOT EXISTS "MessageTemplate_companyId_idx" ON "MessageTemplate"("companyId");
CREATE INDEX IF NOT EXISTS "Note_companyId_idx"            ON "Note"("companyId");
CREATE INDEX IF NOT EXISTS "AuditLog_companyId_idx"        ON "AuditLog"("companyId");
