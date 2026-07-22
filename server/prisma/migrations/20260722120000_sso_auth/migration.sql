-- Comptes SSO : mot de passe local facultatif + provenance du compte
ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;
ALTER TABLE "users" ADD COLUMN "provider" TEXT NOT NULL DEFAULT 'local';
