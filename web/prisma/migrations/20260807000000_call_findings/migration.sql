-- CreateEnum
CREATE TYPE "FindingKind" AS ENUM ('interest', 'objection', 'next_action', 'intent', 'callback');

-- CreateEnum
CREATE TYPE "FindingState" AS ENUM ('suggested', 'applied', 'dismissed');

-- CreateTable
CREATE TABLE "CallFinding" (
    "id" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "contactId" TEXT,
    "kind" "FindingKind" NOT NULL,
    "value" TEXT NOT NULL,
    "quote" TEXT,
    "quoteVerified" BOOLEAN NOT NULL DEFAULT false,
    "contradicted" BOOLEAN NOT NULL DEFAULT false,
    "state" "FindingState" NOT NULL DEFAULT 'suggested',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CallFinding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CallFinding_contactId_state_idx" ON "CallFinding"("contactId", "state");

-- CreateIndex
CREATE INDEX "CallFinding_state_contradicted_idx" ON "CallFinding"("state", "contradicted");

-- CreateIndex
CREATE UNIQUE INDEX "CallFinding_callId_kind_key" ON "CallFinding"("callId", "kind");

-- AddForeignKey
ALTER TABLE "CallFinding" ADD CONSTRAINT "CallFinding_callId_fkey" FOREIGN KEY ("callId") REFERENCES "Call"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallFinding" ADD CONSTRAINT "CallFinding_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallFinding" ADD CONSTRAINT "CallFinding_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

