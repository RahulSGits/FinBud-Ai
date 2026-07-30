-- AlterTable
ALTER TABLE "Agent" ADD COLUMN     "firstMessageDynamic" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "firstMessageInterruptible" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "flowSections" JSONB;

