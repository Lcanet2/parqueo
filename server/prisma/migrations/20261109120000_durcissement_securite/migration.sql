-- Révocation des sessions au changement de mot de passe (voir src/lib/session.js).
ALTER TABLE "users" ADD COLUMN "token_version" INTEGER NOT NULL DEFAULT 0;

-- Identité Entra immuable (« tid:oid ») : le SSO retrouve le compte par elle,
-- et non plus par l'adresse email, que le jeton d'identité ne garantit pas.
ALTER TABLE "users" ADD COLUMN "sso_subject" TEXT;
CREATE UNIQUE INDEX "users_sso_subject_key" ON "users"("sso_subject");
