# Tool di migrazione dati (import iniziale da Access)

Script/endpoint one-off usati per il popolamento iniziale del DB da `UTENZE.accdb`
(esportato in CSV via `mdbtools`, vedi CLAUDE.md per i dettagli dell'export).
Vivono fuori da `backend/src/` di proposito: **non fanno parte del backend
compilato/deployato** (il Dockerfile di produzione copia solo `src/` nello stage
di build — questa cartella non entra mai nell'immagine GHCR).

La logica di import vera e propria (`DataImporterService`, con i metodi
`importAssets`/`importUtilities`/`importInvoices`/ecc., ognuno con un parametro
opzionale `filePath`) resta in `backend/src/data-importer/data-importer.service.ts`
perché è usata anche in produzione da `ImportModule` (upload CSV chunked dalla UI
"Backup e Importazione", `/api/v1/import/:entityType/chunk`) — non toccarla da qui,
è infrastruttura viva.

## Cosa c'è

- **`data-importer.controller.ts`** — i vecchi endpoint `GET /api/v1/importer/*`
  (uno per entità + `/all`), leggevano sempre dai CSV di default in
  `backend/src/data-importer/source/*.csv`, nessun upload. Ridondanti rispetto a
  `ImportModule` (stessa importazione, ma con file caricato dall'utente). Per
  riattivarli: sposta il file in `backend/src/data-importer/`, ri-aggiungi
  `DataImporterController` a `controllers` in `data-importer.module.ts`.
- **`run-import.ts`** — script one-off per lanciare `DataImporterService.importAll()`
  senza passare da HTTP (bypassa gli auth guard). Uso:
  ```bash
  docker exec utenzepa-api-1 node -r ts-node/register -r tsconfig-paths/register tools/data-importer/run-import.ts
  ```
  Scrive il risultato in `/tmp/import-result.json` nel container (non su stdout,
  per evitare troncamenti su pipe Windows).
- **`check-lookups.ts`** — verifica che i valori "categoria" nel CSV utenze
  (tipo utenza, gestore manutenzione, mercato di provenienza, fornitore, ecc.)
  esistano davvero nelle tabelle lookup del DB, PRIMA di lanciare l'import —
  un valore CSV senza corrispondenza produce FK null/errore silenzioso durante
  l'import vero. Uso:
  ```bash
  docker exec utenzepa-api-1 node -r ts-node/register -r tsconfig-paths/register tools/data-importer/check-lookups.ts
  ```

## Dati sorgente

I CSV esportati da Access vivono in `backend/src/data-importer/source/`
(gitignored, dati reali — mai committarli). Restano lì e non in questa cartella:
`DataImporterService` li referenzia con path hardcoded relativi a
`src/data-importer/source/`, spostarli romperebbe i default usati sia da
`run-import.ts`/`check-lookups.ts` sia (indirettamente) dal vecchio controller.

## Se serve rieseguire l'import su un DB nuovo/svuotato

1. Esporta `UTENZE.accdb` in CSV via `mdbtools` (vedi CLAUDE.md, sezione
   "Export da .accdb via mdbtools") in `backend/src/data-importer/source/`.
2. `check-lookups.ts` per individuare valori CSV senza corrispondenza DB.
3. Popola le tabelle lookup mancanti (tipi utenza, gestori manutenzione, ecc.)
   a mano prima di procedere.
4. `run-import.ts` per l'import completo, oppure gli endpoint chunked di
   `ImportModule` dalla UI se preferisci import entità per entità con file
   caricati singolarmente.
