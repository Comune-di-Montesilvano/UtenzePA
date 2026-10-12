# Documenti e riferimenti ad atti — design

Data: 2026-10-12

## Obiettivo

Voce 19 della roadmap (allegati di contratti, immobili e impianti), allargata a un'entità **Documento** autonoma: durante la revisione manuale dei fascicoli (`W:\PATRIMONIO`, `W:\CONTRATTI`) si registra l'atto letto e lo si collega alle entità a cui si riferisce, caricando i file oppure solo gli estremi.

- Un documento è un atto o un documento tecnico/amministrativo: tipo, numero, data, oggetto, chi lo ha emesso, protocollo, scadenza facoltativa.
- **File facoltativi**: zero file = solo riferimento (es. delibera di cui si hanno gli estremi, atto troppo pesante da caricare); più file = atto con i suoi allegati.
- **Un documento, molte entità**: si registra una volta e si collega a immobili, impianti, verifiche degli impianti, contratti immobiliari, contratti di fornitura (es. una delibera del federalismo demaniale per 20 immobili).
- Elenco **Documenti** con scheda propria; tab «Documenti» nelle schede delle entità collegate.

Fuori scope (primo giro): collegamento a utenze e complessi (una tabella di collegamento in più ciascuno, quando servirà), estrazione del testo e ricerca nei PDF, verifica della firma digitale, versioni dei file.

## Decisioni prese (brainstorming 2026-10-12)

| Tema | Decisione |
|---|---|
| Collegamento | N-N: un documento, più entità; dalla scheda dell'entità si collega un documento esistente o se ne crea uno al volo |
| File | più file per documento, anche nessuno |
| Tipi | anagrafica modificabile dagli Admin, con gruppo; 28 tipi iniziali |
| Scadenza | facoltativa sul documento, con badge e segnalazioni |
| Verifiche degli impianti | il documento si collega alla singola verifica (es. verbale); la scadenza della verifica resta sulla verifica (`next_date`), non sul documento; il tab Documenti dell'impianto mostra anche i documenti delle sue verifiche |
| Archiviazione | volume dedicato `documents_data`; upload a pezzi come le foto |
| Lettura | schede visibili a tutti; **file scaricabili solo da Admin e Operatore** (dati personali negli atti) |
| Scrittura | Admin e Operatore; eliminazione logica di documenti e file |
| Collegamento tecnico | una tabella di collegamento per tipo di entità (FK vere), non polimorfica |

## Tipi iniziali

Il gruppo serve a ordinare e filtrare.

| Gruppo | Tipi |
|---|---|
| Atti amministrativi | Delibera di Giunta · Delibera di Consiglio · Determina dirigenziale · Decreto · Ordinanza · Autorizzazione / nulla osta / parere |
| Atti contrattuali e notarili | Atto notarile · Contratto · Convenzione · Verbale di consegna / riconsegna · Registrazione (F23/F24, Agenzia Entrate) · Polizza |
| Tecnici e certificazioni | Certificato di agibilità · CPI / SCIA antincendio · Attestato di prestazione energetica (APE) · Dichiarazione di conformità impianti · Collaudo · Verbale di verifica · Libretto d'impianto · Elaborato di progetto · Perizia / stima |
| Catasto | Visura · Planimetria · Frazionamento / DOCFA / tipo mappale |
| Economici | Fattura · Preventivo / offerta |
| Corrispondenza e altro | Nota / lettera / PEC · Altro |

Le foto non sono un tipo: restano nel tab Foto. «Fattura» qui è un documento (es. lavori, acquisto), non la fattura di un'utenza (`invoices`).

## Modello dati

### `document_types`

| Colonna | Tipo | Note |
|---|---|---|
| `id` | int PK | |
| `name` | varchar(150) | unico tra i non cancellati (controllo nel service, 400) |
| `group_name` | varchar(100) | uno dei 6 gruppi, testo libero |
| `sort_order` | int, default 0 | ordine nel gruppo |
| audit standard | | `create_date`, `update_date`, `created_by_user_id`, `updated_by_user_id`, `deleted` |

Non eliminabile se usato da un documento non cancellato (400 con messaggio).

### `documents`

| Colonna | Tipo | Note |
|---|---|---|
| `id` | int PK | |
| `document_type_id` | int FK `document_types.id` | obbligatorio |
| `number` | varchar(100), nullable | testo libero: «123/2024», «Rep. 3763» |
| `document_date` | date, nullable | data dell'atto |
| `subject` | varchar(500) | oggetto, obbligatorio, non solo spazi |
| `issuer` | varchar(255), nullable | emesso da (ufficio, notaio, ente) |
| `protocol_number` | varchar(100), nullable | |
| `protocol_date` | date, nullable | |
| `expires_on` | date, nullable | validità (CPI, agibilità, APE, polizze…) |
| `notes` | text, nullable | |
| audit standard | | come sopra |

### `document_files`

| Colonna | Tipo | Note |
|---|---|---|
| `id` | int PK | |
| `document_id` | int FK `documents.id` `ON DELETE CASCADE` | |
| `original_name` | varchar(255) | nome del file caricato |
| `stored_name` | varchar(255) | nome su disco (uuid + estensione) |
| `mime_type` | varchar(150) | |
| `size_bytes` | int | |
| `description` | varchar(255), nullable | es. «Allegato A – planimetria» |
| audit standard | | `deleted` = eliminazione logica; il file resta su disco |

Percorso su disco: `<DOCUMENTS_DIR>/<document_id>/<stored_name>`.

### Tabelle di collegamento

`document_assets`, `document_plants`, `document_plant_inspections`, `document_utilizer_grants`, `document_contracts`: `(document_id, <entità>_id)` chiave primaria composta, FK su entrambi `ON DELETE CASCADE`, come `utilizer_grant_assets`. Le eliminazioni logiche delle entità non toccano i collegamenti; le liste escludono le entità cancellate.

### Valori calcolati

- **Stato di scadenza** (`expiry_status`): `EXPIRED` se `expires_on` < oggi, `EXPIRING` se entro 60 giorni, altrimenti null. Funzione pura in `apis/documents/document-expiry.ts` con la gemella SQL per i filtri (come `cost-status.ts`).
- **Conteggi** per le schede: numero di file e di collegamenti per documento; numero di documenti per entità e per verifica.

## Migration

Una migration: crea le 8 tabelle e inserisce i 28 tipi (dati di configurazione, non dati di esercizio). Down: drop in ordine inverso.

## Archiviazione e file

- Variabile `DOCUMENTS_DIR` (default `<cwd>/documents`), volume `documents_data` in `docker-compose.yml` (prod) e override dev, come `photos_data`.
- Upload a pezzi riusando `ChunkedUploadService` (`@common/chunked-upload`): `POST /documents/:id/files/chunk` + `POST /documents/:id/files/finalize`. Il proxy di produzione limita il body: niente upload in un solo colpo.
- `DOCUMENT_MAX_SIZE_MB`, default 50, controllato alla finalizzazione.
- Tipi ammessi (estensione **e** MIME, controllati entrambi): `pdf`, `p7m`, `doc`, `docx`, `odt`, `xls`, `xlsx`, `ods`, `csv`, `txt`, `jpg`, `jpeg`, `png`, `tif`, `tiff`, `eml`, `msg`. Niente archivi né eseguibili. Il `p7m` si conserva e si scarica così com'è.
- Download: `GET /documents/files/:fileId` (attachment) e `?inline=1` per PDF e immagini (anteprima in una nuova scheda; il frontend scarica il blob con il token e apre un object URL). Solo Admin e Operatore; header `X-Content-Type-Options: nosniff`, nome originale in `Content-Disposition` (RFC 5987).
- Il percorso si costruisce solo da id e `stored_name` generato: nessun input dell'utente nel path.

## Backup e ripristino

- Il backup schedulato resta solo `.sql`.
- Backup manuale: oltre a «Includi le foto», casella **«Includi i documenti»**; se una delle due è attiva il formato è `.tar.gz` con `photos/` e/o `documents/`.
- Il ripristino da `.tar.gz` sostituisce la cartella dei documenti se l'archivio la contiene (come le foto).
- Nota di rilascio: l'allineamento della produzione con documenti caricati in locale richiede il backup con documenti; la dimensione cresce con i PDF.

## Backend

Moduli `apis/document-types/` e `apis/documents/`, guardie `JwtAuthGuard` + `RolesGuard`.

| Endpoint | Ruoli | Note |
|---|---|---|
| `GET /document-types` | tutti | ordinati per gruppo, `sort_order`, nome |
| `POST/PATCH/DELETE /document-types/:id` | Admin | |
| `GET /documents` | tutti | filtri: tipo, gruppo, anno della data, testo (oggetto/numero/emesso da), `expiry_status`, `without_files`, `deleted`, collegato a (`asset_id`, `plant_id`, `utilizer_grant_id`, `contract_id`) |
| `GET /documents/:id` | tutti | con tipo, file non cancellati, collegamenti (id + etichetta) |
| `POST /documents` | Admin, Operatore | accetta i collegamenti iniziali (`asset_ids`, `plant_ids`, `plant_inspection_ids`, `utilizer_grant_ids`, `contract_ids`) |
| `PATCH /documents/:id` | Admin, Operatore | collegamenti assenti = invariati, presenti = sostituiti |
| `DELETE /documents/:id`, `POST /documents/:id/restore` | Admin, Operatore | logici |
| `POST /documents/:id/links` / `DELETE /documents/:id/links` | Admin, Operatore | `{entity, id}`: collega/scollega una singola entità (dalle schede) |
| `GET /documents/by-entity/:entity/:id` | tutti | documenti di un'entità; per `plant` anche quelli delle sue verifiche, con `via_inspection: {id, kind}` |
| upload chunk/finalize | Admin, Operatore | vedi sopra |
| `GET /documents/files/:fileId` | Admin, Operatore | download/anteprima |
| `PATCH /documents/files/:fileId`, `DELETE /documents/files/:fileId` | Admin, Operatore | descrizione; eliminazione logica |

- Entità collegate inesistenti o cancellate in creazione/modifica: 400 «… non trovato» (niente 409).
- Log attività: creazione, modifica dei campi, collegamenti (come le unità catastali), file aggiunti/eliminati.
- Segnalazioni (`apis/anomalies/`, query in fondo): `documents_expired`, `documents_expiring`.

## Frontend

### Elenco Documenti (`pages/documents/`)

Voce di menu «Documenti». Colonne: tipo, numero, data, oggetto, emesso da, file (n.), collegamenti (n.), scadenza con badge. Filtri (`documents-filters.ts`): tipo, gruppo, anno, collegato a, scaduti/in scadenza, senza file, cancellati. Segnalazioni: «Scaduti», «In scadenza». `?selectedId=` apre la scheda.

### Scheda documento

Shell `entity-sheet`, aperta con `EntityNavigatorService`. Header: tipo + numero/data, badge Scaduto/In scadenza.

- **Riepilogo**: i campi; tipo con `app-filterable-select` (creazione al volo solo per Admin).
- **File**: elenco (nome, descrizione, dimensione, caricato da/il), area di trascinamento + pulsante, progresso dell'upload a pezzi; «Apri» (PDF/immagini) e «Scarica» solo per Admin/Operatore, altrimenti la riga indica «Download riservato». Eliminazione con conferma.
- **Collegamenti**: `app-linked-table` per immobili, impianti, verifiche (etichetta «impianto – verifica»), contratti immobiliari, contratti di fornitura; «Scollega» con conferma.
- **Storico**: `EntityHistoryComponent`.

### Tab «Documenti» nelle schede

Componente unico `app-entity-documents` (input: entità e id) nelle schede immobile, impianto, contratto immobiliare, contratto di fornitura: tabella (tipo, numero, data, oggetto, file, scadenza), «Collega documento» (ricerca tra i documenti) e «Nuovo documento» (crea già collegato), «Scollega» con conferma, clic sulla riga → scheda documento. Nell'impianto le righe delle verifiche hanno l'etichetta «da verifica: <tipo>» e si scollegano dalla verifica.

### Verifiche dell'impianto

Nel tab Verifiche ogni riga ha un'icona con il numero di documenti; clic → dialog con `app-entity-documents` sulla verifica.

### Tipi di documento

Pagina nelle impostazioni (solo Admin), come Tipi utenza: nome, gruppo, ordine.

## Guida operatori

Sezioni nuove: «Registrare un documento o un atto» (con o senza file, collegamenti, verbali delle verifiche), regola «Chi può scaricare i file», problema frequente «File non accettato» (tipi e dimensione). Ancore nel `GUIDA_PER_PAGINA` della pagina Documenti.

## Test

- `document-expiry.spec.ts`: stati e gemella SQL.
- `documents.service.spec.ts`: creazione con collegamenti, entità inesistente → 400, PATCH collegamenti assenti/presenti, `by-entity` dell'impianto con i documenti delle verifiche, tipo non eliminabile se usato.
- File: estensione/MIME non ammessi, dimensione oltre il limite, download negato ai ruoli in sola lettura (controller), nome originale nel `Content-Disposition`, path senza input dell'utente.
- Backup: archivio con `documents/`, ripristino che la sostituisce.
- E2E (Playwright, utente temporaneo): nuovo documento da una scheda immobile con un PDF reale, anteprima, collegamento a un secondo immobile, verbale su una verifica visibile nel tab dell'impianto.

## Rilascio

Minor (migration). Note: nuovo volume `documents_data` e variabili `DOCUMENTS_DIR`/`DOCUMENT_MAX_SIZE_MB` (facoltative); `docker-compose.yml` di produzione da aggiornare con il volume prima di caricare documenti.
