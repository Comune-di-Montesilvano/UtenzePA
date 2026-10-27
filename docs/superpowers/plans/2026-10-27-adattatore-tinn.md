# Adattatore Tinn (import contabilità, fase 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Container opzionale `tinn` che ogni notte scarica il backup Tinn via SFTP, lo ripristina, estrae i tre CSV del formato neutro e li consegna a UtenzePA attraverso una cartella condivisa; UtenzePA li carica da solo con il giro della fase 3.

**Architecture:** Programma Python dentro un'immagine Firebird (`tinn/`), con scheduler interno, che parla con il backend solo tramite file nel volume `accounting_inbox` (`status`, `ready`, CSV, `request`, `settings`). Nel backend un servizio `AccountingInboxService` controlla la casella ogni 5 minuti e riusa `AccountingImportService.run()`; la pagina Contabilità mostra lo stato del container e «Esegui ora». Profilo compose `tinn`: senza `COMPOSE_PROFILES=tinn` il servizio non esiste.

**Tech Stack:** Python 3 (Debian `python3`, `python3-paramiko`, `python3-croniter`, `pytest` solo per i test), Firebird (`gbak`, `isql`), NestJS 11 + TypeORM, Angular 22, Docker Compose profiles, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-27-adattatore-tinn-design.md` (base: `docs/superpowers/specs/2026-10-25-import-contabilita-design.md`).

## Global Constraints

- Credenziali SFTP solo in variabili d'ambiente: mai nel repo, nell'immagine, nei log, in `status`, nella riga di comando (`ps`). `restore.sh` del Comune non si copia né se ne riproducono i valori.
- Backup, `.fbk`, DB ripristinato e CSV non restano su disco dopo il giro, anche in caso di errore. Mai dati del Comune nel repo (test con dati finti).
- Un errore non tocca i dati già importati in UtenzePA.
- Servizio `tinn` con `profiles: ["tinn"]`; variabili `${VAR:?}` solo nel suo blocco: gli stack senza profilo non cambiano.
- Variabili: `TINN_SFTP_HOST`, `TINN_SFTP_PORT` (default `22`), `TINN_SFTP_USER`, `TINN_SFTP_PASSWORD`, `TINN_SFTP_PATH`, `TINN_DB_FILE`, `TINN_CRON` (default `0 4 * * *`), facoltativa `TINN_SFTP_HOST_KEY`; `TZ=Europe/Rome`.
- Casella: volume `accounting_inbox`; file `capitoli.csv`, `impegni.csv`, `liquidazioni.csv` (scritti con nome provvisorio e rinominati), poi `ready`; `status`, `request`, `settings`. Formati JSON fissati nel Task 3.
- Restore con `gbak -c -p 16384`; testi WIN1252 → UTF-8; a capo → spazio; importi al centesimo con punto; date ISO.
- Liquidazioni annullate esportate con `cancelled = 1` (vince la bozza `tinn_export.py`).
- Salto del ripristino solo se SHA-256 dello zip = `loaded_sha256` di `settings` (caricato con successo da UtenzePA); «Esegui ora» (`request`) non salta mai.
- Backend: controllo casella ogni 5 minuti (`ACCOUNTING_INBOX_CRON`, default `*/5 * * * *`), cartella `ACCOUNTING_INBOX_DIR` (default `/usr/src/app/accounting-inbox`); caricamento fallito = `ready` rinominato `ready.failed`, nessun nuovo tentativo automatico; import spento = file lasciati dove sono.
- Colonne nuove `accounting_import_state.last_success_at` e `last_loaded_sha256` (fonte di `settings.loaded_sha256`: sopravvive a un ripristino del DB); anomalia `accounting_import_stale` (import acceso, container presente, `last_success_at` più vecchio di 2 giorni o nullo).
- Messaggi all'utente in italiano semplice; ogni modifica visibile aggiorna `frontend/public/guida/guida.md` con la data in testa.
- Regole del repo: Docker un comando alla volta, jest `--maxWorkers=2`, mai `git add .`/`-A`, CRLF preservati, `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` nei commit.

## Review Focus

1. Password SFTP con caratteri speciali (`$`, apici, spazi, `#`): il collegamento funziona e la password non compare in `status`, nei log del container, né negli argomenti dei processi → test in Task 3 (`test_error_message_hides_password`) e Task 4 (`test_sftp_password_not_in_argv`).
2. Container fermato o riavviato a metà giro: all'avvio niente CSV parziali in casella, file temporanei rimossi, `status` rimasto `running` diventa `error` «Giro interrotto» → test in Task 4 (`test_startup_recovers_interrupted_run`).
3. Zip senza il `.fbk` atteso, `gbak` che fallisce, disco pieno: `status` `error` col passo giusto e messaggio chiaro, `tinn_work` vuoto → test in Task 4 (`test_restore_failure_cleans_work_dir`, `test_missing_fbk_in_zip`).
4. `ready` presente con import spento o con giro manuale in corso: i file restano, niente `ready.failed`, caricati quando si può → test in Task 6 (`lascia i file se l'import è spento`, `aspetta se un giro è in corso`).
5. `settings` assente o JSON rovinato (da una parte o dall'altra): il container usa anno 2023 e non salta; il backend lo riscrive all'avvio e al cambio di anno → test in Task 3 (`test_read_settings_corrupt`) e Task 6 (`riscrive settings all'avvio`).

---

### Task 1: Immagine Firebird e ripristino del backup

**Files:**
- Create: `tinn/Dockerfile`, `tinn/.dockerignore`, `tinn/app/__init__.py`
- Create: `tinn/README.md` (scopo, variabili, come provarlo in locale)

**Interfaces:**
- Produces: immagine con `gbak`/`isql` in `PATH` (o percorso fisso in `FB_BIN`), `python3`, `python3-paramiko`, `python3-croniter`, `unzip`, `tzdata`; utente non root uid/gid `1000` (stesso di `node` nell'immagine `api`, per cancellare i file della casella); `WORKDIR /app`, `ENTRYPOINT ["python3", "-m", "app.main"]` (main nel Task 4). Stage `test` con `pytest` sopra lo stage di produzione `production`.

- [ ] **Step 1: Prova le basi.** Con l'immagine ufficiale Firebird più recente (`firebirdsql/firebird`, tag 5.x esatto) ripristina in un container usa e getta il `.fbk` locale (`C:\Users\mirko.daddiego\Downloads\DBEUROCF_MONTESILVANO.fbk`, montato in sola lettura) con `gbak -c -p 16384`, poi `isql` con `SELECT COUNT(*) FROM GFLIQUN1`.
Expected: restore senza errori e conteggio > 0. Se fallisce, ripeti con `jacobalberty/firebird:v3.0`. Scrivi la scelta nel ledger (`Ruling:` con versione e motivo). Container usa e getta rimosso subito.
- [ ] **Step 2: Scrivi `tinn/Dockerfile`** sulla base scelta (tag esatto), stage `production` e `test`, utente 1000, nessun segreto, nessuna porta.
- [ ] **Step 3: Build e Trivy in locale.**
Run: `docker build --target production -t utenzepa-tinn:dev tinn` poi `docker run --rm -v //var/run/docker.sock:/var/run/docker.sock aquasec/trivy:<tag esatto> image --severity CRITICAL,HIGH --ignore-unfixed utenzepa-tinn:dev`
Expected: build ok; Trivy senza CRITICAL/HIGH con fix, altrimenti voci in `.trivyignore` con motivo e `exp:` (ledger).
- [ ] **Step 4: Commit** `tinn/Dockerfile tinn/.dockerignore tinn/app/__init__.py tinn/README.md` (`.trivyignore` se toccato): `feat(tinn): immagine Firebird per l'adattatore Tinn`.

### Task 2: Estrazione dei tre CSV

**Files:**
- Create: `tinn/app/extract.py`, `tinn/tests/test_extract.py`
- Create: `tinn/testdata/schema.sql` (solo le colonne usate dalle query, tipi presi dal DB ripristinato in `tinn-comune` con `isql -x`), `tinn/testdata/data.sql` (dati finti), `tinn/testdata/expected/{capitoli,impegni,liquidazioni}.csv`
- Create: `tinn/app/selftest.py`

**Interfaces:**
- Consumes: immagine del Task 1.
- Produces:
  - `run_isql(db_path: str, select: str) -> list[list[str]]` (righe marcate `#` + separatore `ASCII_CHAR(31)` come la bozza, output decodificato cp1252).
  - `to_amount(v: str) -> str`, `to_iso_date(v: str) -> str`, `supplier_id(vat: str, cf: str) -> str`, `pick_latest_years(rows: list[list[str]]) -> list[list[str]]` (per impegno+annualità la riga con `ESERCIZIO` più alto).
  - `extract(db_path: str, from_year: int, out_dir: str) -> dict[str, int]` → scrive `capitoli.csv`/`impegni.csv`/`liquidazioni.csv` (`;`, `\n`, UTF-8, intestazioni del formato neutro come nella bozza) e restituisce le righe per file.
  - `python3 -m app.selftest`: crea un DB vuoto, applica `schema.sql` + `data.sql`, chiama `extract(..., 2023, tmp)` e confronta byte per byte con `testdata/expected`; exit 0/1.

- [ ] **Step 1: Porta la bozza.** Copia la logica di `C:\Users\MIRKO~1.DAD\AppData\Local\Temp\claude\C--Users-mirko-daddiego-Documents-utenzepa\b087dbb1-a44a-47c1-a541-3becfc115e46\scratchpad\tinn_export.py` come riferimento (query identiche, `FROM_YEAR` → parametro, `docker exec` → `isql` locale). Prima scrivi i test.
- [ ] **Step 2: Test unitari (`tinn/tests/test_extract.py`).**

```python
def test_to_amount_rounds_to_cents():
    assert to_amount('75.65000000000001') == '75.65'
    assert to_amount('') == ''

def test_to_iso_date_from_isql_dialect1():
    assert to_iso_date('24-MAR-2025 00:00:00') == '2025-03-24'

def test_supplier_id_prefers_vat():
    assert supplier_id('01234567890', 'RSSMRA80A01H501U') == '01234567890'
    assert supplier_id('', 'RSSMRA80A01H501U') == 'RSSMRA80A01H501U'

def test_pick_latest_years_keeps_highest_esercizio():
    rows = [['2026', '2027', '2026', '514', '1'] + ['x'] * 8,
            ['2027', '2027', '2026', '514', '1'] + ['y'] * 8]
    assert pick_latest_years(rows)[0][5] == 'y'

def test_cancelled_liquidation_exported_with_flag(): ...  # riga con ANNULLATO='A' → cancelled '1'
def test_newline_in_description_becomes_space(): ...
def test_win1252_euro_decoded(): ...  # byte 0x80 → '€'
```

Run: `docker build --target test -t utenzepa-tinn:test tinn && docker run --rm utenzepa-tinn:test python3 -m pytest -q tests/test_extract.py`
Expected: FAIL (`extract` non esiste).
- [ ] **Step 3: Implementa `tinn/app/extract.py`.** Dati finti in `testdata` costruiti per coprire: due esercizi dello stesso impegno, un impegno annullato, una liquidazione annullata, una con fattura senza P.IVA (CF), descrizione con `€`, `;` e a capo, un capitolo con variazioni. Genera `expected/` col programma e **controllali a mano** riga per riga contro le regole della spec prima di committarli.
- [ ] **Step 4: Test verdi + selftest.**
Run: `docker run --rm utenzepa-tinn:test python3 -m pytest -q` e `docker run --rm utenzepa-tinn:dev python3 -m app.selftest`
Expected: tutti PASS; selftest exit 0.
- [ ] **Step 5: Accettazione sul backup reale (locale, fuori repo).** In un container `utenzepa-tinn:dev` usa e getta, con il `.fbk` montato in sola lettura e una cartella di uscita nello scratchpad: restore + `extract(db, 2023, out)`. Rigenera i file di riferimento con la bozza sullo stesso DB e confronta.
Expected: 24.874 / 12.755 / 40.644 righe e `diff` vuoto. Cartelle di prova cancellate.
- [ ] **Step 6: Commit** dei file del task: `feat(tinn): estrazione di capitoli, impegni e liquidazioni`.

### Task 3: Casella (file condivisi)

**Files:**
- Create: `tinn/app/inbox.py`, `tinn/tests/test_inbox.py`

**Interfaces:**
- Produces (formati condivisi con il backend, Task 6):
  - `status`: `{"state": "running"|"ok"|"unchanged"|"error", "step": "download"|"restore"|"extract"|"deliver"|null, "message": str|null, "started_at": iso, "finished_at": iso|null, "backup_sha256": str|null, "backup_date": iso|null, "next_run_at": iso|null}`
  - `ready`: `{"extracted_at": iso, "backup_sha256": str, "rows": {"capitoli": int, "impegni": int, "liquidazioni": int}}`
  - `settings` (scritto dal backend): `{"from_year": int|null, "loaded_sha256": str|null, "loaded_at": iso|null}`
  - `request`: file vuoto.
  - Funzioni: `write_json_atomic(path, data)`, `read_settings(dir) -> Settings` (assente o rovinato → `Settings(from_year=2023, loaded_sha256=None)`), `write_status(dir, status)`, `deliver(dir, csv_dir, ready)` (copia ogni CSV come `.<nome>.tmp`, `os.replace`, poi `ready` per ultimo; prima rimuove `ready.failed` e un `ready` vecchio), `take_request(dir) -> bool` (esiste → cancella → True), `public_message(step, error, secrets) -> str` (italiano, toglie ogni segreto). File creati con permessi `0o664`.

- [ ] **Step 1: Test.**

```python
def test_deliver_writes_ready_last(tmp_path): ...  # mock di os.replace registra l'ordine: ready ultimo
def test_deliver_removes_previous_failed(tmp_path): ...
def test_read_settings_missing(tmp_path): assert read_settings(tmp_path).from_year == 2023
def test_read_settings_corrupt(tmp_path): ...  # 'not json' → from_year 2023, loaded_sha256 None
def test_take_request_consumes_file(tmp_path): ...
def test_error_message_hides_password():
    msg = public_message('download', Exception("auth failed for p$a'ss #1"), ["p$a'ss #1"])
    assert "p$a'ss #1" not in msg and msg.startswith('Server SFTP')
```

Run: `docker run --rm utenzepa-tinn:test python3 -m pytest -q tests/test_inbox.py` (ricostruisci lo stage `test`)
Expected: FAIL.
- [ ] **Step 2: Implementa `tinn/app/inbox.py`.** Messaggi per passo: download «Server SFTP non raggiungibile o file non trovato», restore «Ripristino del backup non riuscito», extract «Estrazione dei dati non riuscita», deliver «Consegna dei file a UtenzePA non riuscita»; dettaglio tecnico breve dopo «: », senza segreti.
- [ ] **Step 3: Test verdi.** Expected: PASS.
- [ ] **Step 4: Commit** `feat(tinn): casella condivisa con UtenzePA`.

### Task 4: Giro e scheduler del container

**Files:**
- Create: `tinn/app/sftp.py`, `tinn/app/job.py`, `tinn/app/main.py`, `tinn/tests/test_job.py`, `tinn/tests/test_main.py`

**Interfaces:**
- Consumes: `extract()` (Task 2), funzioni di `inbox` (Task 3).
- Produces:
  - `download(cfg: Config, dest: str) -> None` con paramiko (password passata in memoria, mai in argv; `TINN_SFTP_HOST_KEY` se presente, altrimenti chiave salvata in `/work/known_hosts` al primo collegamento). Variabile solo per sviluppo `TINN_LOCAL_ZIP`: se impostata copia quel file invece di scaricare.
  - `run_job(cfg: Config, force: bool) -> str` (stato finale): `running` → download in `/work` → SHA-256 → se `not force` e uguale a `settings.loaded_sha256` → `unchanged` → altrimenti unzip (`TINN_DB_FILE` atteso nello zip), restore in `/work/tinn.fdb`, cancella zip e `.fbk`, `extract(db, settings.from_year, /work/out)`, `deliver`, `ok`; `finally`: svuota `/work` (tranne `known_hosts`).
  - `main`: all'avvio `recover()` (stato `running` → `error` «Giro interrotto», `/work` svuotata, CSV `.tmp` in casella rimossi); se nessuno `status` con `ok`/`unchanged` → giro subito; poi ciclo ogni 60 s: `take_request()` → giro con `force=True`; ora ≥ prossimo orario di `croniter(TINN_CRON)` → giro. Un giro alla volta. Ogni `status` porta `next_run_at`.
  - `Config.from_env(env) -> Config` che fallisce con messaggio chiaro se mancano le variabili obbligatorie (senza `TINN_LOCAL_ZIP`).

- [ ] **Step 1: Test.**

```python
def test_unchanged_backup_skips_restore(tmp_path): ...       # sha = loaded_sha256, force False → 'unchanged', restore non chiamato
def test_force_never_skips(tmp_path): ...
def test_backup_not_loaded_is_redelivered(tmp_path): ...      # sha uguale al giro prima ma loaded_sha256 diverso → 'ok'
def test_missing_fbk_in_zip(tmp_path): ...                    # status error, step 'restore', /work vuota
def test_restore_failure_cleans_work_dir(tmp_path): ...       # gbak exit 1 → error, nessun CSV in casella
def test_startup_recovers_interrupted_run(tmp_path): ...      # status running + .capitoli.csv.tmp → error 'Giro interrotto', tmp rimosso
def test_first_start_runs_immediately(): ...                  # nessuno status ok → giro subito
def test_request_triggers_forced_run(): ...
def test_sftp_password_not_in_argv(monkeypatch): ...          # nessun subprocess riceve la password
```

Run: `docker run --rm utenzepa-tinn:test python3 -m pytest -q`
Expected: FAIL sui test nuovi.
- [ ] **Step 2: Implementa** `sftp.py`, `job.py`, `main.py` (restore e isql con `subprocess.run` senza shell; log su stdout con passo ed esito, mai variabili d'ambiente).
- [ ] **Step 3: Test verdi.** Expected: tutti PASS.
- [ ] **Step 4: Commit** `feat(tinn): giro notturno, Esegui ora e ripresa dopo un'interruzione`.

### Task 5: Compose, CI e rilascio

**Files:**
- Modify: `docker-compose.yml` (servizio `tinn`, volumi `accounting_inbox` e `tinn_work`, montaggio `accounting_inbox:/usr/src/app/accounting-inbox` in `api`, `ACCOUNTING_INBOX_DIR`)
- Modify: `docker-compose.override.yml` (build locale `tinn/` target `production`, `TINN_LOCAL_ZIP` facoltativo)
- Modify: `.env.example` (`COMPOSE_PROFILES=tinn` e variabili `TINN_*` commentate, senza valori reali)
- Modify: `.github/workflows/tests.yml` (job `tinn`: build stage `test` + `pytest` + `python3 -m app.selftest` sull'immagine di produzione; riga `tinn` nella matrice `docker` con target `production` e Trivy)
- Modify: `.github/workflows/release.yml` (riga `tinn` nella matrice: `context: tinn`, `dockerfile: tinn/Dockerfile`, `target: production`)

**Interfaces:**
- Produces: servizio `tinn` (`image: ghcr.io/comune-di-montesilvano/utenzepa-tinn:${IMAGE_TAG:-latest}`, `profiles: ["tinn"]`, `restart: unless-stopped`, `TZ=Europe/Rome`, variabili della Global Constraints con `${VAR:?}`, `volumes: [accounting_inbox:/inbox, tinn_work:/work]`, nessuna porta, rete `utenzepa-network` non necessaria).

- [ ] **Step 1: Verifica che il profilo non cambi gli altri stack.**
Run (dalla radice, `.env` locale): `docker compose config --services` poi `COMPOSE_PROFILES=tinn TINN_SFTP_HOST=x TINN_SFTP_USER=x TINN_SFTP_PASSWORD=x TINN_SFTP_PATH=x TINN_DB_FILE=x docker compose config --services`
Expected: prima senza `tinn` e senza errori di variabili mancanti; poi con `tinn`.
- [ ] **Step 2: Modifica compose, `.env.example` e workflow;** ripeti lo Step 1 e `docker compose -f docker-compose.yml config -q` senza profilo.
Expected: come sopra, nessun errore.
- [ ] **Step 3: Commit** dei file elencati: `ci(tinn): profilo compose, immagine in CI e nel rilascio`. La CI della PR prova il job `tinn` e la nuova riga `docker`.

### Task 6: Backend — lettura della casella

**Files:**
- Create: `backend/src/apis/accounting-import/accounting-inbox.service.ts`, `accounting-inbox.service.spec.ts`
- Create: migration `backend/src/database/migrations/<timestamp>-AccountingImportLastSuccess.ts` (scritta nello scratch path, spostata a contenuto finale)
- Modify: `entity/accounting-import-state.entity.ts` (`last_success_at: Date | null`, `datetime`, nullable), `accounting-state.service.ts` (valore iniziale), `accounting-import.service.ts` (successo → `last_success_at`), `accounting-import.module.ts` (provider + cron come `invoice-import.module.ts`, nome `accounting-inbox`, `ACCOUNTING_INBOX_CRON`), `accounting-import.controller.ts` (PATCH: dopo l'update chiama `inbox.writeSettings()`)

**Interfaces:**
- Consumes: formati del Task 3; `AccountingImportService.run(files)`; `AccountingStateService`.
- Produces:
  - `AccountingInboxService.present(): boolean` (esiste `status` nella cartella)
  - `readStatus(): TinnStatus | null` (tipo = JSON `status` del Task 3, campi camelCase: `state`, `step`, `message`, `startedAt`, `finishedAt`, `backupSha256`, `backupDate`, `nextRunAt`; JSON rovinato → null)
  - `writeSettings(): Promise<void>` (da stato: `from_year`, `loaded_sha256`, `loaded_at`; scrittura atomica)
  - `requestRun(): void` (crea `request`)
  - `check(): Promise<'none'|'off'|'busy'|'loaded'|'failed'|'confirmed'>`: import spento o forzato spento → `off` (file intatti); `ready` assente → se `status.state === 'unchanged'` e `backupSha256 === loaded_sha256` aggiorna `last_success_at` (= `finishedAt`) → `confirmed`, altrimenti `none`; giro in corso → `busy`; altrimenti legge i tre CSV (mappati su `capitoli`→`chapters`, `impegni`→`commitments`, `liquidazioni`→`liquidations`) e chiama `run()`: successo → cancella CSV e `ready`, salva nello stato `last_success_at` = ora e `last_loaded_sha256` = sha di `ready`, riscrive `settings` → `loaded`; eccezione → rinomina `ready` in `ready.failed` → `failed`.
  - Stato: colonne nuove `last_success_at datetime NULL` **e** `last_loaded_sha256 varchar(64) NULL` (una migration), così `settings` si riscrive anche dopo un ripristino del DB.
  - All'avvio (`onApplicationBootstrap`) e dopo ogni `check()` `loaded`: `writeSettings()` se la cartella esiste.
  - `AccountingImportService.isRunning(): boolean` (getter su `running`, per `busy`).

- [ ] **Step 1: Test (`accounting-inbox.service.spec.ts`, cartella temporanea vera con `fs.mkdtempSync`, `AccountingImportService` e stato mockati).**

```ts
it('carica i tre file, li cancella e salva lo sha caricato', ...)          // check() → 'loaded'; run chiamato con chiavi chapters/commitments/liquidations; ready e csv spariti; state.update con last_success_at e last_loaded_sha256 = 'abc'; settings.loaded_sha256 === 'abc'
it('lascia i file se l\'import è spento', ...)                          // → 'off'; file intatti, nessun ready.failed
it('aspetta se un giro è in corso', ...)                                 // isRunning true → 'busy'; file intatti
it('caricamento fallito: ready.failed e niente nuovo tentativo', ...)    // run rejects → 'failed'; secondo check() → 'none', run chiamato una volta
it('backup invariato già caricato conferma last_success_at', ...)        // status unchanged + sha = last_loaded_sha256 → 'confirmed'
it('backup invariato non caricato non conferma', ...)                    // sha diverso → 'none'
it('riscrive settings all\'avvio', ...)                                  // settings rovinato → dopo onApplicationBootstrap JSON valido con from_year
it('status rovinato = null', ...)
```

Run: `MSYS_NO_PATHCONV=1 docker exec utenzepa-api-1 sh -c 'cd /usr/src/app && pnpm exec jest src/apis/accounting-import/accounting-inbox --maxWorkers=2'`
Expected: FAIL (modulo mancante).
- [ ] **Step 2: Implementa** entity, migration (`ADD COLUMN` ×2 e `down` inverso), servizio, cron e hook nel controller. Verifica migration con `schema:log` (nessuno statement su `accounting_import_state`).
- [ ] **Step 3: Test verdi + suite del modulo + lint.**
Run: jest su `src/apis/accounting-import` e prettier/eslint sui file toccati (filtrare `␍`).
Expected: tutti PASS, nessun errore di lint.
- [ ] **Step 4: Commit** dei file elencati: `feat(accounting-import): caricamento automatico dalla casella del container Tinn`.

### Task 7: Backend — stato del container, Esegui ora, segnalazione

**Files:**
- Modify: `accounting-import.service.ts` (`AccountingImportStatus.container: TinnStatus | null`, `lastSuccessAt`), `accounting-import.controller.ts` (`POST /accounting-import/container/run`, Admin), `accounting-import.controller.spec.ts`
- Modify: `backend/src/apis/anomalies/anomalies.service.ts` (+ spec: query nuova **in fondo**), tipo `accounting_import_stale: AnomalyList<{ id: number; label: string }>`

**Interfaces:**
- Consumes: `AccountingInboxService` (Task 6).
- Produces: `GET /accounting-import/status` → in più `container` (null se cartella senza `status`) e `lastSuccessAt`; `POST /accounting-import/container/run` → 400 «Scaricamento automatico non installato.» se `!present()`, 400 «Scaricamento già in corso.» se `status.state === 'running'`, altrimenti `requestRun()` e stato; anomalia: una riga `{id: 1, label: 'Contabilità non aggiornata da N giorni'}` (o «… mai caricata») quando import acceso, container presente, `last_success_at` nullo o più vecchio di 2 giorni. La presenza del container si passa all'anomalia via `AccountingInboxService.present()` (iniettato con `@Optional()` come gli altri servizi di stato).

- [ ] **Step 1: Test** nel controller spec (400 senza container, 400 se running, `requestRun` chiamato) e nello spec anomalie (3 giorni → 1 riga con «3 giorni»; 1 giorno → vuota; import spento → vuota; container assente → vuota).
Run: jest su `accounting-import.controller` e `anomalies`. Expected: FAIL.
- [ ] **Step 2: Implementa.** Expected dopo: PASS; lint pulito.
- [ ] **Step 3: Commit**: `feat(accounting-import): stato del container, Esegui ora e segnalazione`.

### Task 8: Frontend, guida e documentazione

**Files:**
- Modify: `frontend/src/app/pages/accounting-import/accounting-import.service.ts` (tipi `TinnStatus`, `container`, `lastSuccessAt`; `runContainer(): Observable<AccountingImportStatus>`)
- Modify: `frontend/src/app/pages/accounting-import/accounting-import-page.component.ts` (sezione «Scaricamento automatico»)
- Create: `frontend/src/app/pages/accounting-import/tinn-status.ts` + `tinn-status.spec.ts`
- Modify: segnalazione in dashboard (stesso punto delle altre `accounting_*`), `frontend/public/guida/guida.md`, `docs/claude/data.md` (installazione e prova locale con `TINN_LOCAL_ZIP`), `CLAUDE.md` (bullet import contabilità: fase 4), `docs/roadmap-patrimonio.md`

**Interfaces:**
- Consumes: API del Task 7.
- Produces: `tinnStatusLabel(s: TinnStatus): string` → `ok` «Completato», `unchanged` «Backup invariato, nessuna modifica», `running` «In corso…», `error` «Errore: <message>»; sezione visibile solo se `status.container`; mostra ultimo scaricamento (`finishedAt` in `it-IT`), esito, data del backup, prossimo giro (`nextRunAt`), «Esegui ora» (solo Admin; disabilitato se `running`; `color="primary"` e accanto al messaggio se `error`); dopo il clic ricarica lo stato ogni 3 s finché il container non esce da `running` (stesso schema di `waitForRun`).

- [ ] **Step 1: Test `tinn-status.spec.ts`** (le quattro etichette). Run: `docker exec utenzepa-frontend-1 sh -c "pnpm exec ng test --watch=false --include=src/app/pages/accounting-import/tinn-status.spec.ts"`. Expected: FAIL.
- [ ] **Step 2: Implementa** helper, servizio, sezione, segnalazione; guida: sezione «Collegare la contabilità (solo amministratori)» con lo scaricamento automatico, «Esegui ora», problema frequente «Contabilità non aggiornata» (Causa/Soluzione/Apri un ticket se), data in testa.
- [ ] **Step 3: Verifica.** Test PASS; `node scripts/check-guida.mjs` ok; `pnpm exec ng build --configuration production` ok; lint senza errori.
- [ ] **Step 4: Commit** dei file elencati: `feat(accounting-import): scaricamento automatico nella pagina Contabilità`.

### Task 9: Prova completa in locale

**Files:** nessuno nel repo (solo ledger).

- [ ] **Step 1:** Nel `.env` locale `COMPOSE_PROFILES=tinn`, `TINN_LOCAL_ZIP` su uno zip del `.fbk` dei Download creato nello scratchpad (montato in sola lettura via override locale non committato), variabili SFTP fittizie. `docker compose up -d` (un comando alla volta). Import acceso dalla pagina, anno 2023.
Expected: il container parte subito (primo avvio), `status` `ok`; entro 5 minuti UtenzePA carica 24.874 / 12.755 / 40.644 righe, nessuna scartata, casella senza CSV, `last_success_at` valorizzato; nella pagina la sezione mostra «Completato».
- [ ] **Step 2:** «Esegui ora» dalla pagina con lo stesso zip.
Expected: giro forzato, ricaricamento senza modifiche ai dati (passi a zero); poi un giro non forzato (riavvio del container) → «Backup invariato», `last_success_at` aggiornato, nessuna segnalazione.
- [ ] **Step 3:** Pulizia: `.env` e override riportati com'erano, zip e cartelle di prova cancellati, `docker compose up -d` senza profilo, utente temporaneo e righe di accesso rimossi se creati. Esito nel ledger.
