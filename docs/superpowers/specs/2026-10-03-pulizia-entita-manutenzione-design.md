# Pulizia entità e manutenzione a carico (roadmap voce 18, parte 1)

Data: 2026-10-03. Release prevista: v1.9.0 (minor: due colonne nuove e un'informazione calcolata nuova).

## Obiettivo

Dall'analisi delle entità (roadmap voce 18) restano tabelle morte o duplicate e una lista libera ereditata da Access, i "gestori manutenzione", che mescola il Comune, il fornitore del servizio luce e alcuni soggetti terzi. Questo blocco:

- elimina le tabelle morte (`fk_test`, `aca_keys`) e mette in sicurezza `invoice_budget_chapter`;
- sostituisce gli aggregati immobili con la funzione dell'immobile, che li duplica già;
- sostituisce i gestori manutenzione con un dato **calcolato** "Manutenzione a carico di", da due spunte sui contratti.

Fuori da questo blocco (restano nella voce 18): campi doppi dell'utenza (indirizzo, coordinate, tre note, deposito cauzionale, `utility_code`), catasto in due posti, `associated_building`, ordini Consip, `utility_types`, `budget_chapters.supply_type`. I contratti di manutenzione con ditte esterne (ascensori, termico, antincendio) restano nella voce 7, agganciati agli impianti.

## A. Tabelle morte

- `fk_test`: tabella vuota senza entity. Drop.
- `aca_keys`: 0 righe, nessuna UI, conterrebbe credenziali del portale ACA in chiaro. Drop di entity e tabella.
- `invoice_budget_chapter`: le 20 righe attuali puntano a fatture inesistenti (id 1–2, le fatture partono da 741) perché manca la FK. Le righe orfane si cancellano una tantum sul DB locale; la migration aggiunge la FK `invoice_id` → `invoices.id` (`ON DELETE CASCADE`), con controllo preliminare: se trova righe orfane si ferma con errore leggibile invece di fallire a metà.

## B. Aggregati immobili → funzione

Oggi `assets.asset_type_id` → `asset_aggregators` (35 righe) duplica `assets.function_id` → `asset_functions`, che ha già le icone. 183 immobili su 190 hanno la funzione; i 7 senza vengono elencati all'utente e assegnati una tantum sul DB locale (dove c'è dubbio resta vuota).

Modifiche:

- mappa: il marker immobile usa solo l'icona della funzione (oggi funzione con fallback sull'aggregato); il filtro "Aggregati" della mappa diventa "Funzione" (`functionIds`, conteggio per funzione come oggi per aggregato);
- elenco e filtri immobili, scheda immobile: tolti campo, colonna e filtro aggregato (la funzione c'è già);
- `AssetAggregatorIconOptions`, `ASSET_AGGREGATOR_ICON_FALLBACK`, `IconPickerDialogComponent` e il template di ricerca, oggi nella cartella `asset-aggregator` e usati anche da funzioni e nature, si spostano in una posizione condivisa (`core/`) con nomi neutri (`ICON_OPTIONS`, `ICON_FALLBACK`);
- rimossi modulo backend `asset-aggregators`, entity, relazione e colonna su `Asset`, pagina, route e voce della sidebar;
- migration `DropAssetAggregators`: drop FK, colonna `assets.asset_type_id`, tabella; `down()` ricrea tabella vuota e colonna nullable con FK.

## C. Manutenzione a carico di

### Dato salvato

- `contracts.maintenance_included` boolean, default false: "Manutenzione inclusa" sul contratto di fornitura (es. convenzione Consip Luce: energia e manutenzione nello stesso contratto). Da attivare sul contratto del servizio luce (contratto 10) sul DB locale.
- `utilizer_grant.maintenance_by_counterparty` boolean, default false: "Manutenzione a carico della controparte" sul contratto immobiliare. Vale in entrambe le direzioni: nei contratti attivi è il conduttore/concessionario, nei passivi il locatore.

### Stato calcolato

Contratto di fornitura **aperto**: collegato all'utenza, `deleted = 0`, `closed = 0`. Contratto immobiliare **attivo**: come per "A carico di" (`deleted = 0`, `status = 'ACTIVE'`, su un immobile non cancellato dell'utenza, con almeno una parte non cancellata) ma senza il vincolo `direction = 'ACTIVE'`: conta in entrambe le direzioni.

| Condizione (in ordine) | Stato | Mostra |
|---|---|---|
| almeno un contratto di fornitura aperto con `maintenance_included` | `SUPPLIER` (Fornitore) | fornitore/i dei contratti, link al contratto |
| almeno un contratto immobiliare attivo con `maintenance_by_counterparty` | `COUNTERPARTY` (Controparte) | parti dei contratti, link al contratto |
| altrimenti | `COMUNE` | — |

Se valgono entrambe prevale Fornitore. Gli impianti non contano (la manutenzione degli impianti con ditte esterne è la voce 7).

### Codice

- `apis/utility/maintenance-status.ts`, stesso schema di `cost-status.ts`: enum `MaintenanceStatus`; funzione pura `maintenanceInfo(utility)` sui dati già caricati (`contratti` con `supplier`, `assets.utilizerGrants.parties`) → `{status, contracts: [{id, name}], grants: [{grant_id, third_party_id, name}]}`; gemella SQL `maintenanceStatusSql(status, alias)` per il filtro.
- `UtilitiesService`: `maintenance_info` su ogni utenza restituita; `findAll`/`findOne`/`findBySafeguard` caricano `contratti.supplier` se non già caricato; filtro `maintenance_status`; tolti `maintenance_management_id_fk`, relazione e join.
- DTO contratto di fornitura e contratto immobiliare: i due flag (`IsBoolean`, facoltativi).
- Rimossi: modulo `maintenance-managers`, entity `shared/entities/maintenanceManagers.entity.ts`, `maintenance_management_id_fk` (entity, DTO, service), registrazione in `app.module.ts`.

Frontend:

- scheda utenza: tolta la select "Gestore manutenzione"; nel Riepilogo riquadro "Manutenzione" con badge (Comune / Fornitore / Controparte) e link ai contratti, accanto a "A carico di";
- elenco utenze: colonna "Manutenzione" al posto del gestore; filtro "Manutenzione" con i tre stati al posto del filtro gestore;
- scheda contratto di fornitura: spunta "Manutenzione inclusa"; scheda contratto immobiliare: spunta "Manutenzione a carico della controparte";
- rimossi pagina `pages/maintenance-managers/`, route, voce della sidebar; badge da `maintenanceStatus()` in `entity-status.ts`, accanto a `costStatus()`.

### Migration (in quest'ordine)

- `DropDeadTables`: drop `fk_test` e `aca_keys`; `down()` ricrea le tabelle vuote.
- `InvoiceBudgetChapterFk`: controllo righe orfane, poi FK (sezione A); `down()` toglie la FK.
- `AddMaintenanceFlags` (additiva): le due colonne boolean.
- `DropMaintenanceManagers`: drop FK, colonna `utilities.maintenance_management_id_fk`, tabella `maintenance_managers`; `down()` ricrea tabella vuota e colonna nullable con FK.
- `DropAssetAggregators` (sezione B).

## Dati (DB locale, one-shot, SQL nello scratchpad, mai nel repo)

Prima delle migration di drop, una lista alla volta con conferma dell'utente:

1. 7 immobili con solo l'aggregato: funzione proposta per ciascuno, vuota dove c'è dubbio;
2. utenze con gestore diverso da "comune": in coda alle note `Ex gestore manutenzione Access: <valore>`;
3. `contracts.maintenance_included = 1` sul contratto del servizio luce (Engie, convenzione Luce 3): copre le 125 utenze "conversion e lighting";
4. cancellazione delle 20 righe orfane di `invoice_budget_chapter`.

Il bike sharing (7 utenze attive, progetto probabilmente chiuso) resta Comune con la nota; se si caricherà la concessione, si metterà la spunta sul contratto immobiliare.

## Test

- `maintenanceInfo`: nessun contratto → Comune; fornitura aperta con flag → Fornitore con nome; fornitura chiusa o cancellata con flag → non conta; contratto immobiliare attivo con flag (attivo e passivo) → Controparte con parti; contratto immobiliare non attivo o cancellato, immobile cancellato, parti cancellate → non conta; entrambi → Fornitore; flag `1`/`0` da MySQL; stesso contratto su due immobili → una volta.
- `maintenanceStatusSql`: per ogni stato, condizioni `EXISTS`/`NOT EXISTS` attese.
- Map service: icona dalla funzione, filtro `functionIds`.
- Migration: ciclo reale up → down → up sul DB locale; `InvoiceBudgetChapterFk` che si ferma con righe orfane presenti.
- E2E: scheda utenza del servizio luce → Manutenzione "Fornitore"; spunta sul contratto immobiliare → utenza collegata diventa "Controparte"; filtro elenco utenze; mappa con filtro funzione e icone; salvataggio di immobile e utenza dopo la rimozione dei campi.

## Documentazione

- `CLAUDE.md`: togliere `asset-aggregators` e `maintenance-managers` dall'elenco moduli; nota "Manutenzione a carico di" accanto ad "A carico di"; aggiornare la nota su `AssetAggregator.code`/`description` (non esiste più).
- Roadmap: voce 18 parte 1 fatta (v1.9.0) con l'esito dati; voce 7 aggiornata (resta per le ditte esterne sugli impianti).
