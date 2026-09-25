# Classificazione immobili (Natura × Funzione + Stato) e utenze multi-immobile — Design

Data: 2026-09-25

## Contesto e obiettivo

Oggi ogni immobile ha un solo "tipo immobile" (`assets.asset_type_id` → `asset_aggregators`, 27 voci piatte) che mescola tre concetti diversi:

- **funzione** (SCUOLE, SPORT, SOCCORSO, CIMITERO…)
- **natura fisica / tipo di punto** (PUNTO PRESA ACQUA, PUBBLICA ILLUMINAZIONE, ROTATORIE…)
- **stato** ("ex PUNTO PRESA…", "EX_IMMOBILE LOCATO NON PIU IN USO", "AREE CON CONTATORE DA INDIVIDUARE")

Ogni utenza è inoltre collegata a un solo immobile (`utilities.asset_id_fk`), mentre nella realtà un contatore può servire più immobili (es. irrigazione campo sportivo + fontana sullo stesso contatore).

Obiettivo:

1. Classificare gli immobili su due assi indipendenti — **Natura** (cos'è fisicamente) e **Funzione** (a cosa serve) — con un vincolo di **coppie ammesse**, più uno **Stato** separato.
2. Permettere a un'utenza di essere collegata a **N immobili**.
3. Migrare progressivamente dalla vecchia classificazione senza perdere informazione, fino al drop di `asset_aggregators`.

Nota: la tabella esistente `purpose` ("destinazione d'uso") riguarda le **utenze** (collegata a `utility_types`), non gli immobili — non viene riusata né toccata.

## Decisioni prese

| Tema | Decisione |
|---|---|
| Modello classificazione | Due FK indipendenti sull'immobile (natura, funzione), coppie consentite in tabella ponte. Una funzione può appartenere a più nature (es. "Eventi" per Area e Fabbricato) |
| Voci iniziali | Inserite dall'utente da Impostazioni, nessun seed nel codice |
| Utenza ↔ immobile | N:N, collegamento puramente informativo. Nessuna ripartizione costi: la contabilità resta sul capitolo di spesa della fattura. Un report per immobile può contare la stessa utenza sotto più immobili (voluto) |
| Vecchio tipo immobile | Mantenuto in sola lettura (badge nell'header del dettaglio, nessuna select). Azzerato automaticamente quando l'immobile riceve natura **e** funzione. Drop della tabella in un giro futuro, quando tutti i valori sono NULL |
| Stato | Incluso in questo giro: enum `Attivo` / `Dismesso` / `Da verificare` |
| Marker mappa utenza | Coordinate proprie dell'utenza → un marker; altrimenti un marker per **ogni** immobile collegato |

## 1. Modello dati e migrazione

### Nuove tabelle

Anagrafiche con pattern standard del progetto (`create_date`, `update_date`, `created_by_user_id`, `updated_by_user_id`, soft-delete `deleted`):

| Tabella | Campi |
|---|---|
| `asset_natures` | `id`, `name` (unique) |
| `asset_functions` | `id`, `name` (unique), `icon` (nullable, ligature Material Icons) |

Tabelle ponte (PK composta, FK con `ON DELETE CASCADE` sul lato padre):

| Tabella | Campi |
|---|---|
| `asset_nature_functions` | `nature_id`, `function_id` — coppie ammesse |
| `utility_assets` | `utility_id`, `asset_id` — collegamento utenza ↔ immobile |

### Modifiche a `assets`

- `+ nature_id` INT NULL, FK → `asset_natures.id`
- `+ function_id` INT NULL, FK → `asset_functions.id`
- `+ status` ENUM(`Attivo`,`Dismesso`,`Da verificare`) NOT NULL DEFAULT `Attivo`
- `asset_type_id` da NOT NULL a **NULL** (legacy, sola lettura)

### Modifiche a `utilities`

- Copia dati: `INSERT INTO utility_assets (utility_id, asset_id) SELECT id, asset_id_fk FROM utilities WHERE asset_id_fk IS NOT NULL`
- Drop FK + colonna `asset_id_fk` **nella stessa migration** (nessun periodo con due fonti di verità)

### Migration

Una sola migration scritta a mano. `migration:generate` usato solo come riferimento, scartando il drift preesistente non correlato (vedi CLAUDE.md). Contenuto scritto fuori da `src/database/migrations/` e spostato lì solo a versione definitiva (watcher + `migrationsRun: true`). Il `down()` ricrea `asset_id_fk` e la ripopola col primo `asset_id` per utenza (lossy per utenze con più immobili — accettato, documentato nel codice).

### Fuori scope

- Drop di `asset_aggregators` e `assets.asset_type_id`: migration futura, quando il contatore legacy arriva a 0.
- `utilizer_grant.asset`: resta 1:1.

## 2. API backend

### Nuove anagrafiche

- `apis/asset-natures/`: CRUD standard (`/asset-natures`), stesso pattern di `purpose`/`asset-aggregators`.
  - `GET /asset-natures/:id/functions` → funzioni ammesse.
  - `PUT /asset-natures/:id/functions` body `{ function_ids: number[] }` → sostituisce le coppie. **409** se rimuove una coppia usata da almeno un immobile non cancellato (messaggio con numero di immobili coinvolti).
- `apis/asset-functions/`: CRUD standard (`/asset-functions`), campo `icon`.
- Soft-delete di natura/funzione: **409** se usata da immobili non cancellati.

### Immobili (`/assets`)

- DTO create: `nature_id`, `function_id` **obbligatori**; `status` opzionale (default `Attivo`). `asset_type_id` rimosso.
- DTO update: `nature_id`, `function_id`, `status` opzionali. `asset_type_id` rimosso (non più scrivibile via API).
- Validazione (create e update, sui valori risultanti dopo il merge con l'esistente): se natura e funzione sono entrambe valorizzate, la coppia deve esistere in `asset_nature_functions`, altrimenti **400** con messaggio esplicito. Funzione senza natura → 400.
- Azzeramento legacy: se dopo il salvataggio natura **e** funzione sono valorizzate → `asset_type_id = NULL`.
- Search: `+ nature_id`, `function_id`, `status`, `legacy_only` (boolean: `asset_type_id IS NOT NULL`). Filtro `asset_type_id` mantenuto.
- `findAll()` e `findOne()`: join `nature`, `function`, `assetAggregator` in **entrambi** (lezione CLAUDE.md: il dialog si apre dalla riga di `findAll()`).
- `GET /assets/legacy-count` → `{ count: number }` immobili non cancellati con `asset_type_id` non NULL.

### Utenze (`/utilities`)

- DTO create: `asset_ids: number[]` (`@ArrayMinSize(1)`, obbligatorio) al posto di `asset_id_fk`.
- DTO update: `asset_ids?: number[]` (se presente, `@ArrayMinSize(1)`; sostituisce l'insieme).
- Validazione: tutti gli id esistono e non sono cancellati, altrimenti 400.
- Search: `asset_ids` → utenze collegate ad **almeno uno** degli immobili (join su `utility_assets` solo in `WHERE`, dati caricati via relazione reale — vedi lezione CLAUDE.md su `leftJoinAndSelect` + join one-to-many).
- Risposta: `assets: Asset[]` (con `utilizerGrants` per ciascuno) al posto di `asset`. Breaking change del contratto, unico client = frontend dello stesso repo, rilasciati insieme.
- `assets.service` `findAll`/`findOne`: le utenze dell'immobile passano dalla relazione N:N.

### Mappa (`map.service`)

- Icona marker immobile: `function.icon ?? assetAggregator.icon`.
- Filtri: `+ natureIds`, `functionIds`, `statuses`; `assetAggregatorIds` mantenuto.
- Marker utenza:
  - coordinate proprie presenti → un marker, `id = utilityId`, `assetId` = primo immobile collegato (per il raggruppamento)
  - altrimenti → un marker per ogni immobile collegato con posizione risolvibile, `id = "${utilityId}-${assetId}"`, `assetId` singolo
  - utenza senza posizione risolvibile su nessun immobile → una sola voce "non localizzata"
- Il filtro immobili su utenze considera **qualunque** immobile collegato.

### Import storico (`data-importer`)

- Continua a valorizzare `asset_type_id` (unica classificazione presente nella fonte Access).
- Scrive il collegamento utenza → immobile su `utility_assets`.

## 3. Frontend

### Impostazioni — nuove anagrafiche

- **Nature immobile** (`pages/asset-nature/`): tabella + dialog. Dialog con `mat-select multiple` "Funzioni ammesse" (pattern `utility-type-edit-dialog`). Errore 409 mostrato come messaggio.
- **Funzioni immobile** (`pages/asset-function/`): tabella + dialog, campi nome e icona.
- **Tipo immobile** (`asset-aggregator`): pagina resta, in **sola lettura** (nessun pulsante crea/modifica/elimina).

### Dialog immobile (`asset-edit-dialog`)

- Rimossa la select `asset_type_id`.
- Nuovi campi: **Natura** → **Funzione** (opzioni filtrate da `GET /asset-natures/:id/functions`; svuotata al cambio natura; disabilitata senza natura) → **Stato**.
- Header: se `asset_type_id` non NULL, badge `Tipo precedente: <code>` (`justify-content:flex-start` + `margin-left:auto`, non `space-between` — vedi CLAUDE.md, `::before` MDC).
- Dopo il salvataggio con natura e funzione, il badge non compare più (dato aggiornato dalla risposta).

### Tabella immobili

- Colonne `Natura`, `Funzione`, `Stato`; "Tipo immobile" rinominata "Tipo precedente".
- Filtri: natura, funzione, stato, tipo precedente.
- Banner sopra la tabella: "N immobili da riclassificare" (da `GET /assets/legacy-count`), cliccabile → applica `legacy_only=true`. Nascosto quando N = 0.

### Dialog utenza (`utility-edit-dialog`)

- `FilterableSelect` singolo → lista di chip + `FilterableSelect` "Aggiungi immobile" (esclude gli immobili già aggiunti). Almeno un immobile obbligatorio.
- Ogni chip: rimozione + pulsante "vai all'immobile".
- Sezione concessioni raggruppata per immobile collegato.

### Tabella e filtri utenze

- Colonna immobile: nomi separati da virgola.
- Filtro immobile: selezione singola, invia `asset_ids: [id]`.

### Mappa

- Filtri Natura, Funzione, Stato + Tipo precedente.
- Chiave marker aggiornata per gestire `id` stringa `utilityId-assetId`.

## 4. Test e verifica

- **Unit backend** (`--maxWorkers=2`, file mirati):
  - assets: coppia non ammessa → 400; funzione senza natura → 400; azzeramento legacy solo con entrambe valorizzate; create senza natura/funzione → 400
  - asset-natures: `PUT functions` con coppia in uso → 409
  - asset-natures/functions: delete in uso → 409
  - utility: `asset_ids` vuoto → 400; id inesistente → 400; filtro N:N
  - map: utenza con coordinate proprie → 1 marker; senza → 1 marker per immobile; id composti
- **Migration**: su copia del DB reale — conteggio righe `utility_assets` = utenze con `asset_id_fk` non NULL; riavvio container due volte pulito.
- **Frontend**: `ng build` reale.
- **E2E browser** (utente temporaneo da eliminare a fine test, vedi CLAUDE.md): crea natura+funzioni+coppie; riclassifica un immobile legacy → badge sparisce e contatore scende; coppia non ammessa impossibile da selezionare; utenza con due immobili → marker su entrambi in mappa.

## Rischi

- **Breaking change `asset` → `assets` nelle risposte utenze**: tutti i punti frontend che leggono `utility.asset` vanno aggiornati nello stesso rilascio (grep esaustivo su `asset_id_fk`, `.asset?.`, `.asset!.`).
- **Performance join N:N** in `findAll` utenze (~600 righe): accettabile; verificare in e2e che il caricamento resti in linea con l'attuale.
- **Down migration lossy** per utenze con più immobili: accettato.
