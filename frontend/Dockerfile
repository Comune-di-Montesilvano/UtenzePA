# -------------------
# Stage 1: install & build
# -------------------
FROM node:24 AS base

WORKDIR /app

RUN corepack enable

# Copia package.json, pnpm-lock.yaml e pnpm-workspace.yaml
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

RUN pnpm install

# Copia tutto il resto del progetto
COPY . .

# -------------------
# Stage 2: sviluppo
# -------------------
FROM base AS dev

# Installazione globale di Angular CLI
RUN pnpm install -g @angular/cli

EXPOSE 4300

# Comando per ng serve con live reload
CMD ["ng", "serve", "--host", "0.0.0.0", "--port", "4300", "--poll", "2000"]

# -------------------
# Stage 3: build produzione
# -------------------
FROM base AS build

# Costruisci l'app in produzione
RUN pnpm run build -- --configuration=production

# -------------------
# Stage 4: produzione con nginx
# -------------------
FROM nginx:1.28-alpine AS prod

# Con Angular 18+ il path di default è dist/<project-name>/browser
COPY --from=build /app/dist/montesilvano-fe/browser /usr/share/nginx/html

# Copia configurazione nginx personalizzata per SPA routing
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Genera config.js da API_URL a ogni avvio container (/docker-entrypoint.d/
# e' eseguito automaticamente dall'immagine ufficiale nginx prima di avviare)
COPY --chmod=755 nginx/20-runtime-config.sh /docker-entrypoint.d/20-runtime-config.sh

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
