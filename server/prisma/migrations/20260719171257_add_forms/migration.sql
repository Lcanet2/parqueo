-- CreateEnum
CREATE TYPE "FieldType" AS ENUM ('text', 'textarea', 'select', 'date', 'checkbox');

-- CreateTable
CREATE TABLE "forms" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "category_id" INTEGER NOT NULL,
    "priority" "TicketPriority" NOT NULL DEFAULT 'medium',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "forms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "form_fields" (
    "id" SERIAL NOT NULL,
    "form_id" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "type" "FieldType" NOT NULL DEFAULT 'text',
    "required" BOOLEAN NOT NULL DEFAULT false,
    "options" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "form_fields_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "forms" ADD CONSTRAINT "forms_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_fields" ADD CONSTRAINT "form_fields_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "forms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
