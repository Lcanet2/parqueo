-- CreateTable
CREATE TABLE "software_installs" (
    "id" SERIAL NOT NULL,
    "asset_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT,
    "publisher" TEXT,

    CONSTRAINT "software_installs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "software_installs_asset_id_idx" ON "software_installs"("asset_id");

-- AddForeignKey
ALTER TABLE "software_installs" ADD CONSTRAINT "software_installs_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
