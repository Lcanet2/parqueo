# API Parqueo. Image Debian slim plutôt qu'Alpine : bcrypt et le moteur Prisma
# distribuent des binaires précompilés pour la glibc, pas pour la musl d'Alpine.
FROM node:22-slim

# openssl est requis par le moteur de requêtes Prisma.
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dépendances d'abord : la couche est réutilisée tant que package-lock ne bouge pas.
# Sans --omit=dev : la CLI Prisma qui applique les migrations est une dépendance
# de développement.
COPY server/package.json server/package-lock.json ./
RUN npm ci

COPY server/prisma ./prisma
RUN npx prisma generate

COPY server/src ./src

# Les pièces jointes sont écrites dans uploads/ en chemin relatif : le
# répertoire de travail doit rester /app (volume monté ici par compose).
RUN mkdir -p uploads && chown -R node:node /app
USER node

ENV NODE_ENV=production
EXPOSE 4000

# Au démarrage : migrations, puis amorçage du compte d'administration
# (idempotent — désactivable avec SEED_ON_START=false), puis l'API.
CMD ["sh", "-c", "npx prisma migrate deploy && { [ \"$SEED_ON_START\" = false ] || node prisma/seed.js; } && node src/index.js"]
