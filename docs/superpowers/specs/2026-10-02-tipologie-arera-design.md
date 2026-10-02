# Tipologie contrattuali ARERA (al posto delle finalità d'uso) — design

Data: 2026-10-02 · Roadmap patrimonio, voce 10

## Obiettivo

La **finalità d'uso** (`purpose`) sparisce. Al suo posto, sulla singola utenza, la **tipologia contrattuale ARERA**: un elenco fisso per tipo di utenza (luce, acqua, gas; nessuna per Internet), definito dalla normativa e non gestito da una pagina dell'app. Nello stesso giro la **disalimentabilità** passa da testo libero a sì / no / non noto.

Fuori scope: rimozione del tab Controparti della scheda utenza e pagatore calcolato (voce 12), aggregati utenze (voce 11).

## Contesto (DB locale, 2026-10-02)

- `purpose`: 22 righe, miste tra valori di prova ("ACME", "ACME100", "LoremIpsum", "LastChance") e descrizioni copiate dal campo Access "tipologia uso contatore". `use_type` GENERIC/SPECIFIC senza significato.
- `utility_type_purpose`: 8 righe, tutte di prova, che puntano a tipi utenza di prova (id 2, 4, 5, 23) poi ricreati con id nuovi (33–36). Nessuna FK: le righe sono orfane. Nessuna utenza ha oggi una finalità, quindi non c'è nulla da migrare.
- La finalità compare solo come elenco in sola lettura nel tab Controparti della scheda utenza (dal tipo utenza) e nel dialog del tipo utenza.
- Access (`UTENZE.accdb`, tabella `utenze`, campo "tipologia uso contatore"): valore presente per 239 utenze su 634, tutte abbinabili per `utility_id` (contatore o codice cliente coerenti). L'importatore Access (rimosso in #176) non lo leggeva. Distribuzione: luce "altri usi" 115, "illuminazione pubblica" 77, "casetta erogazione acqua" / "a servizio del pozzo" 5; acqua "domestico residenziale" 5, descrizioni del servizio ("fornitura normale - acqua fogna e depurazione"…) 9; gas descrizioni d'uso ("riscaldamento - cottura e acqua calda"…) 28.
- `utilities.disconnection_ability` (testo): 51 valorizzate su 664. "disalimentabile per E-DISTRIBUZIONE" 38, "NON disalimentabile per E-DISTRIBUZIONE" 6, "non disalimentabile" 1, "USO PUBBLICO DISALIM AFD" 1, stringa vuota 5.
- Residui nel frontend: nella scheda utenza l'etichetta "Tipo Uso Contatore" sta sul select del tipo utenza; nel dialog filtri c'è un campo testo "Tipo uso contatore" (`meter_usage_type`) che il backend non legge.

## Tipologie

Fonti: TIT (energia elettrica, tipologie di cui all'art. 2.2 più la BTVE per la ricarica dei veicoli elettrici in luoghi accessibili al pubblico), TICSI (delibera 665/2017, servizio idrico), TIVG art. 2.3 (gas).

| `hard_type` | Codice | Etichetta |
|---|---|---|
| LIGHT | `EL_BT_DOMESTIC` | BT usi domestici |
| | `EL_BT_PUBLIC_LIGHTING` | BT illuminazione pubblica |
| | `EL_BT_OTHER` | BT altri usi |
| | `EL_BT_EV_CHARGING` | BT ricarica veicoli elettrici in luoghi pubblici (BTVE) |
| | `EL_MT_PUBLIC_LIGHTING` | MT illuminazione pubblica |
| | `EL_MT_OTHER` | MT altri usi |
| WATER | `WATER_DOMESTIC_RESIDENT` | Domestico residente |
| | `WATER_DOMESTIC_NON_RESIDENT` | Domestico non residente |
| | `WATER_DOMESTIC_CONDOMINIUM` | Domestico condominiale |
| | `WATER_INDUSTRIAL` | Industriale |
| | `WATER_COMMERCIAL` | Artigianale e commerciale |
| | `WATER_AGRICULTURAL` | Agricolo e zootecnico |
| | `WATER_PUBLIC_NON_DISCONNECTABLE` | Pubblico non disalimentabile |
| | `WATER_PUBLIC_DISCONNECTABLE` | Pubblico disalimentabile |
| | `WATER_OTHER` | Altri usi |
| GAS | `GAS_DOMESTIC` | Domestico |
| | `GAS_CONDOMINIUM_DOMESTIC` | Condominio uso domestico |
| | `GAS_PUBLIC_SERVICE` | Attività di servizio pubblico |
| | `GAS_OTHER` | Usi diversi |
| INTERNET | — | (campo nascosto) |

Il prefisso del codice coincide con il tipo: `EL_` ↔ LIGHT, `WATER_` ↔ WATER, `GAS_` ↔ GAS.

## Modello dati

### `utilities`

- **nuova** `arera_category` — enum dei 19 codici, nullable. Nessun default: vuota = non ancora classificata.
- **nuova** `disconnectable` — boolean nullable (`null` = non noto).
- **rimossa** `disconnection_ability`.

Scelta scartata: tabella di lookup `arera_categories` con FK. Ricrea ciò che si toglie (anagrafica + pagina) per un elenco che cambia solo con la normativa.

### Rimozioni

- tabelle `purpose` e `utility_type_purpose`;
- entity `Purpose`, `UtilityTypePurpose`, relazione `utilityTypePurposes` in `UtilityType`, campi finalità nei DTO del tipo utenza.

## Backend

- `apis/utility/arera-category.ts` (nuovo): enum `AreraCategory`, mappa `ARERA_CATEGORIES_BY_HARD_TYPE: Record<HardTypeEnum, AreraCategory[]>` e helper `isAreraCategoryAllowed(hardType, category)`. Unico punto della regola codice ↔ tipo.
- `Utility` entity: colonne `arera_category` e `disconnectable` al posto di `disconnection_ability`.
- DTO create/update: `arera_category` opzionale `@IsEnum(AreraCategory)` nullable; `disconnectable` opzionale boolean nullable.
- `UtilityService.create/update`: dopo aver risolto il tipo utenza (quello del DTO o l'attuale), se `arera_category` non è ammessa per il suo `hard_type` → `BadRequestException('Tipologia ARERA non valida per il tipo di utenza.')` (400, mai 409). Se cambia il tipo e il valore salvato non è più ammesso senza che il DTO ne porti uno nuovo → stesso errore (il frontend svuota il campo prima del salvataggio, quindi in UI non capita).
- `SearchUtilityDto`: `arera_category` (codice oppure `NONE` = non assegnata, `IS NULL`) e `disconnectable` (`true` / `false` / `unknown`), al posto di `disconnection_ability` testo.
- `UtilityService`: rimossi i join `utilityTypePurposes`/`purpose` e la mappatura `purposes` nella risposta.
- `UtilityTypesService` + DTO: rimossa la gestione delle finalità.
- Modulo `apis/purpose/` eliminato e tolto da `app.module.ts`.
- `AnomaliesService`: nuova anomalia `utilitiesWithoutAreraCategory` — utenze non eliminate, `supply_active = 1`, tipo con `hard_type <> 'INTERNET'`, `arera_category IS NULL`. Campi come le altre anomalie di utenze (id, codice POD/PDR, tipo).

## Migration

Una sola migration (es. `…-AreraCategories.ts`), scritta fuori da `src/database/migrations/` e spostata lì solo a contenuto definitivo (il watcher la eseguirebbe a metà).

`up()`:

1. **Controllo preliminare, prima di ogni DDL**: `SELECT DISTINCT TRIM(disconnection_ability)` sulle righe non vuote; se un valore non è nella tabella di conversione → errore con l'elenco dei valori sconosciuti (le DDL MySQL fanno commit implicito: fermarsi a metà lascerebbe lo schema da sistemare a mano).
2. `ADD COLUMN arera_category ENUM(...) NULL`, `ADD COLUMN disconnectable TINYINT(1) NULL`.
3. Conversione (confronto case-insensitive su testo ripulito):

   | Testo | `disconnectable` | Nota aggiunta a `notes` |
   |---|---|---|
   | "disalimentabile per E-DISTRIBUZIONE" | 1 | "Disalimentabilità: disalimentabile per E-DISTRIBUZIONE" |
   | "NON disalimentabile per E-DISTRIBUZIONE" | 0 | "Disalimentabilità: NON disalimentabile per E-DISTRIBUZIONE" |
   | "non disalimentabile" | 0 | — |
   | "USO PUBBLICO DISALIM AFD" | 1 | "Disalimentabilità: USO PUBBLICO DISALIM AFD" |
   | vuoto / NULL | NULL | — |

   La nota si accoda alle note esistenti (nuova riga), solo quando il testo dice più del sì/no. Scrittura di sistema: `update_date` non deve cambiare (stesso accorgimento di `ConsumptionRecalcService`).
4. `DROP COLUMN disconnection_ability`, `DROP TABLE utility_type_purpose`, `DROP TABLE purpose`.

`down()`: ricrea `purpose` e `utility_type_purpose` (vuote, stessa struttura), `disconnection_ability` VARCHAR(255) valorizzata da `disconnectable` ("disalimentabile" / "non disalimentabile"), poi rimuove le due colonne nuove. Ritorno con perdita dichiarata nel file: finalità (dati di prova) e testo originale (resta nelle note).

## Frontend

- `core/helpers/arera-category.ts` (nuovo): stessi codici e mappa del backend, con etichette; funzioni `areraOptionsFor(hardType)` e `areraLabel(code)`.
- **Scheda utenza** (`utility-edit-dialog`):
  - Riepilogo: etichetta del select tipo utenza da "Tipo Uso Contatore" a **"Tipo utenza"**; nuovo select **"Tipologia ARERA"** (non obbligatorio) con le sole opzioni del tipo scelto, nascosto per Internet. In `onUtilityTypeChange`, se il valore corrente non è ammesso per il nuovo tipo → `null`.
  - Tecnici e stato: input "Disalimentabilità utenza" → select **Sì / No / Non noto** su `disconnectable`.
  - Controparti: tolto l'elenco finalità e il relativo conteggio in `counterpartCount()`; tolto l'import di `UseTypeDescription`.
- **Elenco utenze**:
  - dialog filtri: campo morto `meter_usage_type` → select **"Tipologia ARERA"** (opzioni del tipo filtrato, oppure tutte raggruppate per tipo, più "Non assegnata" = `NONE`); filtro Disalimentabilità → select Sì / No / Non noto. Aggiornati `search-utilities.component.ts`, `utility.service.ts` (parametri), chip dei filtri attivi.
  - colonna "Disalimentabilità": Sì / No / vuoto.
- **Dashboard** (`anomalies-card`): voce "Utenze attive senza tipologia ARERA", righe che aprono la scheda utenza come le altre anomalie di utenze.
- **Rimozioni**: `pages/purpose/` intera, rotta in `app.routes.ts`, voce in `sidebar.component.ts`, campo finalità e tipi relativi in `pages/utility-types/` (entity, interface, dialog, elenco), `purposes` in `UtilityType` frontend.
- Entity/interface utenza frontend: `arera_category`, `disconnectable` al posto di `disconnection_ability`.

## Valorizzazione dei dati (dopo il merge, solo DB locale)

Non è codice del repo: interventi one-off sul DB locale, una lista alla volta con conferma dell'utente; la produzione si allinea con export/import del DB.

1. **Da Access** (239 utenze, abbinate per `utility_id`):
   - luce "altri usi" / "casetta erogazione acqua" / "a servizio del pozzo" → `EL_BT_OTHER`, `EL_MT_OTHER` se la tensione indica media tensione;
   - luce "illuminazione pubblica" → `EL_BT_PUBLIC_LIGHTING` / `EL_MT_PUBLIC_LIGHTING`;
   - acqua "domestico residenziale" → `WATER_DOMESTIC_RESIDENT`; descrizioni del servizio → proposta caso per caso;
   - gas: descrizioni d'uso → proposta per immobile (alloggi → domestico, scuole e uffici → servizio pubblico).
2. **Proposte per gruppi** sulle restanti: utenze di impianti di illuminazione pubblica (semafori da confermare) → IP; colonnine di ricarica → BTVE; tensione in kV → MT; acqua non disalimentabile → pubblico non disalimentabile; fontane e casette → pubblico; tipologia scritta nelle bollette ACA già estratte (es. "PUBBLICODISALIM").
3. Il resto resta vuoto e compare nell'anomalia.

## Test

- Backend (jest, `--maxWorkers=2`):
  - `arera-category.spec.ts`: ogni codice ammesso solo per il suo tipo, Internet senza codici;
  - `utility.service.spec.ts`: 400 su codice incompatibile in create e update, 400 su cambio tipo con valore non più ammesso, filtri `arera_category` (codice e `NONE`) e `disconnectable` (`true`/`false`/`unknown`); rimozione dei casi su `purposes`;
  - `anomalies.service.spec.ts`: nuova query;
  - `utility-types.service.spec.ts`: rimozione dei casi finalità; `purpose.service.spec.ts` eliminato;
  - spec della migration con `QueryRunner` simulato, **fuori** da `src/database/migrations/`: conversione dei 5 casi, stop sul valore sconosciuto prima di qualunque DDL;
  - ciclo reale up → down → up sul DB locale confrontando i dati (non solo i conteggi).
- Frontend: `ng build`; E2E Playwright (utente temporaneo, poi eliminato): select filtrato per tipo e svuotato al cambio tipo, salvataggio, filtri Tipologia ARERA e Disalimentabilità, anomalia in dashboard, pagina Finalità d'uso non più raggiungibile.

## Rilascio e documentazione

- v1.9.0 (minor): bump di `softwareVersion`/`releaseDate` in `publiccode.yml` nella PR.
- CLAUDE.md: sostituire la nota "Disalimentabilità utenza: campo testo libero… non aggiungere flag nuovi" con il nuovo campo `disconnectable`; togliere `purpose` dall'elenco moduli.
- Roadmap: voce 10 fatta; avanzamento della valorizzazione.
