-- AlterTable
ALTER TABLE "assets" ADD COLUMN     "cpu" TEXT,
ADD COLUMN     "disk_gb" INTEGER,
ADD COLUMN     "last_seen_at" TIMESTAMP(3),
ADD COLUMN     "manufacturer" TEXT,
ADD COLUMN     "model" TEXT,
ADD COLUMN     "os" TEXT,
ADD COLUMN     "ram_mb" INTEGER,
ADD COLUMN     "raw" JSONB,
ADD COLUMN     "serial" TEXT,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'manual',
ADD COLUMN     "uuid" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "assets_uuid_key" ON "assets"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "assets_serial_key" ON "assets"("serial");
