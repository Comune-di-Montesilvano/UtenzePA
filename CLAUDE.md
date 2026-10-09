# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Panoramica progetto

Gestionale del patrimonio/utenze del Comune di Montesilvano (asset, utenze, fornitori, fatture). Sviluppato da terzi, allineato agli standard interni del team (rif. `comunicaPA`). Campagne/notifiche/SEND/PEC NON sono qui: sono in comunicaPA (`../comunicaPA`, docs in `docs/claude/`).

Monorepo semplice (nessun workspace tool): `backend/` (NestJS) + `frontend/` (Angular), orchestrati da Docker Compose (root).

| Servizio | Stack | Porta default |
|---|---|---|
| Backend API | NestJS 11 (Node ≥24) | 3000 (debug 9229) |
| Frontend | Angular 22 + Angular Material 22 | 4300 |
| Database | MySQL 8 | 3307 |

Porte locali override in `.env`: `DOCKER_API_PORT=3010`, mailpit `1026`/`8026` (comunicaPA usa 3000/1025/8025 sulla stessa macchina).

Dettagli spostati in `docs/claude/` — leggere il file pertinente prima di lavorare in quell'area:

| File | Contenuto |
|---|---|
| `docs/claude/docker-windows.md` | Stabilità Docker/WSL2, container `api` dev, install pnpm, worktree, shell |
| `docs/claude/backend.md` | Migration (generazione, drift, scratch path, test), insidie TypeORM, storia allineamento standard |
| `docs/claude/frontend.md` | Insidie Material, forms, flex, Leaflet, bootstrap, coordinate, date |
| `docs/claude/testing-e2e.md` | Utente temporaneo, login via API, Playwright, debug deploy |
| `docs/claude/release-ci.md` | gh CLI, branch protection, merge, CI, Dockerfile, release |
| `docs/claude/dependencies.md` | pnpm `allowBuilds`, dependabot, pacchetti ESM-only, blocco NestJS 12 |
| `docs/claude/data.md` | Correzioni dati one-off, mdbtools, fonti esterne (POD, ACA, capitoli) |

Roadmap: `docs/roadmap-patrimonio.md`.

## Comandi

### Avvio con Docker (root)
`docker-compose.yml` = produzione (immagini GHCR, volumi named, secret obbligatori `${VAR:?}`); `docker-compose.override.yml` = sviluppo (build locale, bind mount, porte MySQL/debug), attivato da `COMPOSE_FILE` in `.env`:
```
cp .env.example .env   # scommentare COMPOSE_FILE
docker compose up -d
```
Frontend http://localhost:4300 — API http://localhost:3000 — Swagger http://localhost:3000/api-docs.

Query MySQL dirette: `docker exec utenzepa-mysql-1 mysql -uroot -p'<MYSQL_PASSWORD da .env>' mydatabase -e "SELECT ..."` (testi accentati: `--default-character-set=utf8mb4`).

### Backend (`backend/`, dentro il container `api`)
```
pnpm run start:dev | start:debug | build && start:prod
pnpm run test:unit -- --maxWorkers=2              # src/**/*.spec.ts
pnpm exec jest path/al/file.spec.ts --maxWorkers=2
pnpm exec jest -t "nome del test" --maxWorkers=2
pnpm run lint | format | type-check
```
- Sempre `--maxWorkers=2` su jest. Suite intera rischia di far cadere Docker: preferire i file rilevanti e la CI come gate.
- `test:e2e` non funziona (`test/jest-e2e.json` non esiste); `test:integration` è un residuo del template. Script `docker:dev*` rotti (file compose inesistente).
- `pnpm run lint` nel container normalizza CRLF→LF su **ogni** `.ts`: prima di `git add` filtrare con `git diff --numstat` (righe `0 0` = rumore, `git checkout --`). Prettier riformatta anche file non correlati: tenere solo i propri.
- Comandi pnpm come root nel container: poi `chown -R 1000:1000 node_modules .pnpm-store`.

### Frontend (`frontend/`)
```
pnpm run start    # ng serve, porta 4300
pnpm run build    # ng build --configuration production
```
Nessun ESLint, nessun browser nel container (Karma non eseguibile). Verifica = `ng build`/log di `ng serve` + E2E Playwright dall'host. `tsc --noEmit` non vede gli errori di template.

### Docker e Windows (dettagli in `docs/claude/docker-windows.md`)
- Comandi Docker **uno alla volta**, mai in parallelo (crash di daemon e PC osservati). Dopo un 500 persistente: chiedere riavvio di Docker Desktop.
- `node_modules` sempre su volume named, mai bind-mount su Windows.
- Prima di ritentare un pnpm "bloccato": `docker exec <container> ps aux` (un `docker exec` scaduto lato client continua lato server).
- Un solo stack dev (`name: utenzepa`) per tutti i worktree: rilanciare `docker compose up -d` dal worktree in uso.
- File `.ts` spostati/rinominati sotto watch: `rm -rf dist tsconfig.build.tsbuildinfo` + `docker restart`.
- Sorgenti con CRLF: modifiche via script in Python preservando `\r\n`.

## Migration DB (dettagli in `docs/claude/backend.md`)

- `migrationsRun: true`: girano da sole a ogni avvio (dev e prod). `SYNCHRONIZE`/`DROPSCHEMA` solo escape hatch dev.
- Generare nel container (`migration:generate`, comando in `backend.md`), poi tenere solo gli statement della feature: l'output include drift preesistente non correlato.
- Scrivere la migration in uno scratch path e spostarla in `src/database/migrations/` solo a contenuto finale (il watcher può eseguirla a metà; DDL MySQL = commit implicito). Dopo lo spostamento verificare la riga in `migrations`: se manca, `docker restart utenzepa-api-1`.
- Verifica entity ↔ migration: `schema:log` (nessuno statement sulle tabelle toccate = ok).
- Migration che spostano dati: SELECT di controllo prima di ogni DDL, test con `QueryRunner` simulato fuori da `migrations/`, poi ciclo up → down → up sui dati.
- Migration bloccate da dati da sistemare: in produzione importare il DB locale *prima* di aggiornare le immagini; scriverlo nelle note di rilascio.
- Colonna stringa nullable: `type: 'varchar'` esplicito.

## Architettura

### Backend
- `src/apis/` — un modulo per risorsa REST: `auth`, `setup`, `system-users`, `settings`, `asset`, `utility`, `utility-types`, `map`, `invoices`, `contracts`, `third-parties`, `budget-chapters`, `consip-agreement`, `utilizer-grant`, `backup`, `photos`, `geocoding`, `health`, `anomalies`, `utility-consumptions`, `budget-chapter-spending`, `budget-commitments`, `spending`, `plants`, `asset-functions`, `asset-natures`, `audit-log`.
- `src/core/` (auth, database, cronjobs, email, exceptions), `src/common/`, `src/helpers/`, `src/utils/`. Path alias `@core`, `@apis`, `@common`, `@config`, `@modules`, `@utils`.
- `src/database/` — migration e `data-source.ts` per la CLI. Entity via glob `src/apis/**/*.entity.ts`.
- TypeORM su MySQL. Swagger, Infisical (secrets) e Sentry opzionali. Conventional Commits via commitlint + husky.
- Auth: JWT breve (`JWT_EXPIRES_IN`, default 1h, mai senza scadenza) rinnovato con `POST /authModule/refresh` (ricarica l'utente: cancellato o Disattivo = 401, ruolo dal DB) dal keepalive ng-idle ogni 15 min e all'avvio; login e refresh rifiutano i Disattivo (`can-sign-in.ts`). bcrypt cost 10. Nessun blocco account (`ACCOUNT_LOCKED` mai usato). OTP email (`apis/shared/otp.helper.ts`) solo per bootstrap `/setup` e reset password, non per il login; niente TOTP.
- Bootstrap primo Admin: wizard `/setup` protetto da OTP email **e** `SETUP_BOOTSTRAP_TOKEN` (secret obbligatorio comunicato fuori banda). CORS ristretto da `CORS_ORIGIN`.
- `invalidWhereValuesBehavior` = `'throw'`: in una where object-criteria mai valori potenzialmente `undefined` senza guardia.
- `findOne()` joina spesso più relazioni di `findAll()`: i dialog partono dalla riga di `findAll()`, verificare lì i join.
- Body-parser 100KB di default: DTO con data URI base64 richiedono `json({limit})` in `main.ts`.
- Lib TS < ES2022: niente `Array.prototype.at()`.
- Scrittura di sistema che non deve toccare "Ultima modifica": `update_date: () => '`update_date`'` (vedi `ConsumptionRecalcService`).
- `deleted` nei DTO di ricerca: `Transform` esplicito, mai `@Type(() => Boolean)`.

### Dominio
- **Soggetti terzi** (`third_parties`): controparti + fornitori in un'unica anagrafica (ex `utilizer`/`suppliers`, id conservati). Ruoli (fornitore, locatore, conduttore) calcolati dai collegamenti (`third-party.roles.ts`), mai salvati. Contratto immobiliare N-N con le parti (`utilizer_grant_parties`). P.IVA (giuridici) e CF (persone) obbligatori e `unique` anche tra i cancellati: per riusarli serve il DELETE fisico.
- **Fatture** (v1.10.0): testata `invoices` (fornitore, totale IVA inclusa, imponibile facoltativo) + `invoice_lines` (righe per utenza, importo IVA inclusa), sostituite in blocco a ogni salvataggio (PATCH senza `lines` = invariate; audit `lines` solo se cambiano). Capitolo di riga dall'impegno (`budget_commitments`: contratto + capitolo + esercizio, unico tra i non cancellati, non eliminabile se usato), altrimenti capitolo dell'utenza. Spesa per utenza/immobile/capitolo calcolata in `apis/spending/`, mai salvata; anno = esercizio dell'impegno, altrimenti anno della fattura.
- **Capitoli di spesa** (v1.12.0): tipi utenza ammessi N-N (`budget_chapter_utility_types`, API `utility_type_ids`), nessuno = tutti. Nella scheda utenza servono solo a ordinare i capitoli, nessun blocco. Scheda capitolo (v1.14.0): dati ragioneria per capitolo/anno su `budget_chapter_spending` (stanziamento iniziale, assestato, "Spesa ragioneria" = `amount`); impegnato, fatturato, disponibile e sforamento calcolati in `apis/spending/chapter-year.ts` (scheda, elenco, `POST /spending/budget-check`, anomalie `chapters_over_budget`/`chapters_without_budget` sull'esercizio in corso).
- **Contratto di fornitura** (v1.13.0): `contract_kind` = Ordinario (CIG obbligatorio) / Escluso da CIG / A titolo gratuito (`contract-kind.enum.ts`, gemello frontend `pages/contracts/contract-kind.ts`). Numero ordine unico in `consip_order`. Capitolo dell'utenza facoltativo: anomalia `active_utilities_without_chapter`, escluse le utenze di un contratto gratuito in corso.
- **Impianti** (`plants`): entità unificata con tipo e dati tecnici per tipo, N-N con gli immobili (`plant_assets`), alimentata da zero o più utenze; sopravvive al cambio contatore. Tab per tipo in `PLANT_TYPE_TABS` (`plant.model.ts`).
- **Immobili**: classificazione solo tipologia (`nature_id`) + funzione (`function_id`), coppie in `asset_nature_functions`; icona = icona della funzione (`core/helpers/material-icons.ts`). Aggregati immobili rimossi (v1.9.0). Senza classificazione: segnalazione "Da classificare" (filtro `legacy_only`), obbligatoria solo per nuovi e già classificati. `GET /asset-natures/:id` non esiste.
- **Utenze**:
  - Posizione (anomalia `active_utilities_without_position`, badge "Senza posizione"): coordinate proprie → immobile collegato (GPS/geocodifica) → impianto collegato (proprio o del suo immobile), stessa regola della mappa (`map.service.ts`). `meter_verified` rimosso in v1.16.0.
  - "A carico di": dato salvato = voltura (`transferred_to_third_party_id`/`transferred_on`), stato calcolato in `apis/utility/cost-status.ts` (gemella SQL `costStatusSql`, tenerle allineate): Comune / Da volturare / Volturata / Da riprendere.
  - "Manutenzione a carico di": `apis/utility/maintenance-status.ts` (gemella `maintenanceStatusSql`) da `contracts.maintenance_included` (→ Fornitore) e `utilizer_grant.maintenance_by_counterparty` (→ Controparte), altrimenti Comune.
  - Tipologia ARERA `arera_category` (`apis/utility/arera-category.ts`, gemello `pages/utilities/arera-category.ts`); gas anche `gas_use_category` (C1–C5, T1, T2, delibera 229/2012). `purpose` non esiste più.
  - `disconnectable` (null = non noto), `activated_on`/`ceased_on` (non cambiano `supply_active`), connettività (`internet_technology`, velocità Mbit/s, modem, IP statico; svuotati se cambia tipo), una sola `notes`, deposito cauzionale `null` = non noto, `utility_code` = "Codice cliente fornitore", `supplier_address` solo senza immobile/impianto o con indirizzo diverso.
  - Aggregati utenze, lista costi a carico e gestori manutenzione non esistono più. Grep nell'entity prima di aggiungere una colonna "nuova".
- **Log attività** (`audit_logs`, v1.15.0): anche gli accessi (`entity_name='access'`, `action` LOGIN con canale LDAP/LOCAL in `new_value` / LOGOUT / TIMEOUT, mandati dal frontend con `POST /authModule/logout` finché il token è valido; inattività 30 min in `app.ts`). Senza `entity` la query dà tutto (solo Admin). Pulizia a 60 giorni solo sulle righe con `field_name`.
- **Anomalie** (`apis/anomalies/`): la spec usa mock posizionali, query nuove in fondo a `getAnomalies()`.
- **Mappa** (`pages/map/`, `apis/map/`): livelli Immobili/Utenze/Impianti; tipologia e funzione dell'immobile fanno da perimetro anche per utenze e impianti, lo stato filtra solo gli immobili; di default nascosti dismessi/cessati (`.map-pin--inactive`). Ricerca indirizzo: `"<testo>, <Comune>"` (nome da `entity_name` del branding), poi riquadro sulle coordinate di default, poi ovunque. Ricarica punti con `switchMap`. Geocodifica automatica a ogni avvio per gli asset senza coordinate geocodificate.
- **Backup**: restore con `excludeTables` (utenti/branding).

### Frontend (insidie in `docs/claude/frontend.md`)
- Standalone components + Angular Material, nessuno state manager (services + RxJS). `src/app/pages/` (viste), `src/app/core/` (components/directives/entities/helpers/interfaces/pipes/services/types/validators), `src/app/services/`, `src/app/guards/`. PrimeNG rimosso; icone Material Icons (font-awesome per pochi usi residui).
- `apiUrl`: prima `window.__UTENZEPA_CONFIG__` (iniettata da `nginx/20-runtime-config.sh` via `API_URL`), poi il valore compilato. Nessun proxy: frontend e backend su origin diverse.
- Interceptor `core/interceptors/auth-error.interceptor.ts`: su 401 `logout()` + `/login`, solo per `HttpClient`. **Non aggiunge il token**: un service che non estende `AbstractService` deve mettere `Authorization: Bearer` a mano. `AuthService` usa axios per login/OTP.
- `RedirectToSetupGuard` sulla route `login`: senza utenti (`GET /setup/status` → `available:true`) va a `/setup`.
- Dockerfile multi-stage: `dev` = `ng serve`, prod = nginx (SPA fallback, `nginx.conf`).
- `provideAppInitializer` con HTTP: sempre `try/catch` con fallback (altrimenti pagina bianca).
- `MatDialog` oltre 560px: passare anche `maxWidth`.
- Icone `L.divIcon` e CSS di Leaflet: in `styles.scss` globale. Modifiche ad `angular.json`: riavviare `ng serve`.
- Nessun `LOCALE_ID`: per formato italiano `toLocaleString('it-IT')`.
- **Date** `'AAAA-MM-GG'` = giorno locale: leggere con `new Date(y, m - 1, d)`, inviare con `@DateOnly()`/`toIsoDate`, mai `toISOString()`; backend `@DateOnly()` nei DTO, `DateHelper.dateOnly` nei filtri.
- **Coordinate**: sempre `CoordinateHelper.parseCoordinate()` (virgola decimale nei dati importati).
- **Schede entità** (immobile, utenza, impianto, contratto fornitura, contratto immobiliare): shell in `core/components/entity-sheet/` (header con badge da `core/helpers/entity-status.ts`, tab con `app-tab-label`, `app-linked-table`, `app-preview-card`). Aprirle con `openSheet()`/`sheetDialogConfig()` o `EntityNavigatorService` (carica con `getById`, persiste alla chiusura), mai `dialog.open` a mano. Tab nuovi: `aria-label` = etichetta. Righe/opzioni di `app-linked-table`: campi cache, non getter. Salva non disabilitato: con form invalido `markAllAsTouched()` + pallino rosso sul tab. "Scollega" chiede sempre conferma (`itemLabel`). Creazione al volo: `createLabel`/`(create)` su `app-filterable-select`/`app-multi-select`/`app-linked-table`, poi `EntityNavigatorService.create…`, ricarica opzioni e imposta il valore. Payload anagrafiche in `X.toPayload`. Filtri "solo fornitori": includere sempre l'id del controllo.
- **Elenchi**: filtri in `pages/<entità>/<entità>-filters.ts` (`FilterDef[]`, `core/components/list/`), barra `app-list-filters` (3 in linea, resto in "Filtri avanzati", chip), toolbar `app-list-toolbar`, righe per pagina 25/50/100 ricordate. Query param con nome di filtro lo valorizza; `mapSearchParams` traduce i filtri di sola UI. Ricerca libera lato client. Segnalazioni `app-list-signals` (`*_SIGNALS`): anomalie di `GET /anomalies`, un clic filtra sugli id; ricalcolate dopo ogni salvataggio.
- Tab di un dialog che modifica lato server l'entity del dialog: riallineare i controlli `pristine` del form.
- `reflect-metadata` nei `polyfills` di `angular.json`; tipi di proprietà decorate con `import type`.
- `mat-label` di campi required senza `*` manuale (salvo `app-filterable-select`). `ngModel` dentro `[formGroup]`: `[ngModelOptions]="{standalone: true}"`.
- Toast: `ToastService.add({severity, summary, detail})`. Conferma: `ConfirmDialogComponent` (`{title, message, confirmLabel, danger?}`). `BudgetChapter.article` è stringa (`'0'|'1'`).
- Componenti con `ChangeDetectionStrategy.Eager` esplicito (pre-v22).
- **Colori / dark mode** (v1.17.0): solo token `light-dark()` di `styles.scss` (`--app-*`, `--tone-*`, `--entity-*`, `--on-entity`, `--chart-series`), mai esadecimali nei componenti salvo colori "dato" (tipo utenza, pin, serie, icone di stato sature); se il chiaro non coincide con un token, `light-dark(<valore attuale>, <scuro>)`. Tema da `ThemeService` (classi `theme-light`/`theme-dark` su `<html>`, chiave `utenzepa-theme`, gemella nello script di `index.html`). Immagini per tema: `.only-light`/`.only-dark`. SVG: `style="fill: var(--x)"`, non l'attributo. Override di Leaflet con prefisso `html` (il suo CSS è caricato dopo).

## Verifica (dettagli in `docs/claude/testing-e2e.md`)
- Nessuna credenziale di test: utente temporaneo su `system_users`, eliminato subito dopo (FK su ~17 tabelle e `audit_logs`).
- Login via API: `POST /api/v1/authModule/login` con `{"email":"<username>","password":"..."}`, token in `token.access_token`.
- Playwright: `?selectedId=<id>` su `/utilities`, `/building`, `/contracts`; datepicker `gg/mm/aaaa`; dopo un Salva ricercare prima di riaprire; screenshot solo in `.playwright-mcp/`.
- `curl` verso `localhost:3010` dal Bash tool: serve `dangerouslyDisableSandbox`.
- Deploy dove login/wizard non risponde: prima `CORS_ORIGIN`/`API_URL`, poi admin già presente.

## Git, CI e release (dettagli in `docs/claude/release-ci.md`)
- Repo `Comune-di-Montesilvano/UtenzePA`. `main` protetta: PR obbligatoria, check `backend` + `frontend`, branch aggiornata, nessuna approvazione umana.
- Mai `git add .`/`-A` (`.playwright-mcp/`, `.serena/`, `docker-compose.proxy.yml`, `proxy/` non tracciati): file sempre elencati.
- Merge manuale `gh pr merge --squash --delete-branch` dal worktree principale (auto-merge disabilitato); poi `update-branch` sulle altre PR, una alla volta.
- `gh api` in Git Bash: endpoint senza `/` iniziale.
- La CI builda ma non fa `docker build`: dopo modifiche ai Dockerfile testare `docker build --target <stage> .` prima del tag.
- Release: bump `softwareVersion`/`releaseDate` in `publiccode.yml` nella PR, merge, `git tag -a vX.Y.Z` + push → GHCR `vX.Y.Z` e `latest`. Minor per feature con migration.

## Dipendenze (dettagli in `docs/claude/dependencies.md`)
- pnpm pinnato (`packageManager`), script nativi solo se in `allowBuilds` di `pnpm-workspace.yaml`; `ERR_PNPM_IGNORED_BUILDS` in CI = pacchetto da aggiungere lì.
- Dependabot: `@angular/*` e `@sentry/*` raggruppati; CI rossa può richiedere il bump manuale del pacchetto compagno; branch toccato da altri → `@dependabot recreate`.
- Pacchetti ESM-only rompono jest: vedi i casi `@nestjs/schedule`, `@nestjs/passport`, `@nestjs/jwt` (due spec esclusi).
- NestJS 12 bloccato finché `@nestjs/typeorm` non pubblica una 12.x.

## Dati (dettagli in `docs/claude/data.md`)
- Correzioni dalla UI o one-off sul DB locale; produzione = export + import. Nessun codice di import nel repo.
- Capitoli rinumerati negli anni: abbinare per descrizione e confermare con la ragioneria.
- POD esterni a 15 caratteri: normalizzare a 14.
