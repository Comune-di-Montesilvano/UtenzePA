# NestJS API Template

[![GitHub Release](https://img.shields.io/github/v/release/GOINFOTEAM/nestjs-template?style=flat-square)](https://github.com/GOINFOTEAM/nestjs-template/releases/latest)
[![GitHub Tag](https://img.shields.io/github/v/tag/GOINFOTEAM/nestjs-template?style=flat-square&label=version)](https://github.com/GOINFOTEAM/nestjs-template/tags)
[![CodeQL](https://github.com/GOINFOTEAM/nestjs-template/workflows/CodeQL%20Analysis/badge.svg)](https://github.com/GOINFOTEAM/nestjs-template/actions/workflows/codeql-analysis.yml)
[![Code Quality](https://github.com/GOINFOTEAM/nestjs-template/workflows/Code%20Quality/badge.svg)](https://github.com/GOINFOTEAM/nestjs-template/actions/workflows/code-quality.yml)
[![License](https://img.shields.io/github/license/GOINFOTEAM/nestjs-template?style=flat-square)](LICENSE)

> **Enterprise-ready NestJS template** con automazione CI/CD avanzata, gestione dipendenze automatizzata, security scanning e code quality enforcement.

---

## 🚀 Quick Start

```bash
# Clone del repository
git clone git@github.com:GOINFOTEAM/nestjs-template.git
cd nestjs-template

# Installa dipendenze
npm install

# Setup git hooks
npm run prepare

# Configura environment
cp .env.example .env
# Edita .env con le tue configurazioni (o configura Infisical per gestione centralizzata secrets)

# Avvia in development
npm run start:dev
```

**L'applicazione sarà disponibile su**: `http://localhost:3000`

---

## ✨ Caratteristiche Principali

### 🔐 Security & Quality
- ✅ **CodeQL Analysis** - Scansione vulnerabilità automatica (weekly + PR)
- ✅ **Dependabot Auto-Merge** - Aggiornamenti dipendenze automatici (minor/patch)
- ✅ **Security Audit** - npm audit su ogni PR (blocca su critical/high)
- ✅ **Secrets Scanning** - TruffleHog per rilevamento secrets
- ✅ **GitHub Rulesets** - Branch protection avanzata

### 🎯 Code Quality
- ✅ **ESLint + Prettier** - Linting e formatting automatico
- ✅ **TypeScript Strict** - Type checking completo
- ✅ **Husky Git Hooks** - Validazione pre-commit/pre-push
- ✅ **Commitizen** - Commit messages standardizzati
- ✅ **Conventional Commits** - Per semantic release

### 🤖 Automazione CI/CD
- ✅ **Auto-Merge Workflow** - Merge automatico PR Dependabot
- ✅ **PR Validation** - Lint, types, security check su ogni PR
- ✅ **Code Quality Checks** - Linting, formatting, complexity analysis
- ✅ **Semantic Release** - Versioning e changelog automatici
- ✅ **Scheduled Scans** - Security scan settimanali

### 🏗️ Backend Features
- ✅ **NestJS** - Framework enterprise-grade
- ✅ **MongoDB + Mongoose** - Database integration
- ✅ **Redis** - Caching e session management
- ✅ **Infisical Integration** - Gestione centralizzata secrets
- ✅ **Swagger/OpenAPI** - Documentazione API automatica
- ✅ **JWT Authentication** - Sistema autenticazione completo
- ✅ **Two-Factor Auth** - 2FA con TOTP
- ✅ **Helmet + CORS** - Security headers e CORS configurabile
- ✅ **Conditional Rate Limiting** - Throttling YAML-configurabile con guard custom
- ✅ **HTTP Compression** - Gzip automatico con livelli configurabili (60-80% reduction)
- ✅ **Health Checks** - Endpoint `/health` per monitoring e readiness
- ✅ **Sentry Integration** - Error tracking, profiling e monitoring avanzato
- ✅ **Email Service** - Mailer con template support
- ✅ **Environment Validator** - Validazione type-safe delle variabili d'ambiente
- ✅ **YAML Configuration** - Config per environment (dev, staging, prod, test)

### 📊 Performance & Configuration
- ⚡ **HTTP Compression** - Response automaticamente compressi
- ⚡ **Conditional Rate Limiting** - Throttling basato su config
- ⚡ **Infisical Secrets Management** - Gestione centralizzata e sicura dei secrets
- ⚡ **Environment-based Config** - Configurazione per ogni environment
- ⚡ **Docker Support** - Container development e production

---

## 📚 Documentazione

### Quick Links

| Documento | Descrizione |
|-----------|-------------|
| **[📖 Documentazione Completa](./docs/)** | Indice principale della documentazione |
| **[🔐 Infisical Integration](./docs/INFISICAL.md)** | Gestione secrets con Infisical |
| **[🔑 Authentication](./docs/AUTHENTICATION.md)** | Sistema autenticazione JWT e 2FA |
| **[🤖 Dependabot Auto-Merge](./docs/dependabot-auto-merge.md)** | Sistema di auto-merge dipendenze |
| **[🛡️ GitHub Rulesets](./docs/github-rulesets.md)** | Configurazione branch protection |
| **[⚙️ Environment Config](./docs/ENVIRONMENT.md)** | Gestione configurazioni |
| **[🗜️ Compression](./docs/COMPRESSION.md)** | HTTP compression setup |
| **[🚦 Rate Limiting](./docs/RATE_LIMITING.md)** | API throttling configuration |
| **[🎯 Artillery Testing](./docs/ARTILLERY.md)** | Load testing guide |
| **[🧪 Integration Tests](./test/integration/README.md)** | Integration testing guide |
| **[📊 Test Coverage](./docs/TESTING_COVERAGE.md)** | Test coverage configuration |

---

## 📦 Installazione

### Prerequisiti

- **Node.js** v24.x (gestito tramite Volta - vedi package.json)
- **npm** v11.x o superiore  
- **Git** 2.x o superiore
- **Docker** (opzionale, per containerized development)
- **MongoDB** (opzionale per sviluppo locale, incluso in Docker)

### Setup Come Template

1. **Usa questo repository come template** su GitHub (pulsante "Use this template")

2. **Clona il tuo nuovo repository**:
```bash
git clone git@github.com:GOINFOTEAM/nestjs-template.git
cd nestjs-template
```

3. **Aggiorna `package.json`** con i dettagli del tuo progetto:
```json
{
  "name": "your-api-name",
  "version": "0.0.0",
  "description": "Your API description",
  "repository": {
    "type": "git",
    "url": "https://github.com/YOUR-ORG/your-project.git"
  }
}
```

4. **Installa dipendenze**:
```bash
npm install
```

5. **Configura environment variables**:
```bash
cp .env.example .env
# Edita .env con le tue configurazioni
```

6. **(Opzionale) Configura Infisical per gestione centralizzata secrets**:
   - Leggi la [guida completa Infisical](./docs/INFISICAL.md)
   - Crea un progetto su [Infisical](https://app.infisical.com)
   - Configura Machine Identity e aggiungi le credenziali in `.env`:
     ```env
     INFISICAL_CLIENT_ID=your-client-id
     INFISICAL_CLIENT_SECRET=your-client-secret
     INFISICAL_PROJECT_ID=your-project-id
     INFISICAL_ENVIRONMENT=development
     ```

7. **Inizializza repository** (opzionale, se vuoi rimuovere la storia git del template):
```bash
rm -rf .git
git init
git add .
git commit -m "chore: initial commit from nestjs-template"
git branch -M main
git remote add origin git@github.com:YOUR-ORG/your-project.git
git push -u origin main
```

8. **Configura GitHub** (importante!):
   - Vai su **Settings → General → Features** → Abilita **Issues** e **Discussions**
   - Vai su **Settings → Secrets and variables → Actions** → Aggiungi secrets necessari
   - Esegui: `.github/rulesets/apply-rulesets.sh` per applicare branch protection

9. **Configura secrets per produzione**:
   - **Con Infisical (raccomandato)**: Aggiungi tutti i secrets su Infisical dashboard
   - **Senza Infisical**: Configura variabili d'ambiente nel tuo sistema di deployment

---

## 🏃 Comandi Principali

### Development

```bash
# Development con hot-reload
npm run start:dev

# Production mode
npm run start:prod

# Debug mode
npm run start:debug

# Build
npm run build
```

### Testing

```bash
# Run unit tests
npm run test:unit

# Run integration tests
npm run test:integration

# Run E2E tests
npm run test:e2e

# Run all tests (unit + integration)
npm run test:all

# Watch mode
npm run test:watch

# Coverage report
npm run test:cov

# CI mode (fail-fast)
npm run test:ci
```

### Code Quality

```bash
# Lint (con auto-fix)
npm run lint

# Format check
npm run format:check

# Format (fix)
npm run format

# Type check
npm run type-check

# Audit best practices
.github/scripts/audit-best-practices.sh
```

### Docker

```bash
# Development environment
npm run docker:dev

# Production environment
npm run docker:prod

# Stop containers
npm run docker:dev:stop
npm run docker:prod:stop
```

---

## 🔄 Workflow di Sviluppo

### 1. Branch Strategy

```bash
# Feature development
git checkout develop
git pull origin develop
git checkout -b feature/my-feature

# Commit con convenzioni
git add .
git commit -m "feat: add new feature"

# Push e crea PR
git push -u origin feature/my-feature
```

### 2. Commit Messages

Usa [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]
[optional footer]
```

**Types**:
- `feat`: Nuova funzionalità
- `fix`: Bug fix
- `docs`: Documentazione
- `style`: Formattazione (no code logic)
- `refactor`: Refactoring codice
- `test`: Test
- `chore`: Manutenzione
- `perf`: Performance
- `ci`: CI/CD
- `build`: Build system

**Esempi**:
```bash
feat(auth): add JWT authentication
fix(api): resolve database connection timeout
docs: update README with new features
chore(deps): bump dependencies
```

### 3. Pull Request Process

1. **Crea PR** verso `develop` (o `main` per hotfix)
2. **Compila template PR** (descrizione + env vars)
3. **Attendi GitHub Actions**:
   - ✅ PR Validation (lint, types, security)
   - ✅ Code Quality checks
   - ✅ CodeQL analysis (se schedulato)
4. **Review** da team (se richiesto)
5. **Merge** (automatico per Dependabot, manuale per altri)

---

## 🤖 Automazione CI/CD

### Workflow Attivi

| Workflow | Trigger | Descrizione |
|----------|---------|-------------|
| **[Auto-Merge](/.github/workflows/folder/auto-merge.yml)** | PR Dependabot | Merge automatico minor/patch updates |
| **[PR Validation](/.github/workflows/folder/pr-validation.yml)** | PR verso main/develop/staging | Lint, types, security scan |
| **[Code Quality](/.github/workflows/folder/code-quality.yml)** | Push/PR | Linting, formatting, complexity |
| **[CodeQL Analysis](/.github/workflows/folder/codeql-analysis.yml)** | Weekly + PR | Security vulnerability scanning |
| **[Security Scan](/.github/workflows/folder/scheduled-security-scan.yml)** | Weekly | Scheduled security audit |
| **[Release](/.github/workflows/folder/release.yml)** | Push to main | Semantic versioning & changelog |

### Dependabot Configuration

Il progetto usa **Dependabot** per aggiornamenti automatici:

- 📦 **npm packages**: Check settimanale (Lunedì 09:00 UTC)
- 🔄 **GitHub Actions**: Check mensile
- 🐳 **Docker images**: Check settimanale
- ✅ **Auto-merge**: Minor e patch updates (se check passano)
- ⚠️ **Manual review**: Major updates

**Configurazione**: [`.github/dependabot.yml`](.github/dependabot.yml)
**Documentazione**: [docs/dependabot-auto-merge.md](./docs/dependabot-auto-merge.md)

---

## 🔒 Security Features

### 1. CodeQL Analysis

Scansione automatica del codice per vulnerabilità:

- ✅ Analisi settimanale (Lunedì 02:00 UTC)
- ✅ Analisi su ogni PR
- ✅ Security-and-quality queries
- ✅ Risultati in **Security → Code scanning alerts**

### 2. Dependabot Security Alerts

- 🔔 Notifiche automatiche per vulnerabilità
- 🤖 PR automatiche per security updates
- ✅ Merge automatico se i check passano

### 3. npm Audit

Eseguito automaticamente su ogni PR:

```bash
# Manualmente
npm audit

# Solo critical/high
npm audit --audit-level=high

# Fix automatico
npm audit fix
```

### 4. Secrets Scanning

TruffleHog attivo su ogni PR per rilevare secrets commessi:

- API keys
- Tokens
- Password
- Private keys

---

## 📊 Versioning e Release

### Semantic Release

Versioning automatico basato su commit messages:

| Commit Type | Version Bump | Esempio |
|-------------|--------------|---------|
| `fix:` | Patch (0.0.X) | 1.0.0 → 1.0.1 |
| `feat:` | Minor (0.X.0) | 1.0.1 → 1.1.0 |
| `feat!:` o `BREAKING CHANGE:` | Major (X.0.0) | 1.1.0 → 2.0.0 |

**Processo automatico su push a `main`**:
1. Analizza commit messages
2. Calcola nuova versione
3. Aggiorna `package.json`
4. Genera/aggiorna `CHANGELOG.md`
5. Crea git tag
6. Pubblica GitHub Release

### Visualizza Releases

- **Releases**: [GitHub Releases](https://github.com/GOINFOTEAM/nestjs-template/releases)
- **Changelog**: [CHANGELOG.md](./CHANGELOG.md)
- **Tags**: [Tags](https://github.com/GOINFOTEAM/nestjs-template/tags)

---

## 🛡️ Branch Protection

Il progetto usa **GitHub Rulesets** per branch protection:

### Configurazione Attuale

- 🔒 **main**: No deletion, no force push, status checks required
- 🔒 **develop**: No deletion, status checks required  
- 🔒 **staging**: No deletion, status checks required

### Applicazione Rulesets

```bash
# Applica rulesets al repository
.github/rulesets/apply-rulesets.sh

# Verifica rulesets applicati
gh api repos/GOINFOTEAM/nestjs-template/rulesets | jq
```

**Documentazione completa**: [docs/github-rulesets.md](./docs/github-rulesets.md)

---

## 🐳 Docker

### Development

```bash
# Start containers
docker compose -f docker-compose-development.yml up --build

# Stop containers
docker compose -f docker-compose-development.yml down
```

### Production

```bash
# Build e start
docker compose up --build -d

# Stop
docker compose down

# Logs
docker compose logs -f
```

**Applicazione disponibile su**: `http://localhost:3000`

---

## 📂 Struttura Progetto

```
nestjs-template/
├── .github/
│   ├── workflows/              # GitHub Actions workflows
│   │   ├── auto-merge.yml
│   │   ├── code-quality.yml
│   │   ├── codeql-analysis.yml
│   │   ├── pr-validation.yml
│   │   ├── release.yml
│   │   └── scheduled-security-scan.yml
│   ├── rulesets/              # Branch protection rulesets
│   ├── scripts/               # Utility scripts
│   ├── dependabot.yml         # Dependabot configuration
│   └── PULL_REQUEST_TEMPLATE.md
├── docs/                      # Documentation
│   ├── INFISICAL.md          # Infisical setup guide
│   ├── AUTHENTICATION.md      # Auth system docs
│   ├── ENVIRONMENT.md
│   ├── COMPRESSION.md
│   ├── RATE_LIMITING.md
│   └── ARTILLERY.md
├── src/                       # Source code
│   ├── apis/                 # API endpoints
│   ├── core/                 # Core modules
│   │   ├── auth/             # Authentication
│   │   ├── infisical/        # Infisical integration
│   │   ├── database/         # MongoDB & Redis
│   │   ├── security/         # Security services
│   │   └── two-factor-auth/  # 2FA implementation
│   ├── common/               # Shared resources
│   ├── utils/                # Utility functions
│   └── main.ts               # Application entry
├── test/                      # Tests
│   ├── integration/          # Integration tests
│   └── *.e2e-spec.ts         # E2E tests
├── .husky/                    # Git hooks
├── .env.example              # Environment template
├── docker-compose.yml         # Production Docker
├── docker-compose-development.yml # Dev Docker
├── Dockerfile                # Multi-stage Dockerfile
└── package.json
```

---

## 🔧 Scripts Reference

### Build & Run

| Script | Descrizione |
|--------|-------------|
| `npm run build` | Build dell'applicazione |
| `npm start` | Start (richiede build) |
| `npm run start:dev` | Development con hot-reload |
| `npm run start:debug` | Debug mode |
| `npm run start:prod` | Production mode |

### Testing

| Script | Descrizione |
|--------|-------------|
| `npm test` | Run unit tests |
| `npm run test:watch` | Watch mode |
| `npm run test:cov` | Coverage report |
| `npm run test:debug` | Debug tests |
| `npm run test:e2e` | E2E tests |
| `npm run test:ci` | CI mode (fail-fast) |

### Code Quality

| Script | Descrizione |
|--------|-------------|
| `npm run lint` | ESLint con auto-fix |
| `npm run lint:fix` | Alias di lint |
| `npm run format` | Format con Prettier |
| `npm run format:check` | Check formatting |
| `npm run type-check` | TypeScript type check |
| `npm run prettier` | Format all files |
| `npm run prettier:check` | Check all files |

### Git & Versioning

| Script | Descrizione |
|--------|-------------|
| `npm run prepare` | Setup Husky hooks |
| `npm run commit` | Commitizen interactive |

### Docker

| Script | Descrizione |
|--------|-------------|
| `npm run docker:dev` | Start dev environment |
| `npm run docker:dev:refresh` | Rebuild dev |
| `npm run docker:dev:stop` | Stop dev |
| `npm run docker:prod` | Start production |
| `npm run docker:prod:stop` | Stop production |
| `npm run docker:prod:log` | View logs |

---

## 🆘 Troubleshooting

### Problemi Comuni

#### 1. Security Vulnerabilities Bloccano Commit

```bash
# Vedi report dettagliato
npm audit

# Fix automatico
npm audit fix

# Force fix (cautela!)
npm audit fix --force
```

#### 2. Test Falliscono

```bash
# Run manualmente per output dettagliato
npm test

# Run specifico test
npm test -- path/to/test.spec.ts

# Debug test
npm run test:debug
```

#### 3. Formatting Issues

```bash
# Auto-fix tutto
npm run format
npm run lint
```

#### 4. Git Hooks Non Funzionano

```bash
# Reinstalla hooks
rm -rf .husky
npm run prepare
```

#### 5. Auto-Merge Non Funziona

Verifica:
```bash
# 1. Check rulesets
gh api repos/GOINFOTEAM/nestjs-template/rulesets

# 2. Check auto-merge enabled
gh api repos/GOINFOTEAM/nestjs-template | jq '.allow_auto_merge'

# 3. Run audit
.github/scripts/audit-best-practices.sh
```

**Documentazione completa**: [docs/dependabot-auto-merge.md#troubleshooting](./docs/dependabot-auto-merge.md#troubleshooting)

---

## 📈 Monitoring & Metrics

### GitHub Actions

```bash
# Lista workflow runs
gh run list --limit 20

# Watch run in corso
gh run watch

# View logs
gh run view <run-id> --log
```

### Dependabot

```bash
# PR Dependabot aperte
gh pr list --author "app/dependabot" --state open

# PR merged (ultime 30)
gh pr list --author "app/dependabot" --state merged --limit 30

# Security alerts
gh api repos/GOINFOTEAM/nestjs-template/dependabot/alerts
```

### Code Quality

```bash
# Run audit completo
.github/scripts/audit-best-practices.sh

# Output atteso: Score >= 90%
```

---

## 🤝 Contributing

1. Fork del repository
2. Crea feature branch (`git checkout -b feature/amazing-feature`)
3. Commit con conventional commits (`git commit -m 'feat: add amazing feature'`)
4. Push al branch (`git push origin feature/amazing-feature`)
5. Apri Pull Request

**Linee guida**:
- Segui conventional commits
- Aggiungi test per nuove feature
- Aggiorna documentazione
- Assicurati che tutti i check passino

---

## 🙏 Credits

Sviluppato e mantenuto da **[GOINFOTEAM](https://github.com/GOINFOTEAM)**

### Tech Stack

- [NestJS](https://nestjs.com/) - Progressive Node.js framework
- [TypeScript](https://www.typescriptlang.org/) - JavaScript with types
- [MongoDB](https://www.mongodb.com/) + [Mongoose](https://mongoosejs.com/) - Database
- [Jest](https://jestjs.io/) - Testing framework
- [ESLint](https://eslint.org/) + [Prettier](https://prettier.io/) - Code quality
- [Husky](https://typicode.github.io/husky/) - Git hooks
- [Semantic Release](https://semantic-release.gitbook.io/) - Automated versioning

---

---

## 🔐 Gestione Secrets

Questo template supporta due modalità di gestione secrets:

### 1. Infisical (Raccomandato per produzione)

**Vantaggi**:
- ✅ Gestione centralizzata dei secrets
- ✅ Sincronizzazione automatica tra ambienti
- ✅ Audit logging completo
- ✅ Rotazione secrets semplificata
- ✅ Collaborazione team sicura

**Setup rapido**:
```bash
# 1. Crea account su https://app.infisical.com
# 2. Crea progetto e Machine Identity
# 3. Configura .env
cp .env.example .env

# 4. Aggiungi credenziali Infisical
INFISICAL_CLIENT_ID=your-client-id
INFISICAL_CLIENT_SECRET=your-client-secret
INFISICAL_PROJECT_ID=your-project-id
INFISICAL_ENVIRONMENT=development

# 5. Test configurazione
npm run infisical:test
```

**Documentazione completa**: [docs/INFISICAL.md](./docs/INFISICAL.md)

### 2. File .env (Sviluppo locale)

Per sviluppo locale senza Infisical:
```bash
cp .env.example .env
# Edita .env con tutte le variabili necessarie
```

Il sistema usa un **fallback automatico**: se Infisical non è configurato, legge da `.env`.

---

**Last Updated**: 2025-01-16  
**Version**: Check [releases](https://github.com/GOINFOTEAM/nestjs-template/releases)
