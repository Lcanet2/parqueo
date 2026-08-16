# Client Parqueo : build Vite, puis Caddy qui sert les fichiers statiques,
# proxifie /api vers l'API et gère TLS — le client appelle /api en relatif,
# front et API doivent donc partager la même origine.
FROM node:22-slim AS build

WORKDIR /app
COPY client/package.json client/package-lock.json ./
RUN npm ci

COPY client/ ./
RUN npm run build

# Caddy plutôt que nginx : à domaine renseigné, il obtient et renouvelle le
# certificat Let's Encrypt sans configuration ni tâche planifiée. C'est ce qui
# évite à la personne qui installe d'écrire un bloc TLS et un cron certbot.
FROM caddy:2-alpine
COPY docker/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
EXPOSE 80 443
