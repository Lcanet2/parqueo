-- Désactivation de compte : alternative à la suppression, qui conserve l'historique.

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true;

