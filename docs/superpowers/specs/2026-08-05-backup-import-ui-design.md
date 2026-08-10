# Backup DB e importazione dati da UI — design

Data: 2026-08-05

## Contesto

Il progetto ha già un tool di import CSV (`backend/src/data-importer/`): controller/service con path CSV fissi hardcoded (`src/data-importer/source/*.csv`), letti dal filesystem del container, senza upload né UI frontend. È stato usato una tantum per la migrazione dei dati storici, non è un tool utente.

Non esiste alcuna feature di backup/restore del database.

Questa feature aggiunge, entrambe accessibili da UI e riservate al ruolo `Admin`:

1. **Backup/restore del database** (dump completo via `mysqldump`/`mysql`), manuale da UI + schedulato via cron, con retention configurabile.
2. **Import dati via UI** (upload CSV per le stesse 9 entità già coperte da `data-importer`), come funzionalità **separata e aggiuntiva** — il vecchio `data-importer` resta intatto e non viene esposto da UI.

Vincolo trasversale: il reverse proxy di produzione (esterno al repo) limita la dimensione del body delle richieste — gli upload (file di restore `.sql`, file CSV di import) devono quindi avvenire **a chunk da 1MB**, non come singola richiesta multipart.

## Architettura

### 1. Backend — Backup/Restore

Nuovo modulo `backend/src/apis/backup/` (`backup.module.ts`, `backup.controller.ts`, `backup.service.ts`).

- Esecuzione `mysqldump`/`mysql` via `child_process.execFile` (argomenti come array, mai stringa shell — no command injection). Password passata al processo figlio via env `MYSQL_PWD`, mai in argv (non visibile in `ps`).
- Credenziali DB: stesse env già lette da `mysql.module.ts` (`MYSQL_HOST`/`MYSQL_PORT`/`MYSQL_USER`/`MYSQL_PASSWORD`/`MYSQL_DB`).
- Serve il pacchetto client MySQL nell'immagine Alpine: `RUN apk add --no-cache mysql-client` nel `Dockerfile` (stage `development` e `production`).
- Storage backup: nuova directory dedicata montata come volume Docker (`/usr/src/app/backups`), aggiunta sia a `docker-compose.yml` (volume named) sia a `docker-compose.override.yml` (bind mount, coerente col resto del progetto in dev).
- Filename pattern: `utenzepa_YYYYMMDD_HHmmss.sql`.
- Scrittura backup su path temporaneo, `rename` atomico al file finale solo se il comando `mysqldump` termina con exit code 0 — un fallimento a metà (disco pieno, connessione persa) non deve produrre un backup "valido" ma incompleto.

**Endpoint** (tutti `@Roles('Admin')`):

| Metodo | Path | Descrizione |
|---|---|---|
| `POST` | `/backup` | Crea backup ora, ritorna metadata (filename, size, createdAt) |
| `GET` | `/backup` | Lista backup esistenti (nome, data, size), letti dal filesystem |
| `GET` | `/backup/:filename/download` | Stream file (`Content-Disposition: attachment`) |
| `DELETE` | `/backup/:filename` | Cancellazione manuale |
| `POST` | `/backup/restore/chunk` | Upload chunk (max 1MB) del file `.sql` da ripristinare |
| `POST` | `/backup/restore/finalize` | Assembla i chunk, verifica password admin, esegue il restore |

`filename` nei path param è validato con whitelist regex (`^utenzepa_\d{8}_\d{6}\.sql$`) prima di essere composto in un path — nessun path traversal possibile.

**Restore — conferma distruttiva:** il restore sovrascrive tutti i dati correnti (azione irreversibile). Prima di eseguire, il frontend mostra un modal di warning esplicito e richiede il re-inserimento della password dell'utente loggato. Il backend verifica la password (bcrypt.compare contro l'hash in `system_users`, stessa logica già presente in `AuthService`) prima di procedere con `mysql < file`.

**Cron:** nuovo `@Cron()` (schedule configurabile via env `BACKUP_CRON_SCHEDULE`, default mezzanotte) in `backup.service.ts` che:
- crea un backup automatico (stessa logica di `POST /backup`);
- applica la retention: cancella i file di backup più vecchi di `BACKUP_RETENTION_DAYS` (env, default 30).

### 2. Backend — Import CSV da UI

Nuovo modulo `backend/src/apis/import/`, separato da `data-importer/` (che resta invariato, nessuna modifica al suo comportamento esterno).

Per evitare di duplicare la logica di parsing riga→entity già scritta in `data-importer.service.ts` (~700 righe: parsing date, booleani, decimali, mappe di lookup tipo/fornitore/ecc.), queste funzioni vengono estratte in helper condivisi (nuovo path, es. `data-importer/parsers/`) importati sia dal vecchio `DataImporterService` (che continua a leggere da path fisso) sia dal nuovo modulo (che riceve invece il file caricato dall'utente). I due controller/endpoint pubblici restano completamente separati.

- 9 entità supportate, stesse del vecchio importer: asset, aggregati-immobili, aggregati-utenze, capitoli-di-spesa, fornitori, utilizzatori, concessioni, utenze, fatture.
- Formato file: CSV, separatore `;`, encoding latin1 — stesso formato già richiesto oggi. Nessun mapping colonne configurabile da UI: header CSV attesi restano hardcoded (come oggi) — costruire un mapping editor è fuori scope (YAGNI).
- Upload a chunk, stesso protocollo del restore:

| Metodo | Path | Descrizione |
|---|---|---|
| `POST` | `/import/:entityType/chunk` | Upload chunk (max 1MB) del CSV |
| `POST` | `/import/:entityType/finalize` | Assembla i chunk ed esegue l'import |

- Risposta di `finalize`: stesso formato di oggi, `{ imported, skipped, skippedRows }`.
- `@Roles('Admin')` su tutti gli endpoint.

### 3. Backend — upload a chunk (componente condiviso)

Nuovo helper condiviso, usato sia da `backup` sia da `import`: `common/chunked-upload/chunked-upload.service.ts`.

- `saveChunk(uploadId, chunkIndex, totalChunks, buffer, destDir)`: append del chunk su un file temporaneo `<uploadId>.part` in `destDir` (es. `backups/tmp/` o `import/tmp/`).
- `assemble(uploadId, destDir): string`: valida che tutti i chunk (0..totalChunks-1) siano stati ricevuti e siano contigui, assembla il file finale, ritorna il path. Pulizia dei file temporanei anche in caso di errore (try/finally) — nessun accumulo di file orfani.
- `uploadId` generato **server-side** (UUID), non passato dal client — evita collisioni/overwrite tra upload concorrenti di utenti diversi.
- Validazioni: estensione file attesa (`.sql` per restore, `.csv` per import), size massima totale configurabile via env (`BACKUP_MAX_SIZE_MB` / `IMPORT_MAX_SIZE_MB`) per evitare riempimento disco da upload eccessivi.

### 4. Frontend

Nuova pagina standalone `pages/backup-import/` (PrimeNG `TabView`, due tab).

**Tab "Backup":**
- Tabella backup esistenti (nome, data, dimensione) — `GET /backup`.
- Azioni per riga: Scarica (`GET /backup/:filename/download`), Elimina (`DELETE /backup/:filename`).
- Bottone "Crea backup ora" → `POST /backup`.
- Sezione Restore: file picker `.sql` → upload a chunk (progress bar) → al termine, modal di warning esplicito ("sovrascrive TUTTI i dati attuali, azione irreversibile") + campo password → conferma → `POST /backup/restore/finalize`.

**Tab "Importa dati":**
- Select entità (9 tipi, label italiane come oggi: Immobili, Aggregati immobili, ecc.).
- File picker CSV → upload a chunk → `finalize` → tabella risultato (`imported`, `skipped`, `skippedRows`).

**Servizi Angular:** `backup.service.ts`, `import.service.ts`, `chunked-upload.service.ts` (condiviso tra i due, spezza il `File` in slice da 1MB e li invia in sequenza, poi chiama `finalize`). Tutti via `HttpClient` → passano dall'`auth-error.interceptor` già esistente.

**Menu:** nuova voce sotto il submenu esistente "Impostazioni" in `sidebar.component.ts`:

```ts
{label: 'Backup e Importazione', icon: 'pi pi-database', route: '/backup-import'},
```

Nessun filtro di ruolo a livello di voce menu (coerente con la voce "Utenti e ruoli" già presente, che non è filtrata nel menu) — il gate è interamente lato backend (`@Roles('Admin')`, risposta 403 per chi non è Admin).

## Sicurezza

- `execFile` (mai `exec`/stringa shell) per `mysqldump`/`mysql` — argomenti come array, no command injection.
- Password DB via env `MYSQL_PWD` del processo figlio, non in argv.
- Path traversal su `:filename` bloccato da whitelist regex.
- `uploadId` generato server-side.
- Validazione estensione file e size massima totale sugli upload.
- Restore protetto da re-inserimento password (bcrypt) oltre al ruolo Admin — azione distruttiva a doppia conferma.

## Edge case noti (accettati, fuori scope una soluzione più complessa)

- Nessun lock/mutex su restore o import concorrenti: uso sporadico, singolo Admin, DB comunale di dimensioni contenute — costruire una coda/lock è YAGNI allo stato attuale.
- Restore che fallisce a metà può lasciare il DB in stato inconsistente (`mysql < file` non è transazionale): errore mostrato chiaramente in UI, nessun rollback automatico. Non viene fatto un backup-pre-restore automatico (rischio noto, non richiesto in questo giro).
- Fallimento del cron di backup (es. disco pieno): loggato via `Logger.error`, nessuna notifica email automatica.

## Testing

- `backup.service.spec.ts`: mock di `child_process`, test su creazione backup, retention, parsing lista file.
- `chunked-upload.service.spec.ts`: assemble corretto, gestione chunk mancanti o fuori ordine.
- Modulo `import`: spec sui parser condivisi estratti da `data-importer` (che oggi non ha test propri).
- E2E: fuori scope per questo giro (richiederebbe DB reale + `mysqldump` in ambiente CI) — verifica manuale post-implementazione.

## Note aperte

- Se in futuro serve un backup-pre-restore automatico (rollback in caso di restore fallito a metà), va progettato come giro successivo — non incluso qui per YAGNI.
