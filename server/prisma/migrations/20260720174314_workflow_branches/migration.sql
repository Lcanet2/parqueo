-- AlterTable
ALTER TABLE "workflow_runs" ADD COLUMN     "node_key" TEXT;

-- AlterTable
ALTER TABLE "workflow_steps" ADD COLUMN     "key" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "workflows" ADD COLUMN     "edges" JSONB NOT NULL DEFAULT '{}';
