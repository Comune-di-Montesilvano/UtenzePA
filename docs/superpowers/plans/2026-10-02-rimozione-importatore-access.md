# Rimozione importatore Access — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminare tutto il codice di importazione dati da Access (CSV), backend e frontend, senza toccare backup/ripristino, foto e geocodifica.

**Architecture:** Solo cancellazioni. `ImportModule` (`apis/import/`) espone l'upload CSV chunked e delega a `DataImporterService` (`src/data-importer/`); gli script one-off vivono in `backend/tools/data-importer/`. Il frontend ha un tab "Importa dati" nella pagina Backup. `ChunkedUploadModule`/`ChunkedUploadService` restano: li usano anche backup e foto.

**Tech Stack:** NestJS 11, Angular 22, Docker Compose.

**Spec:** `docs/superpowers/specs/2026-10-02-soggetti-terzi-design.md` (sezione "Ordine", punto 1).

## Global Constraints

- Niente codice legacy: si elimina, non si commenta né si sposta in `tools/`.
- Mai `git add .`/`-A`: file elencati esplicitamente (`.playwright-mcp/`, `.serena/`, `*.txt` di sessione non vanno committati).
- Comandi Docker uno alla volta, mai in parallelo.
- Branch dedicato da `main`: `chore/rimozione-importatore-access`.

## Review Focus

- Pagina `/backup-import` dopo la rimozione: i tab Backup e Geocodifica funzionano come prima (crea backup, ripristino con checkbox, geocodifica).
- Upload foto e ripristino backup usano ancora `ChunkedUploadModule`: devono compilare e funzionare.
- `docker build --target production` del backend: il Dockerfile non deve più creare `import-tmp` e la build deve passare (la CI non builda immagini).
- Nessun riferimento residuo a `DataImporter`, `ImportModule`, `IMPORT_MAX_SIZE_MB`, `import-tmp` (grep finale).
- Sidebar: la voce rinominata porta sempre a `/backup-import`.

---

### Task 1: Backend — eliminare importatore, tools e configurazione

**Files:**
- Delete: `backend/src/apis/import/` (intera cartella)
- Delete: `backend/src/data-importer/` (intera cartella, compreso `source/.gitkeep`)
- Delete: `backend/tools/` (intera cartella: contiene solo `data-importer/`)
- Modify: `backend/src/app.module.ts` (import e voci `DataImporterModule`, `ImportModule`)
- Modify: `backend/.gitignore` (righe `src/data-importer/source/*.csv` e `/import-tmp/`)
- Modify: `backend/Dockerfile:132`
- Modify: `docker-compose.yml:64`, `docker-compose.override.yml:52`, `.env.example:88-89`

**Interfaces:**
- Consumes: niente.
- Produces: backend senza endpoint `/api/v1/import/*`.

- [ ] **Step 1: Branch**

```bash
git checkout main && git pull && git checkout -b chore/rimozione-importatore-access
```

- [ ] **Step 2: Cancellare le cartelle**

```bash
git rm -r -q backend/src/apis/import backend/src/data-importer backend/tools
```

- [ ] **Step 3: `app.module.ts`**

Rimuovere queste due righe di import:

```ts
import { DataImporterModule } from '@/data-importer/data-importer.module';
import { ImportModule } from '@apis/import/import.module';
```

e le due voci nell'array `imports` del modulo:

```ts
    DataImporterModule,
    ImportModule,
```

- [ ] **Step 4: `.gitignore`, Dockerfile, compose, env**

`backend/.gitignore`: eliminare la riga `src/data-importer/source/*.csv` e la riga `/import-tmp/`; il commento sopra `/backups/` diventa `# Backup working directory (may contain real DB dumps)`.

`backend/Dockerfile:132`, da:

```dockerfile
RUN mkdir -p /usr/src/app/backups /usr/src/app/import-tmp && chown -R nestjs:nodejs /usr/src/app
```

a:

```dockerfile
RUN mkdir -p /usr/src/app/backups && chown -R nestjs:nodejs /usr/src/app
```

`docker-compose.yml` e `docker-compose.override.yml`: eliminare la riga `      - IMPORT_MAX_SIZE_MB=${IMPORT_MAX_SIZE_MB:-50}`.

`.env.example`: eliminare le due righe

```
# Dimensione massima file di restore/import in MB (es. 50 = max 50 MB caricato).
IMPORT_MAX_SIZE_MB=50
```

- [ ] **Step 5: Grep residui**

Run: `grep -rn "DataImporter\|data-importer\|ImportModule\|IMPORT_MAX_SIZE_MB\|import-tmp\|apis/import" backend/src backend/Dockerfile backend/package.json docker-compose*.yml .env.example`
Expected: solo il commento storico in `backend/src/core/database/mysql/mysql.module.ts` (cita `src/data-importer/**` come area già auditata): sostituire `backend/src/apis/**, src/data-importer/** e src/core/**` con `backend/src/apis/** e src/core/**`. Poi nessun risultato.

- [ ] **Step 6: Type-check e test del backend**

Run: `docker exec utenzepa-api-1 pnpm run type-check`
Expected: nessun errore.

Run: `docker exec utenzepa-api-1 pnpm exec jest src/apis/backup src/apis/photos src/common/chunked-upload --maxWorkers=2`
Expected: PASS.

- [ ] **Step 7: Build immagine produzione**

Run (dalla root): `docker build --target production -t utenzepa-backend-check ./backend`
Expected: build completata. Poi `docker rmi utenzepa-backend-check`.

(Se lo stage si chiama diversamente, leggere i `FROM ... AS` del Dockerfile.)

- [ ] **Step 8: Commit**

```bash
git add backend/src/app.module.ts backend/src/core/database/mysql/mysql.module.ts backend/.gitignore backend/Dockerfile docker-compose.yml docker-compose.override.yml .env.example
git commit -m "chore(backend): rimuove l'importatore Access

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(Le cancellazioni sono già in stage dallo Step 2.)

### Task 2: Frontend — tab "Importa dati" e voce di menu

**Files:**
- Delete: `frontend/src/app/pages/backup-import/import.service.ts`
- Modify: `frontend/src/app/pages/backup-import/backup-import.component.ts`
- Modify: `frontend/src/app/pages/backup-import/backup-import.component.html`
- Modify: `frontend/src/app/comp/sidebar/sidebar.component.ts:70`

**Interfaces:**
- Consumes: backend senza `/import` (Task 1).
- Produces: pagina `/backup-import` con i soli tab Backup e Geocodifica.

- [ ] **Step 1: Cancellare il service**

```bash
git rm -q frontend/src/app/pages/backup-import/import.service.ts
```

- [ ] **Step 2: `backup-import.component.ts`**

Rimuovere:
- `import { ImportService } from './import.service';`
- `import { MatFormFieldModule } from '@angular/material/form-field';` e `import { MatSelectModule } from '@angular/material/select';`, e le voci `MatFormFieldModule`, `MatSelectModule` nell'array `imports` del componente (usate solo dal tab import: verificare con grep `mat-form-field\|mat-select` sull'html dopo lo Step 3, deve dare zero risultati);
- l'interfaccia `EntityTypeOption`;
- `private importService = inject(ImportService);`
- i campi `entityTypes`, `selectedEntityType`, `importFile`, `importing`, `importResult`;
- i metodi `onImportFileSelected()` e `runImport()`.

- [ ] **Step 3: `backup-import.component.html`**

Eliminare l'intero blocco `<mat-tab label="Importa dati"> … </mat-tab>`. Titolo da `<h2>Backup e Importazione</h2>` a `<h2>Backup e manutenzione</h2>`.

- [ ] **Step 4: Sidebar**

`sidebar.component.ts:70`, da:

```ts
        {label: 'Backup e Importazione', icon: 'storage', route: '/backup-import'},
```

a:

```ts
        {label: 'Backup e manutenzione', icon: 'storage', route: '/backup-import'},
```

- [ ] **Step 5: Compilazione**

Run: `docker logs --since 60s utenzepa-frontend-1 2>&1 | grep -E "✘|generation"`
Expected: "generation complete", nessuna riga `✘`. Se il container frontend non è attivo: `docker exec` non disponibile, affidarsi a CI (`ng build`).

- [ ] **Step 6: Verifica E2E**

Playwright: login, `/backup-import`, presenti solo i tab "Backup" e "Geocodifica"; la lista backup si carica; voce sidebar "Backup e manutenzione".

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/pages/backup-import/backup-import.component.ts frontend/src/app/pages/backup-import/backup-import.component.html frontend/src/app/comp/sidebar/sidebar.component.ts
git commit -m "chore(frontend): rimuove il tab Importa dati

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 3: Documentazione e PR

**Files:**
- Modify: `CLAUDE.md` (righe su `src/data-importer/` e `backend/tools/`)
- Modify: `README.md:119,149,224-225`
- Modify: `docs/roadmap-patrimonio.md:133` (voce 9, frase sull'importatore)

- [ ] **Step 1: CLAUDE.md**

Riga "`src/common/`, `src/helpers/`, `src/utils/`, `src/data-importer/` (…)": diventa "`src/common/`, `src/helpers/`, `src/utils/`.". Riga "`backend/tools/` (fuori da `src/`): …": da eliminare (la cartella non esiste più). Aggiungere sotto "Architettura → Backend" una riga: "Importatore Access/CSV rimosso (2026-10-02): i dati si correggono dalla UI o con interventi one-off sul DB, mai con codice di import nel repo."

- [ ] **Step 2: README**

- riga 119: `| `backup`, `import` | Backup/restore database e importazione dati da file |` → `| `backup` | Backup/restore database |`;
- riga 149: `Backup e Importazione` → `Backup e manutenzione`;
- righe 224-225: eliminare le voci `data-importer/` e `tools/` dall'albero.

- [ ] **Step 3: Roadmap**

Voce 9: eliminare la frase "; impatto sull'importatore (`data-importer.service.ts` deduplica i fornitori per `supplier_id`)".

- [ ] **Step 4: Commit, push, PR**

```bash
git add CLAUDE.md README.md docs/roadmap-patrimonio.md
git commit -m "docs: importatore Access rimosso

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push -u origin chore/rimozione-importatore-access
gh pr create --repo Comune-di-Montesilvano/UtenzePA --title "chore: rimuove l'importatore Access" --body "Rimuove ImportModule, DataImporterModule, backend/tools e il tab Importa dati. Backup, ripristino, foto e geocodifica invariati. Primo passo della voce 9 della roadmap (soggetti terzi).

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

- [ ] **Step 5: CI**

Run: `gh pr checks <N> --watch`
Expected: `backend` e `frontend` verdi. Merge manuale (`gh pr merge --squash --delete-branch`) dal worktree principale, dopo conferma dell'utente.
