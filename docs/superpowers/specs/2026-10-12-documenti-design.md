# Allegati e atti — design

Data: 2026-10-12 (rivisto lo stesso giorno: separati allegati e atti, nessuna scadenza)

## Obiettivo

Voce 19 della roadmap (allegati di contratti, immobili e impianti). Durante la revisione manuale dei fascicoli (`W:\PATRIMONIO`, `W:\CONTRATTI`) si vuole:

1. **caricare i file** di un'entità (contratto firmato, planimetria, visura, verbale…) senza compilare nulla: sono il materiale di quell'entità → **Allegati**;
2. **registrare gli atti ufficiali** (delibere, determine, decreti, atti notarili…) con i loro estremi, anche senza il testo, e collegarli a tutte le entità che riguardano → **Atti**.

Entità coperte: immobili, impianti, singole verifiche degli impianti (solo allegati), contratti immobiliari, contratti di fornitura.

Fuori scope (primo giro): utenze e complessi; estrazione del testo e ricerca nei PDF; verifica della firma digitale; versioni dei file; **scadenze** (vedi sotto).

## Decisioni (brainstorming 2026-10-12)

| Tema | Decisione |
|---|---|
| Allegati | file dell'entità, nessuna scheda propria; descrizione facoltativa; si caricano trascinandoli nel tab «Documenti» |
| Atti | entità con estremi (tipo, numero, data, oggetto, emesso da, protocollo, note); file facoltativi = allegati dell'atto; collegati N-N a immobili, impianti, contratti immobiliari e di fornitura |
| Tipi di atto | anagrafica modificabile dagli Admin; 7 tipi iniziali |
| Verifiche degli impianti | solo allegati (es. verbale) sulla singola verifica; nel tab dell'impianto compaiono anche gli allegati delle sue verifiche |
| Scadenza | nessuna: agibilità, conformità, atti e visure non scadono; contratti e verifiche hanno già la loro scadenza; CPI e APE sono obblighi dell'immobile → nuova voce di roadmap «Scadenzario degli obblighi dell'immobile» (sul modello delle verifiche, con gli allegati sulla singola scadenza) |
| Archiviazione | volume dedicato `attachments_data`; upload a pezzi come le foto |
| Lettura | schede e liste visibili a tutti; **file scaricabili solo da Admin e Operatore** (dati personali negli atti e nei contratti) |
| Scrittura | Admin e Operatore; eliminazione logica di allegati e atti |
| Collegamenti degli atti | una tabella di join per tipo di entità (FK vere) |
| Allegati | tabella unica polimorfica (`entity_type` + `entity_id`), come le foto |

## Tipi di atto iniziali

Delibera di Giunta · Delibera di Consiglio · Determina dirigenziale · Decreto · Ordinanza · Atto notarile · Autorizzazione / nulla osta / parere.

## Modello dati

### `attachments`

| Colonna | Tipo | Note |
|---|---|---|
| `id` | int PK | |
| `entity_type` | enum `asset`, `plant`, `plant_inspection`, `utilizer_grant`, `contract`, `act` | |
| `entity_id` | int | indice `(entity_type, entity_id, deleted)` |
| `original_name` | varchar(255) | |
| `stored_name` | varchar(255) | uuid + estensione |
| `mime_type` | varchar(150) | deciso dal server |
| `size_bytes` | int | |
| `description` | varchar(255), nullable | |
| audit standard | | `create_date`, `update_date`, `created_by_user_id`, `updated_by_user_id`, `deleted` |

Percorso: `<ATTACHMENTS_DIR>/<entity_type>/<entity_id>/<stored_name>`.

### `act_types`

`id`, `name` varchar(150) (unico tra i non cancellati, controllo nel service → 400), `sort_order` int, audit standard. Non eliminabile se usato da un atto non cancellato.

### `acts`

| Colonna | Tipo | Note |
|---|---|---|
| `id` | int PK | |
| `act_type_id` | int FK `act_types.id` | obbligatorio |
| `number` | varchar(100), nullable | «123/2024», «Rep. 3763» |
| `act_date` | date, nullable | |
| `subject` | varchar(500) | obbligatorio, non solo spazi |
| `issuer` | varchar(255), nullable | ufficio, notaio, ente |
| `protocol_number` | varchar(100), nullable | |
| `protocol_date` | date, nullable | |
| `notes` | text, nullable | |
| audit standard | | |

### Collegamenti degli atti

`act_assets`, `act_plants`, `act_utilizer_grants`, `act_contracts`: `(act_id, <entità>_id)` chiave composta, FK `ON DELETE CASCADE`, come `utilizer_grant_assets`.

## Migration

Una migration: 7 tabelle + i 7 tipi di atto (dati di configurazione).

## File

- `ATTACHMENTS_DIR` (default `<cwd>/attachments`), volume `attachments_data`.
- Upload a pezzi con `ChunkedUploadService`: `POST /attachments/chunk` + `POST /attachments/finalize` (`entity_type`, `entity_id`, nome originale, descrizione).
- `ATTACHMENT_MAX_SIZE_MB`, default 50.
- Tipi ammessi, controllati su estensione **e** firma del contenuto (il MIME del browser non conta): `pdf`, `p7m`, `doc`, `docx`, `odt`, `xls`, `xlsx`, `ods`, `csv`, `txt`, `jpg`, `jpeg`, `png`, `tif`, `tiff`, `eml`, `msg`. Niente archivi né eseguibili. Il `p7m` si conserva così com'è.
- Download `GET /attachments/:id/file` (`?inline=1` per PDF e immagini), solo Admin e Operatore, `Content-Disposition` con `filename*` (RFC 5987), `nosniff`. Path costruito solo da tipo, id e nome generato.
- L'entità proprietaria deve esistere e non essere cancellata (400 «… non trovato»), sia al caricamento sia al download: gli allegati di un atto o di un contratto cancellato non si scaricano più.
- Log attività sull'entità proprietaria: allegato aggiunto, descrizione cambiata, allegato eliminato (per una verifica, sull'impianto).

## Backup e ripristino

- Schedulato: solo `.sql`.
- Manuale: casella **«Includi gli allegati»** accanto a «Includi le foto»; `.tar.gz` con `photos/` e/o `attachments/` (esclusi i pezzi temporanei).
- Il ripristino da `.tar.gz` copia `attachments/` se presente.
- Nota di rilascio: allineare la produzione con allegati caricati in locale richiede il backup con allegati.

## Backend

Moduli `apis/attachments/`, `apis/act-types/`, `apis/acts/`.

| Endpoint | Ruoli | Note |
|---|---|---|
| `GET /attachments?entity_type=&entity_id=` | tutti | allegati non cancellati; per `plant` anche quelli delle sue verifiche, con `inspection: {id, kind}` |
| `POST /attachments/chunk`, `POST /attachments/finalize` | Admin, Operatore | |
| `GET /attachments/:id/file` | Admin, Operatore | |
| `PATCH /attachments/:id`, `DELETE /attachments/:id` | Admin, Operatore | descrizione; eliminazione logica |
| `GET /act-types`; `POST/PATCH/DELETE /act-types/:id` | tutti; Admin | |
| `GET /acts` | tutti | filtri: tipo, anno, collegato a (`linked_to`), senza file, cancellati; con `file_count` e `link_count`; ricerca libera lato client |
| `GET /acts/by-entity/:entity/:id` | tutti | atti collegati a un'entità |
| `GET /acts/:id` | tutti | con tipo e collegamenti |
| `POST /acts`, `PATCH /acts/:id` | Admin, Operatore | collegamenti iniziali (`asset_ids`, `plant_ids`, `utilizer_grant_ids`, `contract_ids`); in PATCH assenti = invariati |
| `DELETE /acts/:id`, `POST /acts/:id/restore` | Admin, Operatore | logici |
| `POST /acts/:id/links`, `DELETE /acts/:id/links` | Admin, Operatore | `{entity, id}` |

Entità inesistenti o cancellate → 400 (niente 409). Log attività: creazione e modifica degli atti, collegamenti.

## Frontend

- **`app-attachments`** (input: tipo e id entità, sola lettura): area di trascinamento + scelta file, controllo dell'estensione prima dell'invio, avanzamento, tabella (nome, descrizione modificabile, dimensione, caricato da/il), «Apri» (PDF e immagini) e «Scarica» solo per Admin/Operatore (altrimenti «Download riservato»), «Elimina» con conferma. Righe delle verifiche (nel tab dell'impianto) con l'etichetta «verifica: <tipo>».
- **Tab «Documenti»** nelle schede immobile, impianto, contratto immobiliare e contratto di fornitura: sezione **Allegati** (`app-attachments`) e sezione **Atti collegati** (`app-linked-table`: tipo, numero, data, oggetto; «Collega atto», «Nuovo atto», «Scollega» con conferma, clic → scheda atto). Componente unico `app-entity-documents`.
- **Verifiche dell'impianto**: icona con il numero di allegati su ogni riga → dialog con `app-attachments` della verifica.
- **Elenco «Atti»** (menu, gruppo Patrimonio): colonne tipo, numero, data, oggetto, emesso da, file, collegamenti; filtri tipo, anno, collegato a, senza file, cancellati; `?selectedId=`.
- **Scheda atto** (shell `entity-sheet`, salva da sé): Riepilogo, Allegati (`app-attachments` con tipo `act`, dopo il primo salvataggio), Collegamenti (immobili, impianti, contratti immobiliari, contratti di fornitura), Note, Storico.
- **Tipi di atto**: pagina nelle impostazioni (Admin).

## Guida operatori

«Allegare un file a un immobile, impianto o contratto», «Registrare un atto», regola «Chi può scaricare i file», problema frequente «Tipo di file non ammesso». Bottone «?» della pagina Atti.

## Test

- Regole sui file: estensioni, firme, nome nel `Content-Disposition`, dimensione massima.
- Allegati: proprietario inesistente → 400, path generato, contenuto non valido → 400 senza file residui, file mancante su disco → 400, allegati delle verifiche nel tab dell'impianto, audit sul proprietario.
- Tipi di atto: nome unico, non eliminabile se usato.
- Atti: creazione con collegamenti, collegamento a entità inesistente → 400, PATCH collegamenti assenti/presenti, link/unlink idempotenti, conteggi e filtri.
- Backup con `attachments/`, ripristino.
- E2E: PDF reale caricato sulla scheda di un contratto; atto registrato senza file e collegato a due immobili; verbale su una verifica visibile nel tab dell'impianto; utente in sola lettura senza download.

## Rilascio

Minor (migration). Nuovo volume `attachments_data` e variabili facoltative `ATTACHMENTS_DIR`/`ATTACHMENT_MAX_SIZE_MB`: aggiungere il volume al `docker-compose.yml` di produzione prima di caricare allegati.
