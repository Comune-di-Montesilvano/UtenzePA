# Comune di Montesilvano - Gestione Utenze

Applicazione web per la gestione del patrimonio del Comune di Montesilvano. Il sistema consente la gestione di asset, utenze, fornitori, fatture e relativi aggregati tramite un'interfaccia moderna e un backend API RESTful.

## Architettura

Il progetto è composto da tre servizi principali orchestrati con Docker Compose:

| Servizio | Tecnologia | Porta Default |
|----------|-----------|---------------|
| **Backend API** | NestJS 11 (Node.js) | 3000 |
| **Frontend** | Angular 20 + PrimeNG | 4300 |
| **Database** | MySQL 8 | 3307 |

## Prerequisiti

- [Docker](https://docs.docker.com/get-docker/) e [Docker Compose](https://docs.docker.com/compose/install/)
- (Opzionale) Node.js 20+ per sviluppo locale senza Docker

## Avvio Rapido

```bash
# Clona il repository
git clone https://github.com/comune-montesilvano/comune-montesilvano.git
cd comune-montesilvano

# Avvia tutti i servizi
docker compose up -d
```

Una volta avviati i container:

- **Frontend**: [http://localhost:4300](http://localhost:4300)
- **Backend API**: [http://localhost:3000](http://localhost:3000)
- **Swagger API Docs**: [http://localhost:3000/api](http://localhost:3000/api)

## Variabili d'Ambiente

Puoi configurare il progetto creando un file `.env` nella root del progetto. Tutte le variabili hanno valori di default funzionanti per lo sviluppo locale.

### Porte dei Container

| Variabile | Default | Descrizione |
|-----------|---------|-------------|
| `DOCKER_API_PORT` | `3000` | Porta esposta dal backend |
| `DOCKER_API_DEBUG_PORT` | `9229` | Porta debug Node.js |
| `DOCKER_MYSQL_PORT` | `3307` | Porta esposta da MySQL |
| `DOCKER_FRONTEND_PORT` | `4300` | Porta esposta dal frontend |

### Applicazione

| Variabile | Default | Descrizione |
|-----------|---------|-------------|
| `NODE_ENV` | `development` | Ambiente Node.js |
| `PORT` | `3000` | Porta interna del backend |
| `APP_URL` | `http://localhost:3000` | URL base dell'applicazione |
| `APP_NAME` | `NestJS Template` | Nome dell'applicazione |

### Database MySQL

| Variabile | Default | Descrizione |
|-----------|---------|-------------|
| `MYSQL_PASSWORD` | `password` | Password root MySQL |
| `MYSQL_DB` | `mydatabase` | Nome del database |

### Autenticazione JWT

| Variabile | Default | Descrizione |
|-----------|---------|-------------|
| `JWT_ACCESS_SECRET` | `abracadabra` | Secret per access token |
| `JWT_REFRESH_SECRET` | _(vuoto)_ | Secret per refresh token |

## Moduli API

Il backend espone le seguenti risorse REST:

| Modulo | Descrizione |
|--------|-------------|
| `auth` | Autenticazione (JWT + 2FA) |
| `system-users` | Gestione utenti di sistema |
| `assets` | Gestione asset/patrimonio |
| `asset-aggregators` | Aggregatori di asset |
| `utilities` | Utenze |
| `utility-types` | Tipologie di utenze |
| `utility-aggregators` | Aggregatori di utenze |
| `invoices` | Fatture |
| `suppliers` | Fornitori |
| `budget-chapters` | Capitoli di bilancio |
| `consip-agreement` | Convenzioni CONSIP |
| `costs-borne-by` | Oneri a carico di |
| `maintenance-managers` | Responsabili manutenzione |
| `purpose` | Destinazioni d'uso |
| `utilizer` | Utilizzatori |
| `utilizer-grant` | Concessioni utilizzatori |
| `health` | Health check |

## Frontend

L'interfaccia utente è sviluppata con **Angular 20** e utilizza **PrimeNG** come libreria di componenti UI. Le principali sezioni sono:

- **Dashboard** — Panoramica generale
- **Asset** — Gestione patrimonio immobiliare
- **Utenze** — Gestione utenze e contratti
- **Fornitori** — Anagrafica fornitori
- **Fatture** — Gestione fatturazione

## Sviluppo

### Backend

```bash
cd backend
npm install
npm run start:dev
```

### Frontend

```bash
cd frontend
npm install
npm run start
```

### Test

```bash
# Unit test backend
cd backend
npm run test

# Test e2e backend
npm run test:e2e

# Test con copertura
npm run test:cov
```

### Load Testing

Il backend include configurazioni [Artillery](https://www.artillery.io/) per test di carico:

```bash
cd backend
npm run load-test:low    # Carico basso
npm run load-test:medium # Carico medio
npm run load-test:high   # Carico alto
```

## Sicurezza

- Autenticazione JWT con access e refresh token
- Autenticazione a due fattori (2FA/TOTP)
- Hashing password con bcrypt (12 rounds)
- Blocco account dopo 5 tentativi falliti
- Rate limiting sulle API
- Gestione secrets con [Infisical](https://infisical.com/) (opzionale)
- Monitoraggio errori con [Sentry](https://sentry.io/) (opzionale)

## Struttura del Progetto

```
comune-montesilvano/
├── docker-compose.yml       # Orchestrazione servizi
├── backend/                 # API NestJS
│   ├── src/
│   │   ├── apis/            # Moduli API (controllers, services, entities)
│   │   ├── common/          # Decoratori, codici
│   │   ├── core/            # Auth, database, cronjobs, email, exceptions
│   │   ├── data-importer/   # Importazione dati
│   │   ├── helpers/         # Utility helpers
│   │   └── utils/           # Compressione, validazione env
│   ├── docs/                # Documentazione tecnica
│   ├── artillery/           # Configurazioni load test
│   └── postman/             # Collection Postman
└── frontend/                # App Angular
    └── src/
        ├── app/
        │   ├── pages/       # Pagine dell'applicazione
        │   ├── services/    # Servizi per comunicazione API
        │   ├── guards/      # Route guards
        │   ├── layout/      # Layout componenti
        │   └── core/        # Moduli core
        └── environments/    # Configurazioni ambiente
```

## Contribuire

Prima di aprire una PR:
- `npm run lint` e `npm run test` puliti nel backend che tocchi
- `npm run build` verde nel frontend se tocchi codice Angular
- leggi `CLAUDE.md` per le convenzioni del repo

## Licenza

Distribuito sotto licenza [EUPL-1.2](LICENSE).

