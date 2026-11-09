-- Notes internes : commentaires réservés au support, jamais montrés au demandeur.

-- AlterTable
ALTER TABLE "ticket_comments" ADD COLUMN     "internal" BOOLEAN NOT NULL DEFAULT false;

