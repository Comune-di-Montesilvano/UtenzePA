# Dependabot Auto-Merge Implementation

## 📋 Indice

- [Panoramica](#panoramica)
- [Architettura](#architettura)
- [Configurazione](#configurazione)
- [Workflow Auto-Merge](#workflow-auto-merge)
- [Gestione Dipendenze](#gestione-dipendenze)
- [Branch Protection](#branch-protection)
- [Monitoraggio e Manutenzione](#monitoraggio-e-manutenzione)
- [Troubleshooting](#troubleshooting)
- [Best Practices](#best-practices)

---

## 🎯 Panoramica

Questo progetto implementa un sistema automatizzato di gestione delle dipendenze tramite **Dependabot** e **GitHub Actions**, che:

- 🤖 Rileva automaticamente gli aggiornamenti di dipendenze
- 🔍 Esegue controlli di sicurezza e qualità
- ✅ Effettua il merge automatico di aggiornamenti minor e patch
- 🛡️ Richiede revisione manuale per major updates
- 📊 Fornisce reporting dettagliato sullo stato delle PR

### Benefici

- **Riduzione del carico manuale**: meno PR da gestire manualmente
- **Sicurezza migliorata**: aggiornamenti tempestivi per vulnerabilità
- **Qualità del codice**: tutti gli aggiornamenti passano attraverso CI/CD
- **Tracciabilità**: log completi di tutte le operazioni automatiche

---

## 🏗️ Architettura

Il sistema è composto da tre componenti principali:

```
┌─────────────────────────────────────────────────────────┐
│                    Dependabot                           │
│  • Monitora dipendenze (npm, GitHub Actions, Docker)    │
│  • Crea PR per aggiornamenti disponibili                │
│  • Raggruppa aggiornamenti correlati                    │
└──────────────────┬──────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────┐
│              PR Validation Workflow                     │
│  • Quick Checks (lint, types, format)                   │
│  • Security Scan (npm audit, secrets detection)         │
│  • PR Status aggregation                                │
└──────────────────┬──────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────┐
│              Auto-Merge Workflow                        │
│  • Identifica PR Dependabot                             │
│  • Valuta tipo di update (major/minor/patch)            │
│  • Abilita auto-merge per minor/patch                   │
│  • Commenta sulla PR                                    │
└─────────────────────────────────────────────────────────┘
```

---

## ⚙️ Configurazione

### 1. Dependabot Configuration

File: `.github/dependabot.yml`

#### Ecosistemi Monitorati

| Ecosistema | Directory | Frequenza | Open PR Limit |
|-----------|-----------|-----------|---------------|
| npm | `/` | Weekly (Lunedì 09:00) | 10 |
| github-actions | `/` | Monthly | N/A |
| docker | `/` | Weekly | N/A |

#### Gruppi di Dipendenze

##### **nestjs-core**
```yaml
patterns:
  - '@nestjs/*'
exclude-patterns:
  - '@nestjs/cli'
update-types:
  - 'minor'
  - 'patch'
```
Raggruppa tutti i package core di NestJS (escluso CLI).

##### **nestjs-cli**
```yaml
patterns:
  - '@nestjs/cli'
  - '@nestjs/schematics'
update-types:
  - 'patch'  # Solo patch, minor richiedono review
```
Gestisce separatamente CLI per controllo maggiore.

##### **dev-dependencies**
```yaml
dependency-type: 'development'
exclude-patterns:
  - 'typescript'
  - '@types/*'
update-types:
  - 'minor'
  - 'patch'
```
Dipendenze di sviluppo non critiche.

##### **typescript**
```yaml
patterns:
  - 'typescript'
  - '@types/*'
  - 'ts-*'
update-types:
  - 'patch'  # Solo patch per stabilità
```
TypeScript e definizioni di tipo gestite con cautela.

##### **testing**
```yaml
patterns:
  - 'jest*'
  - '@types/jest'
  - 'supertest'
  - '@types/supertest'
  - '@testing-library/*'
update-types:
  - 'minor'
  - 'patch'
```
Framework e tool di testing.

##### **security**
```yaml
patterns:
  - 'helmet'
  - 'bcrypt*'
  - '@sentry/*'
  - 'passport*'
update-types:
  - 'minor'
  - 'patch'
```
Pacchetti critici per sicurezza e monitoraggio.

##### **code-quality**
```yaml
patterns:
  - 'eslint*'
  - '@typescript-eslint/*'
  - 'prettier*'
  - 'husky'
  - 'lint-staged'
  - '@commitlint/*'
update-types:
  - 'minor'
  - 'patch'
```
Tool per qualità del codice e formattazione.

#### Strategia di Versionamento

```yaml
versioning-strategy: increase
```
- **increase**: Incrementa sempre la versione (più sicuro per ambienti enterprise)
- Alternativa: `widen` (allarga i range di versione)

#### Commit Messages

```yaml
commit-message:
  prefix: 'chore'
  prefix-development: 'chore(dev)'
  include: 'scope'
```

Esempi di commit generati:
- `chore(deps): bump @nestjs/core from 10.3.0 to 10.3.1`
- `chore(dev-deps): bump eslint from 8.50.0 to 8.51.0`
- `ci(deps): bump actions/checkout from 4.1.0 to 4.1.1`

#### Labels Automatiche

```yaml
labels:
  - 'dependencies'
  - 'automated'
  - 'security-update'  # Solo per npm
  - 'ci'  # Solo per GitHub Actions
  - 'docker'  # Solo per Docker
```

---

## 🔄 Workflow Auto-Merge

File: `.github/workflows/auto-merge.yml`

### Trigger

```yaml
on:
  pull_request:
    types: [opened, synchronize, reopened]
```

Si attiva quando:
- Una PR viene aperta
- Una PR viene sincronizzata (nuovo push)
- Una PR chiusa viene riaperta

### Condizioni di Esecuzione

#### 1. Filtro Autore
```yaml
if: github.actor == 'dependabot[bot]'
```
Solo PR create da Dependabot.

#### 2. Tipo di Update
```yaml
if: |
  steps.metadata.outputs.update-type == 'version-update:semver-minor' ||
  steps.metadata.outputs.update-type == 'version-update:semver-patch'
```

| Update Type | Esempio | Auto-Merge | Note |
|------------|---------|------------|------|
| `semver-patch` | 1.2.3 → 1.2.4 | ✅ Yes | Bug fixes, sicurezza |
| `semver-minor` | 1.2.0 → 1.3.0 | ✅ Yes | Nuove funzionalità backward-compatible |
| `semver-major` | 1.x.x → 2.0.0 | ❌ No | Breaking changes, richiede review |

### Steps del Workflow

#### Step 1: Checkout
```yaml
- name: Checkout code
  uses: actions/checkout@v4
```
Clona il repository per accesso al contesto.

#### Step 2: Fetch Metadata
```yaml
- name: Get Dependabot metadata
  id: metadata
  uses: dependabot/fetch-metadata@v2
  with:
    github-token: "${{ secrets.GITHUB_TOKEN }}"
```
Estrae metadati dalla PR Dependabot:
- `update-type`: tipo di aggiornamento semver
- `dependency-names`: nomi delle dipendenze
- `previous-version`: versione precedente
- `new-version`: nuova versione

#### Step 3: Enable Auto-Merge
```yaml
- name: Auto-merge minor and patch updates
  run: |
    gh pr merge --auto --squash "$PR_URL"
  env:
    PR_URL: ${{ github.event.pull_request.html_url }}
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

Opzioni di merge:
- `--auto`: Abilita auto-merge (attende status checks)
- `--squash`: Squash dei commit in uno solo
- Alternative: `--merge` (merge commit), `--rebase` (rebase)

#### Step 4: Comment on PR
```yaml
- name: Comment on PR
  uses: actions/github-script@v7
  with:
    script: |
      github.rest.issues.createComment({
        issue_number: context.issue.number,
        owner: context.repo.owner,
        repo: context.repo.repo,
        body: '🤖 Auto-merge enabled for this Dependabot PR (' + 
              '${{ steps.metadata.outputs.update-type }}' + ')'
      })
```
Aggiunge un commento informativo sulla PR.

### Permessi Richiesti

```yaml
permissions:
  contents: write        # Per fare merge
  pull-requests: write   # Per commentare e modificare PR
```

---

## 🔍 Gestione Dipendenze

### Ciclo di Vita di una Dipendenza

```
┌──────────────────────────────────────────────────────────┐
│ 1. Dependabot rileva nuovo update                        │
│    • Controlla package registry (npm, ghcr.io, etc.)     │
│    • Compara con versioni in package.json                │
└────────────────┬─────────────────────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────────────────────┐
│ 2. Valutazione e Raggruppamento                          │
│    • Applica regole di grouping                          │
│    • Verifica ignore rules                               │
│    • Determina tipo di update (major/minor/patch)        │
└────────────────┬─────────────────────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────────────────────┐
│ 3. Creazione PR                                          │
│    • Aggiorna package.json e package-lock.json           │
│    • Applica labels automatiche                          │
│    • Genera commit message                               │
└────────────────┬─────────────────────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────────────────────┐
│ 4. PR Validation Workflow                                │
│    • Quick Checks: lint + types + format                 │
│    • Security Scan: audit + secrets                      │
│    • PR Status Check                                     │
└────────────────┬─────────────────────────────────────────┘
                 │
                 ├─── ❌ Checks Failed ──> Manual Review
                 │
                 ▼ ✅ Checks Passed
┌──────────────────────────────────────────────────────────┐
│ 5. Auto-Merge Evaluation                                 │
│    • Verifica tipo update (minor/patch)                  │
│    • Abilita auto-merge                                  │
│    • Aggiunge commento                                   │
└────────────────┬─────────────────────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────────────────────┐
│ 6. Merge Automatico                                      │
│    • Attende completamento status checks                 │
│    • Esegue squash merge                                 │
│    • Chiude e archivia PR                                │
└──────────────────────────────────────────────────────────┘
```

### Scenario: Update Minor di @nestjs/core

**Situazione**: Disponibile @nestjs/core 10.3.1 (attuale: 10.3.0)

1. **Lunedì 09:00 (UTC)**
   - Dependabot avvia scan settimanale
   - Rileva update disponibile

2. **~09:15**
   - Crea branch: `dependabot/npm_and_yarn/nestjs-core-10.3.1`
   - Aggiorna package.json e package-lock.json
   - Crea PR con labels: `dependencies`, `automated`
   - Commit message: `chore(deps): bump @nestjs/core from 10.3.0 to 10.3.1`

3. **~09:16**
   - Trigger PR Validation workflow
   - Esegue linting, type-check, format-check
   - Esegue npm audit
   - Scansiona secrets con TruffleHog

4. **~09:20** (checks completati ✅)
   - Trigger Auto-Merge workflow
   - Fetch metadata: `update-type: version-update:semver-minor`
   - Abilita auto-merge con squash
   - Commenta: "🤖 Auto-merge enabled for this Dependabot PR (version-update:semver-minor)"

5. **~09:21**
   - Merge automatico eseguito
   - PR chiusa
   - Branch rimosso (se configurato)

### Scenario: Update Major di TypeScript

**Situazione**: Disponibile TypeScript 5.0.0 (attuale: 4.9.5)

1. **Dependabot crea PR**
   - Rileva major update
   - Crea PR normalmente

2. **PR Validation eseguita**
   - Tutti i check passano ✅

3. **Auto-Merge Workflow**
   - Fetch metadata: `update-type: version-update:semver-major`
   - ❌ **Condizione non soddisfatta** (non minor/patch)
   - Auto-merge **NON abilitato**

4. **Azione richiesta**
   - 🔔 Team notificato
   - 👤 Review manuale necessaria
   - 🧪 Test approfonditi raccomandati
   - 📝 Controllo breaking changes

---

## 🛡️ Branch Protection

### Requisiti Minimi

Per abilitare l'auto-merge, configura le seguenti regole per il branch `main`:

#### 1. Status Checks Richiesti

Vai su: **Settings → Branches → Branch protection rules → main**

Abilita: **Require status checks to pass before merging**

Seleziona i seguenti checks:
```
✅ Quick Checks
✅ Security Check
✅ PR Status Check
```

#### 2. Auto-Merge Permission

Abilita: **Allow auto-merge**

Questa opzione permette di abilitare auto-merge sulle PR.

#### 3. Merge Options

Raccomandato:
- ✅ **Allow squash merging**
- ⚠️ **Allow merge commits** (opzionale)
- ⚠️ **Allow rebase merging** (opzionale)

#### 4. Dismissal Options

Per Dependabot PRs:
- ⚠️ **Non abilitare** "Require pull request reviews"
  - Altrimenti auto-merge non funzionerà
  - Dependabot non può ottenere approvazioni automatiche

### Configurazione Avanzata

#### Rulesets (Raccomandato per organizzazioni)

```yaml
# .github/rulesets/main-protection.yml
name: Main Branch Protection
enforcement: active
target: branch
conditions:
  ref_name:
    include:
      - refs/heads/main

rules:
  - type: required_status_checks
    parameters:
      required_status_checks:
        - context: "Quick Checks"
          integration_id: 15368  # GitHub Actions
        - context: "Security Check"
          integration_id: 15368
        - context: "PR Status Check"
          integration_id: 15368
      strict_required_status_checks_policy: true

  - type: pull_request
    parameters:
      required_approving_review_count: 0  # Per Dependabot
      dismiss_stale_reviews_on_push: true

  - type: deletion
    parameters:
      allowed: false

  - type: required_linear_history
    parameters:
      allowed: false
```

### Verifica Configurazione

#### Via GitHub CLI

```bash
# Login
gh auth login

# Verifica regole branch protection
gh api repos/GOINFOTEAM/nestjs-template/branches/main/protection | jq '
  {
    required_status_checks: .required_status_checks.contexts,
    enforce_admins: .enforce_admins.enabled,
    allow_auto_merge: .allow_auto_merge
  }
'

# Output atteso:
# {
#   "required_status_checks": [
#     "Quick Checks",
#     "Security Check",
#     "PR Status Check"
#   ],
#   "enforce_admins": false,
#   "allow_auto_merge": true
# }
```

#### Via Web Interface

```bash
# Apri settings nel browser
gh repo view GOINFOTEAM/nestjs-template --web

# Naviga a: Settings → Branches → main
```

---

## 📊 Monitoraggio e Manutenzione

### Dashboard PR Dependabot

Visualizza tutte le PR Dependabot:

```bash
# Lista PR Dependabot aperte
gh pr list --author "app/dependabot" --state open

# Lista PR Dependabot merged (ultime 30)
gh pr list --author "app/dependabot" --state merged --limit 30

# Dettagli specifica PR
gh pr view <PR_NUMBER>
```

### Metrics e Analytics

#### KPI da Monitorare

1. **Time to Merge**
   - Tempo medio tra apertura PR e merge
   - Target: < 30 minuti per auto-merge

2. **Success Rate**
   - Percentuale di PR auto-merged vs totale
   - Target: > 80% per minor/patch

3. **Security Updates**
   - Numero di vulnerabilità risolte
   - Tempo medio di risoluzione

4. **Failed Checks**
   - Tipologia di fallimenti più comuni
   - Trend nel tempo

#### Query per Metrics

```bash
# PR auto-merged nell'ultima settimana
gh pr list \
  --author "app/dependabot" \
  --state merged \
  --json number,title,createdAt,mergedAt,labels \
  --jq '.[] | select(.labels[].name == "automated") | 
    {
      number, 
      title, 
      time_to_merge: (((.mergedAt | fromdateiso8601) - (.createdAt | fromdateiso8601)) / 60)
    }'
```

### Maintenance Tasks

#### Settimanale

- [ ] Review PR Dependabot aperte da > 7 giorni
- [ ] Verifica stato security alerts
- [ ] Check fallimenti ricorrenti nei workflow

```bash
# PR Dependabot stale (> 7 giorni)
gh pr list \
  --author "app/dependabot" \
  --state open \
  --json number,title,createdAt \
  --jq '.[] | select((now - (.createdAt | fromdateiso8601)) > 604800) | 
    {number, title, days_open: ((now - (.createdAt | fromdateiso8601)) / 86400 | floor)}'
```

#### Mensile

- [ ] Audit dipendenze non gestite da Dependabot
- [ ] Review e aggiornamento gruppi in `dependabot.yml`
- [ ] Analisi metriche e trend
- [ ] Verifica configurazione branch protection

```bash
# Genera report mensile
gh api graphql -f query='
  query($owner:String!, $repo:String!) {
    repository(owner:$owner, name:$repo) {
      dependencyGraphManifests(first: 10) {
        nodes {
          filename
          dependenciesCount
        }
      }
      vulnerabilityAlerts(first: 10, states: [OPEN]) {
        nodes {
          securityVulnerability {
            package {
              name
            }
            severity
          }
        }
      }
    }
  }
' -f owner=GOINFOTEAM -f repo=nestjs-template
```

#### Trimestrale

- [ ] Review completa della strategia di versionamento
- [ ] Valutazione nuovi ecosistemi da monitorare
- [ ] Aggiornamento documentazione
- [ ] Training team su nuove features

---

## 🔧 Troubleshooting

### Problema: Auto-Merge Non Abilitato

#### Sintomi
- PR Dependabot aperta
- Tutti i check passano ✅
- Auto-merge NON abilitato

#### Possibili Cause e Soluzioni

##### 1. Branch Protection: Auto-Merge Disabilitato

**Verifica:**
```bash
gh api repos/GOINFOTEAM/nestjs-template/branches/main/protection \
  | jq '.allow_auto_merge // "NOT SET"'
```

**Soluzione:**
```bash
# Abilita auto-merge via API
gh api -X PUT repos/GOINFOTEAM/nestjs-template \
  -f allow_auto_merge=true
```

O via Web: **Settings → General → Pull Requests → ✅ Allow auto-merge**

##### 2. Status Checks Non Configurati

**Verifica:**
```bash
gh api repos/GOINFOTEAM/nestjs-template/branches/main/protection \
  | jq '.required_status_checks.contexts'
```

**Soluzione:**
Configura status checks richiesti in Settings → Branches.

##### 3. Tipo Update Non Supportato

**Verifica:**
```bash
# Ottieni metadata PR
gh pr view <PR_NUMBER> --json body \
  | jq -r '.body' \
  | grep -A5 "Dependabot compatibility score"
```

**Soluzione:**
- Major updates richiedono review manuale (by design)
- Verifica che sia minor o patch update

##### 4. Workflow Non Eseguito

**Verifica:**
```bash
# Check workflow runs per la PR
gh run list --workflow=auto-merge.yml --branch <PR_BRANCH>
```

**Soluzione:**
- Verifica che il workflow sia nella branch corretta
- Check permessi del workflow in Settings → Actions

### Problema: Checks Falliscono Costantemente

#### Security Check: npm audit Fail

**Sintomi:**
```
❌ Found critical or high severity vulnerabilities!
```

**Diagnosi:**
```bash
# Esegui audit locale
npm audit --json > audit-report.json

# Analizza vulnerabilità
jq '.vulnerabilities | to_entries[] | select(.value.severity == "critical" or .value.severity == "high")' audit-report.json
```

**Soluzioni:**

1. **Fix Automatico (se disponibile):**
```bash
npm audit fix
git add package*.json
git commit -m "fix: address security vulnerabilities"
```

2. **Update Manuale:**
```bash
# Identifica pacchetto vulnerabile
npm audit

# Update specifico
npm update <package-name>
```

3. **Override Temporaneo (Use with caution!):**
```bash
# Aggiungi a package.json
{
  "overrides": {
    "vulnerable-package": "^fixed-version"
  }
}
```

4. **Ignore Specifici (Last resort):**
```bash
# Crea .npmrc
npm config set audit-level moderate  # Ignora low
```

#### Quick Checks: Linting Errors

**Sintomi:**
```
❌ Run Linter
Error: ESLint found problems in the code
```

**Diagnosi:**
```bash
# Esegui lint locale
npm run lint

# Mostra errori dettagliati
npm run lint -- --format=verbose
```

**Soluzioni:**

1. **Auto-Fix:**
```bash
npm run lint:fix
# o
npx eslint . --fix
```

2. **Update ESLint Config:**
Se errori sono dovuti a nuove regole introdotte da update:
```bash
# Verifica compatibilità
npx eslint-config-checker

# Update config se necessario
```

#### Quick Checks: Type Errors

**Sintomi:**
```
❌ Type Check
Error: Found 5 type errors
```

**Diagnosi:**
```bash
# Esegui type-check locale
npm run type-check
# o
npx tsc --noEmit
```

**Soluzioni:**

1. **Incompatibilità Type Definitions:**
```bash
# Update @types packages
npm update @types/node @types/jest

# O installa versioni compatibili
npm install -D @types/package@version
```

2. **Breaking Changes in Minor (raro ma possibile):**
```typescript
// Adatta codice alle nuove signatures
// Esempio: Promise.resolve cambiato
- const result: Promise<string> = Promise.resolve();
+ const result: Promise<string> = Promise.resolve("");
```

### Problema: PR Non Merged Dopo Checks Pass

#### Sintomi
- Tutti i check passano ✅
- Auto-merge abilitato ✅
- PR rimane aperta

#### Possibili Cause

##### 1. Branch Protection: Require Approvals

**Verifica:**
```bash
gh api repos/GOINFOTEAM/nestjs-template/branches/main/protection \
  | jq '.required_pull_request_reviews.required_approving_review_count'
```

**Soluzione:**
- Se > 0, disabilita per Dependabot
- O configura auto-approval (vedi sezione Advanced)

##### 2. Pending Checks

**Verifica:**
```bash
# Check status per PR
gh pr checks <PR_NUMBER>
```

**Soluzione:**
- Attendi completamento di tutti i check
- Verifica workflow in Actions tab

##### 3. Conflitti di Merge

**Verifica:**
```bash
gh pr view <PR_NUMBER> --json mergeable
```

**Soluzione:**
```bash
# Se mergeable: false
gh pr comment <PR_NUMBER> --body "@dependabot rebase"
```

### Problema: Troppi PR Aperti

#### Sintomi
- Più di 10 PR Dependabot aperte
- Dashboard ingombrato

#### Diagnosi
```bash
# Count PR aperte per label
gh pr list --author "app/dependabot" --state open --json labels \
  | jq 'group_by(.labels[].name) | map({label: .[0].labels[0].name, count: length})'
```

#### Soluzioni

##### 1. Aumenta Frequenza Check

```yaml
# dependabot.yml
schedule:
  interval: 'daily'  # invece di 'weekly'
```

##### 2. Riduci Open PR Limit

```yaml
# dependabot.yml
open-pull-requests-limit: 5  # invece di 10
```

##### 3. Close Stale PRs

```bash
# Close manualmente PR vecchie
gh pr list --author "app/dependabot" --state open --json number,createdAt \
  | jq -r '.[] | select((now - (.createdAt | fromdateiso8601)) > 2592000) | .number' \
  | xargs -I {} gh pr close {} --comment "Closing stale PR. Dependabot will recreate if still needed."
```

##### 4. Batch Updates

```yaml
# dependabot.yml - esempio gruppo più ampio
groups:
  all-dev-dependencies:
    dependency-type: 'development'
    update-types:
      - 'minor'
      - 'patch'
```

---

## 🎯 Best Practices

### 1. Configurazione Dependabot

#### ✅ DO

- **Usa gruppi logici**: Raggruppa dipendenze correlate
  ```yaml
  groups:
    backend:
      patterns: ['@nestjs/*', 'typeorm', 'class-*']
  ```

- **Limita PR aperte**: Non superare 10-15 PR contemporanee
  ```yaml
  open-pull-requests-limit: 10
  ```

- **Ignora major updates**: Richiedi sempre review manuale
  ```yaml
  ignore:
    - dependency-name: '*'
      update-types: ['version-update:semver-major']
  ```

- **Usa versioning-strategy: increase**: Più sicuro per enterprise
  ```yaml
  versioning-strategy: increase
  ```

#### ❌ DON'T

- **Non ignorare security updates**: Mai ignorare vulnerabilità
  ```yaml
  # ❌ NEVER DO THIS
  ignore:
    - dependency-name: '*'
      update-types: ['security-update']
  ```

- **Non raggruppare troppo**: Gruppi grandi = debugging difficile
  ```yaml
  # ❌ Troppo ampio
  groups:
    all-dependencies:
      patterns: ['*']
  ```

- **Non disabilitare audit**: Mantieni sempre security scan
  ```yaml
  # ❌ In PR Validation workflow
  # Non commentare npm audit
  ```

### 2. Workflow Configuration

#### ✅ DO

- **Usa squash merge**: Mantieni history pulita
  ```yaml
  gh pr merge --auto --squash
  ```

- **Commenta sulle PR**: Traccia operazioni automatiche
  ```yaml
  - name: Comment on PR
    uses: actions/github-script@v7
  ```

- **Timeout generosi**: Evita fallimenti per slow networks
  ```yaml
  timeout-minutes: 10  # invece di 5
  ```

- **Usa cache**: Velocizza builds
  ```yaml
  - uses: actions/setup-node@v5
    with:
      cache: 'npm'
  ```

#### ❌ DON'T

- **Non auto-merge major updates**: Mai
  ```yaml
  # ❌ Pericoloso
  if: contains(steps.metadata.outputs.update-type, 'major')
  ```

- **Non skippa security checks**: Mai
  ```yaml
  # ❌ Non fare
  - name: Security Check
    if: false  # ← Mai!
  ```

- **Non esporre secrets**: Usa sempre variabili ambiente
  ```yaml
  # ❌ Non fare
  run: curl -H "Authorization: sk-1234567890"
  
  # ✅ Corretto
  run: curl -H "Authorization: ${{ secrets.API_KEY }}"
  ```

### 3. Branch Protection

#### ✅ DO

- **Richiedi status checks**: Sempre
- **Abilita auto-merge**: A livello repository
- **Usa linear history**: Se possibile
- **Configura CODEOWNERS**: Per review automatiche su file critici

#### ❌ DON'T

- **Non richiedi reviews per Dependabot**: Blocca auto-merge
- **Non blocca force push su PR branches**: Dependabot ne ha bisogno
- **Non configura check troppo strict**: Può bloccare updates legittimi

### 4. Monitoring

#### ✅ DO

- **Setup Slack/Discord notifications**: Per PR fallite
  ```yaml
  - name: Notify on failure
    if: failure()
    uses: 8398a7/action-slack@v3
  ```

- **Monitora metrics**: Time to merge, success rate
- **Review settimanale**: PR stale e fallite
- **Log centralizzato**: Traccia tutte le operazioni

#### ❌ DON'T

- **Non ignorare PR fallite**: Investigare sempre
- **Non accumulare PR stale**: Close dopo 30 giorni
- **Non disabilitare notifiche**: Mantieni visibilità

### 5. Security

#### ✅ DO

- **Audit regolare**: npm audit + Snyk/Dependabot alerts
- **Update tempestivi**: < 7 giorni per critical
- **Test approfonditi**: Per security updates
- **Documenta exceptions**: Se ignori vulnerabilità

#### ❌ DON'T

- **Non ignorare critical/high**: Mai
- **Non disabilitare security scans**: Mai
- **Non posticipare indefinitamente**: Security debt accumula
- **Non usare --force**: Per bypassare checks

### 6. Team Workflow

#### ✅ DO

- **Documenta eccezioni**: Quando blocchi un update
  ```markdown
  ## Why not updating?
  - Breaking changes in v2.0.0
  - Migration guide: https://...
  - Planned for Q2 2025
  ```

- **Comunica major updates**: Prima di mergiare
- **Training team**: Su nuove dipendenze
- **Mantieni changelog**: Per dipendenze critiche

#### ❌ DON'T

- **Non mergiare senza capire**: Leggi changelog
- **Non bypassare review**: Per major updates
- **Non assumere backward compatibility**: Testare sempre
- **Non ignorare deprecation warnings**: Pianificare migrazioni

---

## 📚 Risorse Aggiuntive

### Documentazione Ufficiale

- [Dependabot Documentation](https://docs.github.com/en/code-security/dependabot)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Branch Protection Rules](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)

### Tool Utili

- **Dependabot Dashboard**: `https://github.com/<org>/<repo>/security/dependabot`
- **GitHub CLI**: `https://cli.github.com/`
- **npm audit**: `https://docs.npmjs.com/cli/v8/commands/npm-audit`
- **Snyk**: `https://snyk.io/` (alternativa a npm audit)

### Community

- [Dependabot GitHub Discussions](https://github.com/dependabot/dependabot-core/discussions)
- [GitHub Actions Community](https://github.community/c/code-to-cloud/github-actions/41)

---

## 📝 Changelog

### Version 1.0.0 (2025-01-08)

**Initial Implementation**
- ✨ Auto-merge workflow per minor e patch updates
- ✨ Dependabot configuration con gruppi logici
- ✨ PR validation con security scan
- ✨ Branch protection documentation
- 📚 Documentazione completa

---

## 👥 Contributori

Per domande o suggerimenti su questa implementazione:

1. Apri una **Discussion** su GitHub
2. Crea una **Issue** per bug o feature requests
3. Contatta il team DevOps

---

## 📄 License

Questa documentazione fa parte del template NestJS di GOINFO TEAM.

**Ultimo aggiornamento**: 2025-01-08
