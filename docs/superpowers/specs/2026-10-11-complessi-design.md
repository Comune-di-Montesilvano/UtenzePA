# Complessi — design

Data: 2026-10-11

## Obiettivo

Introdurre l'entità **Complesso**: raggruppa immobili gestiti o censiti come un insieme (palazzina di alloggi, plesso scolastico, impianto sportivo con più edifici). È il livello "compendio" del censimento MEF: compendio → bene (immobile) → coordinate catastali (unità, fase 2).

È la **fase 1 di 4** della voce 2 della roadmap (inventario patrimoniale e catasto), concordate il 2026-10-11:

1. complessi (questo documento);
2. modifiche agli immobili: unità catastali (N per immobile), Id bene MEF, dati di patrimonio, utilizzo calcolato;
3. import MEF 2025: beni → immobili (un immobile per bene MEF, sempre), coordinate → unità, compendi → complessi;
4. export MEF.

Seguono, fuori da questa sequenza: terreni (entità separata, import dal geoportale), catasto proposto dal SIT, trasparenza.

Fuori scope:

- creazione dei complessi reali: la fanno lo script dati della fase 3 (compendi MEF, gruppi di appartamenti) e gli utenti dalla UI;
- spesa aggregata del complesso;
- unità catastali e dati MEF dell'immobile (fase 2).

## Contesto

- Un immobile oggi non ha raggruppamenti. Il campo "Descrizione fabbricato" (`assets.associated_building`, testo libero, 134 valori distinti su 190 immobili) a volte descrive l'edificio ("Edificio con 6 alloggi proprietà contrada giardino", 22 immobili) ma per lo più è una descrizione ("Locali in affitto", "garage"). **Resta com'è**: i 4 gruppi veri (Contrada Giardino, Valle d'Aosta, Costa, Piceni) diventano complessi nella fase 3.
- MEF 2025: 5 compendi (impianto sportivo di via Senna, alloggi Carabinieri via Agostinone, istituti comprensivi Silone, Rodari e Delfico), con tipo e numero di beni.
- Gli appartamenti di uno stesso edificio sono beni MEF separati (via Salieri: 25) e nell'app diventano immobili separati raggruppati in un complesso (fase 3).

## Modello dati

### Tabella `complexes`

| Colonna | Tipo | Note |
|---|---|---|
| `id` | int PK | |
| `name` | varchar(255), obbligatorio | |
| `complex_type` | enum, nullable | tipo compendio MEF (sotto) |
| `toponym` | varchar(255), nullable | come `assets` |
| `address` | varchar(255), nullable | |
| `civic_number` | varchar(50), nullable | |
| `latitude`, `longitude` | varchar(20), nullable | come `assets`; vuoti = centro calcolato dagli immobili |
| `mef_compendium_id` | int, nullable, unique | Id compendio MEF: assegnato dal MEF, **sola lettura in UI**, valorizzato solo dall'import MEF |
| `notes` | text, nullable | |
| `create_date`, `update_date`, `created_by_user_id`, `updated_by_user_id`, `deleted` | | standard dei moduli |

Colonne stringa nullable con `type: 'varchar'` esplicito.

**Tipo complesso** (`complex-type.enum.ts`, gemello frontend `pages/complexes/complex-type.ts` con etichette): i tipi di compendio del tracciato MEF. Il piano recupera la lista ufficiale dal tracciato del portale MEF; se non è reperibile, l'enum contiene i 3 tipi presenti nel censimento 2025 (`SPORTS_RECREATIONAL` "Complesso sportivo/ricreativo", `MILITARY` "Complesso militare", `SCHOOL_UNIVERSITY` "Complesso universitario/scolastico") più `OTHER` "Altro".

### Immobile

`assets.complex_id` int, nullable, FK `complexes.id` (`ON DELETE SET NULL`). Un immobile appartiene ad **al massimo un** complesso.

### Migration

Una migration: `CREATE TABLE complexes` + `ADD COLUMN assets.complex_id` + FK + indice. Nessun dato.

### Id e codice compendio MEF

Il tracciato MEF ha due campi: **Id Compendio** (numerico, assegnato dal sistema MEF, non modificabile) e **Codice Compendio** (codifica libera del Comune). Nell'app non c'è un campo codice: all'export (fase 4) il Codice Compendio è l'id del complesso. Giro per un complesso nuovo: export con Id vuoto e Codice = id app → il MEF assegna l'Id → l'export MEF dei compendi rientra con l'import (fase 3), che abbina per Codice e scrive `mef_compendium_id`. L'Id non si inserisce mai a mano; un Id duplicato è rifiutato con 400.

Nota MEF: un compendio è un insieme di beni di proprietà connessi; una parte di palazzina non lo è, e un compendio con 0 o 1 beni è un'anomalia bloccante. Il complesso dell'app è più ampio: all'export vanno come compendi solo i complessi che rispettano la definizione.

## Backend

Modulo `src/apis/complexes/` (entity, DTO, service, controller, module), come gli altri moduli REST. Permessi come per gli immobili.

| Endpoint | Comportamento |
|---|---|
| `GET /complexes` | elenco non cancellati; filtri `q` (nome/indirizzo), `complex_type`; per riga conteggi calcolati: `asset_count`, `utility_count` (utenze non cancellate degli immobili, distinte), `plant_count`, `active_grant_count` (contratti immobiliari con stato mostrato attivo o in scadenza) |
| `GET /complexes/:id` | dettaglio con `assets` (id, nome, indirizzo, tipologia, funzione, stato) e gli stessi conteggi |
| `POST /complexes` | crea; `asset_ids` facoltativo |
| `PATCH /complexes/:id` | aggiorna; con `asset_ids` sostituisce l'insieme degli immobili (quelli tolti → `complex_id = NULL`; quelli aggiunti che erano in un altro complesso vi vengono spostati) |
| `DELETE /complexes/:id` | soft delete; **400** con messaggio "Il complesso ha N immobili collegati: scollegali prima di eliminarlo" se ne ha (mai 409) |
| `GET /complexes/:id/utilities`, `/plants`, `/grants` | righe per i tab di sola lettura, con l'immobile di appartenenza |

Immobili: `complex_id` in create/update DTO e nel filtro di ricerca di `GET /asset`; `complex` (id, nome) nelle righe di elenco e nel dettaglio.

Audit: `complexes` nel log attività come le altre entità (campi e collegamento immobili). `complex_id` dell'immobile tracciato come gli altri campi.

Foto: `PhotoEntityType.COMPLEX` nel modulo `photos`.

Mappa (`apis/map/`): punti del livello complessi con id, nome, tipo, posizione (propria o media delle coordinate degli immobili con posizione, stessa regola di posizione degli immobili in `map.service.ts`) e id degli immobili; complessi senza posizione propria e senza immobili posizionati esclusi. I punti immobile restituiscono `complex_id`.

## Frontend

### Scheda complesso

Shell `core/components/entity-sheet/`, aperta solo con `EntityNavigatorService.openComplex(id)` / `createComplex(prefill)`.

| Tab | Contenuto |
|---|---|
| Riepilogo | nome, tipo, Id compendio MEF; "Indirizzo e posizione" con mappa piccola (clic per fissare il punto), come la scheda immobile; anteprime con conteggi |
| Immobili | `app-linked-table`: collega (select con ricerca), "Nuovo immobile" (crea con `complex_id` precompilato), scollega con conferma (`itemLabel`), apertura scheda immobile |
| Utenze | sola lettura, colonna Immobile, apertura scheda utenza |
| Impianti | sola lettura, colonna Immobile, apertura scheda impianto |
| Contratti immobiliari | sola lettura, stato mostrato, apertura scheda contratto |
| Note, Foto, Storico | come la scheda immobile |

Badge intestazione: tipo, numero immobili. Tab nuovi con `aria-label` = etichetta.

### Scheda immobile

Campo **"Complesso"** nel tab Riepilogo: `app-filterable-select` con `createLabel` "Nuovo complesso" → `EntityNavigatorService.createComplex`, ricarica opzioni e imposta il valore; pulsante per aprire la scheda del complesso.

### Elenchi

- **Complessi** (`pages/complexes/`, voce di menu "Complessi" accanto a "Immobili"): `app-list-toolbar`, `app-list-filters` con `complexes-filters.ts` (testo, tipo), colonne nome, tipo, indirizzo, immobili, utenze, contratti attivi; `?selectedId=` apre la scheda.
- **Immobili**: colonna "Complesso" e filtro "Complesso" (select).

### Mappa

- Livello **"Complessi"** accanto a Immobili/Utenze/Impianti, con conteggio.
- Pin complesso (icona `domain`, colori da token) sulla posizione propria o calcolata.
- Gli immobili di un complesso non hanno pin propri finché il complesso è chiuso. Il complesso si **espande** al clic sul pin o oltre lo zoom 17: compaiono i pin dei suoi immobili e sparisce il pin del complesso; tornando sotto lo zoom 17 si richiude (se espanso dallo zoom).
- Popup: nome, tipo, numero immobili, "Apri scheda", "Mostra immobili".
- I filtri di tipologia/funzione/stato degli immobili valgono anche dentro il complesso; un complesso con zero immobili visibili dopo i filtri non compare.
- Livelli Utenze e Impianti invariati.

## Guida operatori

`frontend/public/guida/guida.md`, nella stessa PR, data in testa aggiornata: sezione "Complessi" (cosa sono, scheda, collegare immobili, mappa); riga sul campo Complesso nella scheda immobile.

## Test

- Backend: spec del service complessi (conteggi, `asset_ids` con spostamento da altro complesso, divieto di eliminazione con immobili → 400); spec della mappa per la posizione calcolata; `photos` con `COMPLEX`.
- Migration: up → down → up sul DB locale, `schema:log` senza statement su `complexes`/`assets`.
- Frontend: `ng build` (con `check-guida`).
- E2E Playwright: crea complesso, collega 2 immobili, verifica tab Utenze; in mappa pin complesso, clic → immobili visibili.

## Rilascio

Minor con migration: bump `softwareVersion`/`releaseDate` in `publiccode.yml` nella PR.
