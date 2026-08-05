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
git clone https://github.com/Comune-di-Montesilvano/UtenzePA.git
cd UtenzePA

# Configura le variabili d'ambiente
cp .env.example .env
# In sviluppo, decommenta COMPOSE_FILE in .env per attivare l'override
# (build locale + bind mount, invece delle immagini da GHCR)

# Avvia tutti i servizi
docker compose up -d
```

Una volta avviati i container:

- **Frontend**: [http://localhost:4300](http://localhost:4300)
- **Backend API**: [http://localhost:3000](http://localhost:3000)
- **Swagger API Docs**: [http://localhost:3000/api-docs](http://localhost:3000/api-docs) (solo se `SWAGGER=true`, mai in produzione pubblica)

Al primo avvio, con database vuoto, l'app reindirizza automaticamente al wizard di creazione del primo utente amministratore (`/setup`) — vedi sezione "Bootstrap primo utente Admin".

## Variabili d'Ambiente

Il progetto si configura con un file `.env` nella root, copiato da `.env.example` (vedi quel file per l'elenco completo e aggiornato, con commenti). Le principali:

### Porte esterne

| Variabile | Default | Descrizione |
|-----------|---------|-------------|
| `DOCKER_API_PORT` | `3000` | Porta esposta dal backend |
| `DOCKER_FRONTEND_PORT` | `4300` | Porta esposta dal frontend |

### Database MySQL

| Variabile | Default | Descrizione |
|-----------|---------|-------------|
| `MYSQL_PASSWORD` | _(obbligatoria)_ | Password root MySQL — genera con `openssl rand -hex 24` |
| `MYSQL_DB` | `mydatabase` | Nome del database |

### Secret applicativi (obbligatori in produzione)

| Variabile | Descrizione |
|-----------|-------------|
| `JWT_ACCESS_SECRET` | Firma i token JWT — genera con `openssl rand -hex 32` |
| `COOKIE_SECRET` | Firma i cookie — genera con `openssl rand -hex 32` |
| `SETUP_BOOTSTRAP_TOKEN` | Protegge il wizard di creazione del primo Admin — comunicato fuori banda a chi lo esegue |

### Rete / CORS

| Variabile | Descrizione |
|-----------|-------------|
| `CORS_ORIGIN` | Origine (o lista separata da virgola) ammessa dal backend — deve combaciare con l'URL reale del frontend |
| `API_URL` | URL del backend raggiungibile dal browser, usato dal frontend a runtime |

### Altro

| Variabile | Default | Descrizione |
|-----------|---------|-------------|
| `SWAGGER` | `false` | Espone `/api-docs` — mai `true` in produzione pubblica |
| `LOG_LEVEL` | `info` | `error`/`warn`/`info`/`debug`/`verbose` — cambiabile senza rebuild, solo restart |

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

## Bootstrap primo utente Admin

Non esiste un modo per creare un utente amministratore da riga di comando: la creazione utenti (`POST /system-users`) richiede già un Admin autenticato. Il primo Admin si crea tramite il wizard `/setup` (disponibile solo finché il database non ha alcun utente, si disattiva automaticamente dopo):

1. Apri `http://localhost:4300/setup` (o viene reindirizzato lì automaticamente da `/login`).
2. Inserisci nome, cognome, email, password e il `SETUP_BOOTSTRAP_TOKEN` configurato in `.env`.
3. Ricevi un codice OTP via email (in sviluppo: [mailpit](http://localhost:8025) o porta configurata, vedi `docker-compose.override.yml`).
4. Inserisci il codice per completare la creazione dell'Admin.

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
UtenzePA/
├── .github/                 # Workflow CI/CD (test, release GHCR, publiccode)
├── docker-compose.yml       # Orchestrazione servizi (produzione)
├── docker-compose.override.yml  # Override sviluppo (build locale, bind mount, mailpit)
├── .env.example             # Variabili d'ambiente documentate
├── publiccode.yml           # Metadata per il catalogo riuso PA
├── backend/                 # API NestJS
│   ├── src/
│   │   ├── apis/            # Moduli API (controllers, services, entities)
│   │   ├── common/          # Decoratori, codici
│   │   ├── core/            # Auth, database, cronjobs, email, exceptions
│   │   ├── database/        # Migration TypeORM + data-source per la CLI
│   │   ├── data-importer/   # Importazione dati
│   │   ├── helpers/         # Utility helpers
│   │   └── utils/           # Compressione, validazione env
│   ├── docs/                # Documentazione tecnica
│   ├── artillery/           # Configurazioni load test
│   └── postman/             # Collection Postman
└── frontend/                # App Angular
    └── src/
        ├── app/
        │   ├── pages/       # Pagine dell'applicazione (include setup/, wizard bootstrap admin)
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

