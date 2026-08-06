# Client Parqueo : build Vite, puis nginx qui sert les fichiers statiques et
# proxifie /api vers l'API — le client appelle /api en relatif, front et API
# doivent donc partager la même origine.
FROM node:22-slim AS build

WORKDIR /app
COPY client/package.json client/package-lock.json ./
RUN npm ci

COPY client/ ./
RUN npm run build

FROM nginx:1.27-alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
