-- AlterTable
ALTER TABLE "software_installs" DROP COLUMN "name",
DROP COLUMN "publisher",
ADD COLUMN     "software_id" INTEGER NOT NULL;

-- CreateTable
CREATE TABLE "software" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "publisher" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "software_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "software_name_publisher_key" ON "software"("name", "publisher");

-- CreateIndex
CREATE INDEX "software_installs_software_id_idx" ON "software_installs"("software_id");

-- AddForeignKey
ALTER TABLE "software_installs" ADD CONSTRAINT "software_installs_software_id_fkey" FOREIGN KEY ("software_id") REFERENCES "software"("id") ON DELETE CASCADE ON UPDATE CASCADE;
