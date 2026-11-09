-- Révocation des sessions au changement de mot de passe (voir src/lib/session.js).
ALTER TABLE "users" ADD COLUMN "token_version" INTEGER NOT NULL DEFAULT 0;
