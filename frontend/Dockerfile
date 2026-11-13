# syntax=docker/dockerfile:1
# -------------------
# Stage 1: install & build
# -------------------
FROM node:26@sha256:e18c3ccdf7d71619990b0e85639f506e2028a95410999cab24cc373cbd10e0ac AS base

WORKDIR /app

# corepack dal tarball del registry npm, verificato con sha256 (niente `npm install` senza
# hash; da Node 25 non e' piu' nell'immagine). toolchain-version-check.yml segnala le nuove versioni.
ADD --checksum=sha256:9128cfe26aee0c99f4fc68c15c6b8b12309a68be0de2c012cdfea2a463cb722f     https://registry.npmjs.org/corepack/-/corepack-0.36.0.tgz /tmp/corepack.tgz
RUN mkdir -p /usr/local/lib/node_modules/corepack     && tar -xzf /tmp/corepack.tgz --strip-components=1 -C /usr/local/lib/node_modules/corepack     && rm /tmp/corepack.tgz     && ln -sf ../lib/node_modules/corepack/dist/corepack.js /usr/local/bin/corepack     && corepack enable

ENV CI=true

# Copia package.json, pnpm-lock.yaml e pnpm-workspace.yaml
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

RUN pnpm install --frozen-lockfile

# Copia tutto il resto del progetto
COPY . .

# -------------------
# Stage 2: sviluppo
# -------------------
FROM base AS dev

EXPOSE 4300

# Comando per ng serve con live reload — genera prima public/config.js dalle
# env runtime (vedi docker/dev-runtime-config.sh), stesso meccanismo usato da
# nginx in produzione.
CMD ["sh", "-c", "sh docker/dev-runtime-config.sh && pnpm exec ng serve --host 0.0.0.0 --port 4300 --poll 2000"]

# -------------------
# Stage 3: build produzione
# -------------------
FROM base AS build

# Costruisci l'app in produzione
RUN pnpm run build

# -------------------
# Stage 4: produzione con nginx
# -------------------
# nginx-unprivileged: gira come utente nginx (101) sulla porta 8080, filesystem in sola
# lettura (config.js e resolver in /tmp, tmpfs nel docker-compose.yml).
FROM nginxinc/nginx-unprivileged:1.31-alpine@sha256:b5047b9b76845eac124358373c6852377c52e4b05834a47647e955dd91cb8f1e AS prod

# PKG_REFRESH (data del giorno, passata da release.yml) invalida la cache del layer una
# volta al giorno, cosi' `apk upgrade` prende le patch Alpine anche prima che
# l'immagine base nginx venga ripubblicata.
ARG PKG_REFRESH=none
USER root
RUN apk upgrade --no-cache
USER 101

# APP_VERSION: tag git (release.yml, build da tag) o hash commit per build non
# taggate — baked a build time, letto a runtime da 20-runtime-config.sh e
# esposto al bundle come release Sentry (vedi runtime-config.ts, main.ts).
ARG APP_VERSION=dev
ENV APP_VERSION=${APP_VERSION}

# Con Angular 18+ il path di default è dist/<project-name>/browser
COPY --from=build --chown=nginx:nginx /app/dist/montesilvano-fe/browser /usr/share/nginx/html

# Copia configurazione nginx personalizzata per SPA routing
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Genera config.js da API_URL a ogni avvio container (/docker-entrypoint.d/
# e' eseguito automaticamente dall'immagine ufficiale nginx prima di avviare)
COPY --chmod=755 nginx/20-runtime-config.sh /docker-entrypoint.d/20-runtime-config.sh

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
