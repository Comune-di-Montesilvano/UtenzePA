# -------------------
# Stage 1: install & build
# -------------------
FROM node:24 AS base

WORKDIR /app

RUN corepack enable

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

# Comando per ng serve con live reload
CMD ["pnpm", "exec", "ng", "serve", "--host", "0.0.0.0", "--port", "4300", "--poll", "2000"]

# -------------------
# Stage 3: build produzione
# -------------------
FROM base AS build

# Costruisci l'app in produzione
RUN pnpm run build

# -------------------
# Stage 4: produzione con nginx
# -------------------
FROM nginx:1.28-alpine AS prod

# APP_VERSION: tag git (release.yml, build da tag) o hash commit per build non
# taggate — baked a build time, letto a runtime da 20-runtime-config.sh e
# esposto al bundle come release Sentry (vedi runtime-config.ts, main.ts).
ARG APP_VERSION=dev
ENV APP_VERSION=${APP_VERSION}

# Con Angular 18+ il path di default è dist/<project-name>/browser
COPY --from=build /app/dist/montesilvano-fe/browser /usr/share/nginx/html

# Copia configurazione nginx personalizzata per SPA routing
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Genera config.js da API_URL a ogni avvio container (/docker-entrypoint.d/
# e' eseguito automaticamente dall'immagine ufficiale nginx prima di avviare)
COPY --chmod=755 nginx/20-runtime-config.sh /docker-entrypoint.d/20-runtime-config.sh

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
