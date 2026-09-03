# Foto su immobili/contatori — design

Data: 2026-09-03

## Obiettivo

Galleria foto (multiple) per singolo immobile (asset) e singolo contatore
(utility), caricabile/eliminabile dagli utenti Admin/Operatore, visibile in
un nuovo tab "Foto" dentro i dialog di modifica già esistenti
(`AssetEditDialogComponent`/`UtilityEditDialogComponent`).

## Contesto rilevante

- Nessun sistema di upload file esiste nel progetto. L'unico precedente è il
  logo branding: singolo data URI base64 in colonna MySQL
  (`update-branding.dto.ts`, `MAX_DATA_URI_LENGTH`) — non riusabile per una
  galleria multipla (righe DB enormi, dump/backup più lenti).
- Nessun object storage (S3/MinIO) configurato. Pattern esistente per file
  persistenti: volume Docker **named**, non bind-mount, montato sul
  container `api` — vedi `backups_data:/usr/src/app/backups` in
  `docker-compose.yml`/`docker-compose.override.yml` (usato dal modulo
  `backup`).
- Body-parser Express ha limite 100KB di default; già alzato esplicitamente
  in `main.ts` per il branding (`MAX_DATA_URI_LENGTH`) — l'upload foto passa
  da `multipart/form-data` (Multer/`FileInterceptor`), non JSON, quindi non
  soggetto allo stesso limite json ma va comunque configurato un limite
  dedicato lato Multer.
- Pattern "dialog con tab" non ancora usato nel progetto (i dialog edit
  attuali sono un unico form lungo scrollabile, vedi
  `utility-edit-dialog.component.html`) — `MatTabGroup` è nuovo per il
  frontend ma Angular Material è già la libreria UI in uso, nessuna nuova
  dipendenza.
- `MapPoint` (`frontend/src/app/pages/map/map-point.entity.ts`) è il
  precedente più vicino a un modello "polimorfico" `asset|utility` già in
  uso nel progetto (stesso concetto, contesto diverso: punti mappa, non
  foto).

## Decisioni

- Storage: **volume Docker named** (`photos_data`), stesso pattern dei
  backup. Nessuna dipendenza esterna nuova.
- Serving: **endpoint autenticato dedicato** (`GET /api/v1/photos/:id/file`,
  dietro lo stesso `JwtAuthGuard` di tutte le altre API) — non static
  serving Express, che bypasserebbe l'auth.
- Limiti upload: **10MB per foto**, mime allowlist `jpeg`, `png`, `webp`,
  `heic`/`heif`.
- HEIC (foto native iPhone, non renderizzabile nei browser): **convertito a
  JPEG lato backend** all'upload, prima di scrivere su disco. Il file
  memorizzato è sempre in un formato web-renderizzabile.
- Modello dati: **entity `Photo` polimorfica** (`entity_type` + `entity_id`),
  un solo modulo/endpoint per asset e utility — stesso concetto già visto in
  `MapPoint` lato frontend, qui applicato lato backend/DB.
- UI: **tab "Foto" dentro il dialog di modifica esistente** (nuovo
  `MatTabGroup`, tab "Dati" con il form attuale invariato + tab "Foto" con
  la galleria) — nessuna nuova route/navigazione.
- Limite **10 foto per entità**, upload/eliminazione riservati a
  **Admin/Operatore** (stesso gate ruoli già in uso per il salvataggio dei
  dialog, `Lettore` resta read-only).

## 1. Modello dati (migrazione)

Nuova tabella `photos` (entity `Photo`,
`backend/src/apis/photos/entity/photo.entity.ts`):

| Colonna | Tipo | Note |
|---|---|---|
| `id` | int PK auto_increment | |
| `entity_type` | enum(`asset`,`utility`) | |
| `entity_id` | int | FK logica, nessun vincolo DB fisico (polimorfico, come `MapPoint`) |
| `file_path` | varchar(500) | path relativo dentro il volume, es. `asset/123/<uuid>.jpg` |
| `mime_type` | varchar(50) | sempre un formato web-renderizzabile dopo l'eventuale conversione HEIC |
| `original_filename` | varchar(255) nullable | nome file originale, solo per UI (es. tooltip) |
| `file_size` | int | bytes, per validazione/quota lato UI |
| `create_date`, `update_date` | timestamp | standard TypeORM del progetto |
| `created_by_user_id`, `updated_by_user_id` | int | standard progetto |
| `deleted` | tinyint | standard progetto (soft delete, coerente col resto — il file fisico viene comunque rimosso subito, vedi sezione 3) |

Indice su `(entity_type, entity_id)` per la query di listing.

Migrazione generata dentro il container dopo la creazione dell'entity
(comando standard, vedi CLAUDE.md).

## 2. Backend — storage e conversione

- Nuovo volume Docker named `photos_data`, montato su
  `/usr/src/app/photos` nel container `api` (aggiunto sia a
  `docker-compose.yml` — produzione — sia a `docker-compose.override.yml` —
  bind mount dev, stesso pattern di `backups_data`).
- `PhotosService.savePhotoFile()`: riceve buffer + mime originale.
  - Se mime è `heic`/`heif`: conversione a JPEG via `heic-convert` (pacchetto
    puro JS/WASM, nessun binario nativo da compilare — `sharp` non serve: i
    suoi binari precompilati non includono più il supporto HEIC per motivi
    di licenza, e v1 non richiede altre operazioni immagine oltre alla
    conversione formato). Se l'install rivela comunque uno script di build
    per una dipendenza transitiva, va allowlisted in `pnpm-workspace.yaml`
    `allowBuilds` (stesso trattamento già riservato a `bcrypt`).
  - Altrimenti: scrittura diretta del buffer originale (nessuna
    ricompressione per jpeg/png/webp — evita perdita qualità/costo CPU non
    necessario).
  - Path generato: `<entity_type>/<entity_id>/<uuid>.<ext>`, `<ext>`
    derivato dal mime finale (mai `.heic` salvato su disco).

## 3. Backend — endpoint

Nuovo modulo `backend/src/apis/photos/`:

- `POST /api/v1/photos` — multipart (`FileInterceptor('file')`), body
  aggiuntivo `entity_type`, `entity_id`. Validazioni, in ordine:
  1. mime allowlist (`jpeg`/`png`/`webp`/`heic`/`heif`) — altrimenti 400.
  2. dimensione ≤10MB (Multer `limits.fileSize`) — altrimenti 413.
  3. count foto esistenti per `(entity_type, entity_id)` `< 10` — altrimenti
     400 con messaggio esplicito ("limite 10 foto raggiunto").
  4. `entity_id` esiste davvero nella tabella `assets`/`utilities`
     corrispondente — altrimenti 400 (evita foto orfane per id inventati).
  - Gate ruoli: `@Roles('Admin', 'Operatore')`, stesso decorator/guard già
    in uso sul resto delle API di scrittura.
- `GET /api/v1/photos?entityType=asset&entityId=123` — lista metadata
  (senza contenuto file) per la galleria, ordinata per `create_date`.
- `GET /api/v1/photos/:id/file` — stream del file dal volume,
  `Content-Type` da `mime_type`, dietro `JwtAuthGuard` (nessun ruolo
  specifico oltre l'autenticazione — anche `Lettore` deve poter vedere le
  foto, solo non caricarle/eliminarle).
- `DELETE /api/v1/photos/:id` — soft-delete della riga (`deleted=true`,
  stesso pattern `BaseService.remove()` del resto del progetto, per
  coerenza di audit trail) **e** rimozione immediata del file fisico dal
  volume (uno storage limitato non deve accumulare file orfani mai puliti —
  qui la foto non è più raggiungibile una volta cancellata, quindi non ha
  senso tenerne il file). Gate ruoli `Admin`/`Operatore`.

## 4. Frontend

- Nuovo `PhotosService` (`frontend/src/app/services/photos.service.ts`) —
  **non** estende `AbstractService` (upload multipart, non il CRUD JSON
  standard): allega esplicitamente l'header `Authorization: Bearer <token>`
  su ogni chiamata (vedi nota CLAUDE.md sul bug `BrandingService` — nessun
  interceptor globale lo fa per servizi custom).
- Nuovo `core/components/photo-gallery.component.ts` (standalone,
  riusabile): input `entityType`/`entityId`, mostra:
  - griglia thumbnail (`<img [src]="photoUrl(photo.id)">`, URL punta
    all'endpoint autenticato — richiede allegare comunque il token: un
    `<img src>` diretto non porta header custom, quindi le thumbnail
    vengono caricate via `HttpClient` + `URL.createObjectURL(blob)`, non
    `<img src>` diretto sull'endpoint).
  - bottone upload (multi-file), barra progresso per upload in corso,
    contatore "X/10".
  - bottone elimina per singola foto (conferma via `ConfirmDialogComponent`
    esistente, stesso pattern già usato per delete riga tabella).
  - stato vuoto ("Nessuna foto caricata").
  - sola visualizzazione (nessun bottone upload/elimina) se l'utente
    corrente non è Admin/Operatore — stesso pattern `[appHasRole]` già
    usato sui bottoni Salva dei dialog.
- `AssetEditDialogComponent`/`UtilityEditDialogComponent`: il contenuto
  form attuale va dentro `<mat-tab label="Dati">`, nuovo
  `<mat-tab label="Foto">` con `<app-photo-gallery [entityType]="'asset'"
  [entityId]="data.item.id">` (rispettivamente `'utility'`). Tab Foto
  **disabilitato** in modalità `create` (nessun `id` finché l'immobile/
  contatore non è stato salvato almeno una volta — coerente con "upload
  richiede `entity_id` esistente" lato backend).

## 5. Error handling

- Upload: errori di validazione (mime/dimensione/limite/entity_id
  inesistente) mostrati come toast (stesso `messageService` già usato nel
  resto del progetto), file non salvato, nessuna riga DB orfana.
- Conversione HEIC fallita (file corrotto, libreria non riconosce il
  formato): 400 esplicito, nessun file scritto su disco.
- Delete: se il file fisico non esiste più sul volume (es. rimosso
  manualmente) ma la riga DB sì, la delete procede comunque (rimuove la
  riga, ignora l'errore ENOENT sul file — mai bloccare per uno stato già
  inconsistente).

## 6. Testing

- Backend: unit test `PhotosService` (mock filesystem: path building,
  conversione HEIC — mock della libreria, non conversione reale nei test;
  validazione count/entity_id). Test e2e `POST/GET/DELETE /photos` con DB
  seedato (pattern esistente nel progetto).
- Frontend: nessun test automatico oltre a quanto già in uso (Karma non
  configurato attivamente). Verifica reale tramite `ng build` (obbligatoria,
  vedi CLAUDE.md) più verifica manuale in browser: upload/preview/delete su
  un immobile e un contatore reali, incluso un file HEIC se disponibile per
  il test.
- Migrazione TypeORM generata dentro il container dopo la creazione
  dell'entity `Photo` (comando standard da CLAUDE.md).

## Fuori scope (v1)

- Riordino manuale foto / foto di copertina.
- Editing immagine (crop/rotate) lato frontend.
- Compressione/resize automatico oltre alla conversione HEIC→JPEG (le foto
  vengono salvate alla risoluzione originale, entro il limite 10MB).
- Limite di storage totale a livello di volume/istanza (solo il limite per
  singola entità, 10 foto, è in scope v1).
