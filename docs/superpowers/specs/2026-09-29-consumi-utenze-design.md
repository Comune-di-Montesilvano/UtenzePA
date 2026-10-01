# Consumi utenze, utenze per capitolo, selezione capitolo — design

Data: 2026-09-29

## Obiettivo

1. **Storico consumi per utenza**: inserimento di rilevazioni (lettura contatore a una data, oppure consumo di un periodo), calcolo automatico del consumo effettivo degli ultimi 12 mesi e della stima annua (stagionale), con regola di validità della stima inserita manualmente.
2. **Utenze associate nella vista capitolo di spesa**: tabella con tutti i dati utenza, apertura dettaglio, totali presunto/effettivo 12 mesi.
3. **Selezione capitolo nel dialog utenza** leggibile: oggi mostra solo la descrizione (codice assente), inutile per scegliere.

Solo inserimento manuale e rappresentazione. Import futuro da fatture/tracciati/API **fuori scope**, ma il modello dati lo prevede (campo `source`).

## Vincoli decisi

- Rilevazione di due tipi, a scelta per riga: **lettura contatore** (valore cumulativo) o **consumo periodo** (inizio/fine/quantità).
- Stima **stagionale con fallback su media giornaliera**.
- Contatore tracciato per matricola: cambio matricola tra letture = nuovo contatore, nessun consumo calcolato tra le due.
- Matricola univoca tra utenze (check applicativo).
- Valori calcolati **persistiti** su `utilities`, ricalcolati su evento (CRUD rilevazione) e da **cron notturno**.
- Totali capitolo **raggruppati per unità di misura**, mai somme miste (capitolo `SPRAR_UTILITIES` può contenere luce+gas+acqua).
- Utenze `INTERNET` escluse dai consumi.
- Unità derivata da `utility_types.hard_type`: `LIGHT` → kWh, `GAS` → Smc, `WATER` → m³.

## Schema DB

### Nuova tabella `utility_consumptions`

| colonna | tipo | note |
|---|---|---|
| `id` | int PK autoincrement | |
| `utility_id_fk` | int, FK `utilities.id`, indice | |
| `kind` | enum(`READING`,`PERIOD`) | |
| `reading_date` | date, nullable | obbligatorio se `READING` |
| `reading_value` | decimal(14,3), nullable | obbligatorio se `READING`, valore cumulativo contatore |
| `meter_number` | varchar(255), nullable | obbligatorio se `READING`; precompilato in UI con matricola attuale utenza |
| `period_start` | date, nullable | obbligatorio se `PERIOD` |
| `period_end` | date, nullable | obbligatorio se `PERIOD`, `>= period_start` (estremi inclusi) |
| `consumption` | decimal(14,3), nullable | obbligatorio se `PERIOD`, `>= 0` |
| `source` | enum(`MANUAL`,`INVOICE`,`IMPORT`,`API`), default `MANUAL` | oggi solo `MANUAL` |
| `notes` | text, nullable | |
| audit | `create_date`, `update_date`, `created_by_user_id`, `updated_by_user_id`, `deleted` | pattern esistente |

Indice `(utility_id_fk, deleted)`.

### Nuove colonne su `utilities`

| colonna | tipo | note |
|---|---|---|
| `estimated_consumption_source` | enum(`MANUAL`,`HISTORY`,`NONE`), default `NONE` | |
| `estimated_consumption_set_at` | datetime, nullable | data inserimento manuale; scadenza = +12 mesi |
| `actual_consumption_coverage_days` | int, default 0 | giorni degli ultimi 365 coperti da dati reali |

Semantica campi esistenti:
- `actual_consumption` → consumo effettivo misurato ultimi 12 mesi. **Sola lettura**, calcolato. Rimosso dai DTO create/update.
- `estimated_annual_consumption` → stima annua (manuale o da storico).
- `reported_consumption_year` (comunicato CONSIP) → invariato, manuale.

Migration dati: utenze con `estimated_annual_consumption > 0` → `estimated_consumption_source = 'MANUAL'`, `estimated_consumption_set_at = update_date` (valore importato storicamente, trattato come manuale: scade 12 mesi dopo l'ultima modifica). Le altre → `NONE`.

Migration scritta a mano con solo gli statement della feature (vedi CLAUDE.md: drift preesistente in `migration:generate`), preparata fuori da `src/database/migrations/` e spostata a contenuto definitivo.

## Algoritmo (`ConsumptionCalculator`, funzioni pure)

Nessun accesso DB: input = rilevazioni non cancellate + data di riferimento `today`; output = valori calcolati. Tutte le date trattate come giorni di calendario (niente orari/timezone).

### 1. Consumo giornaliero

Costruisce una mappa `giorno → consumo` (sparsa):

- **Letture**: ordinate per `reading_date`. Per ogni coppia consecutiva `(a, b)` con **stessa matricola** (trim, case-insensitive): consumo `b.value − a.value` distribuito uniformemente sui giorni `(a.date, b.date]`. Matricola diversa → nessun intervallo (nuovo contatore). Due letture stessa data e matricola → errore validazione a monte.
- **Periodi**: `consumption / giorni` su ogni giorno `[period_start, period_end]`.
- **Precedenza**: un giorno coperto da un `PERIOD` usa il valore del periodo; il valore da letture per quel giorno viene scartato (le fatture future saranno più affidabili delle letture). La quota scartata non viene redistribuita.

### 2. Effettivo 12 mesi

Finestra `W = (today − 365, today]`.
- `actual_consumption` = somma consumi giornalieri in `W`.
- `actual_consumption_coverage_days` = giorni di `W` coperti.

### 3. Stima stagionale annua

Per ogni giorno `d` in `(today, today + 365]`:
- se il giorno `d − 365` è coperto → usa quel valore;
- altrimenti → media giornaliera di riferimento.

Media di riferimento = media sui giorni coperti in `W`; se `W` non ha giorni coperti → media su tutto lo storico coperto.

Stima = somma. Nessun giorno coperto in assoluto → nessuna stima da storico disponibile.

### 4. Serie mensile (per grafico)

24 mesi di calendario passati (incluso corrente fino a `today`): somma reale per mese + giorni coperti per mese. 12 mesi futuri: somma stima giornaliera del punto 3 per mese.

### 5. Regola stima persistita (`ConsumptionRecalcService.recalcUtility`)

1. Calcola effettivo + copertura → sempre scritti.
2. Se `source = MANUAL` e `set_at > today − 12 mesi` → stima non toccata.
3. Altrimenti, se esiste stima da storico → `estimated_annual_consumption = stima`, `source = HISTORY`, `set_at = null`.
4. Altrimenti (nessuno storico): se manuale scaduta → valore lasciato com'è, `source` resta `MANUAL` (mostrato come "manuale scaduta" in UI); se `NONE` → invariato.

Scrittura via `repository.update` diretto, **non** `BaseService.update`: il ricalcolo automatico non deve generare righe di audit log.

### Modifica manuale della stima (dialog utenza)

`UtilitiesService.update`: se `estimated_annual_consumption` cambia rispetto al valore persistito:
- valore `> 0` → `source = MANUAL`, `set_at = now`;
- valore `= 0` → `source = NONE`, `set_at = null`, poi `recalcUtility` (torna a storico se disponibile).

Stesso comportamento su create con valore `> 0`.

## Validazione rilevazioni

- Campi obbligatori per `kind` (`@ValidateIf` in class-validator), campi dell'altro tipo ignorati/azzerati.
- Date non future.
- `READING`: lettura con stessa matricola e data già presente → 400. Valore minore della lettura precedente (per data) **con stessa matricola** → 400. Valore maggiore della lettura successiva con stessa matricola → 400.
- `READING`: matricola già associata ad **altra** utenza non cancellata (confronto trim, case-insensitive su `utilities.meter_number`) → 400 con codice utenza in conflitto.
- `PERIOD`: sovrapposto a un altro `PERIOD` della stessa utenza → 400.
- Utenza `INTERNET` → 400.
- Dopo salvataggio: se la lettura è la più recente dell'utenza e la matricola differisce da `utilities.meter_number` → aggiorna `utilities.meter_number` (matricola attuale = ultimo contatore letto).

## Univocità matricola utenza

Check applicativo (non indice DB: soft delete + duplicati già presenti in DB) in `UtilitiesService.create/update`, **solo se la matricola cambia** (o nuova, non vuota): matricola già usata da altra utenza non cancellata → 400 con codice utenza in conflitto. Duplicati esistenti restano finché corretti a mano; bloccano solo il cambio matricola su quelle utenze.

## Backend

Nuovo modulo `apis/utility-consumptions/`:
- `UtilityConsumption` entity, DTO create/update, `UtilityConsumptionsService extends BaseService` (audit log incluso).
- `consumption-calculator.ts`: funzioni pure punti 1–4.
- `ConsumptionRecalcService`: `recalcUtility(id)`, `recalcAll()`.
- Endpoint:
  - `GET /utilities/:id/consumptions` — lista rilevazioni, con consumo calcolato per riga (letture: delta dalla precedente stessa matricola, `null` se nuovo contatore/prima lettura).
  - `POST /utilities/:id/consumptions` — Admin/Operatore.
  - `PATCH /utility-consumptions/:id`, `DELETE /utility-consumptions/:id` (soft) — Admin/Operatore.
  - `GET /utilities/:id/consumption-summary` — `{ unit, actual_consumption, coverage_days, estimated_annual_consumption, estimated_source, estimated_valid_until, monthly: [{ month: 'YYYY-MM', actual, covered_days, estimated }] }`.
- Ogni CRUD rilevazione → `recalcUtility` a fine operazione.
- Cron notturno `consumption-recalc` (03:00), registrato via `SchedulerRegistry.addCronJob()` in `onModuleInit` del `.module.ts` (pattern `backup.module.ts`, `@nestjs/schedule` ESM-only). Errore su una utenza → log + continua con le altre.

Capitoli:
- `GET /budget-chapters/:id/consumption-summary` → `[{ hard_type, unit, utilities_count, estimated_sum, actual_sum }]`, una riga per unità, utenze non cancellate, `INTERNET` escluse. `SUM` SQL sui campi persistiti.
- Lista utenze del capitolo: endpoint ricerca utenze esistente con filtro `budget_chapter_code_fk` (già supportato in `search-utility.dto.ts`) → stessi join di `findAll`, dialog dettaglio funziona come dalla pagina utenze.

## Frontend

### Dialog capitolo (`budget-chapter-edit-dialog`)

- Tab "Dati" (form attuale) | "Utenze associate" (disabilitata se nuovo).
- In testa: riga totali per unità, es. *Energia elettrica · 12 utenze · Presunto 12.000 kWh · Effettivo 12 mesi 11.450 kWh*.
- Tabella utenze con colonne della tabella utenze standard (identificativo, codice, tipo, matricola, indirizzo, immobili, attiva, presunto, effettivo 12m, …), ordinabile. Click riga → `UtilityEditDialog` sopra; alla chiusura con salvataggio → ricarica lista e totali.
- Dialog più largo (`width` + `maxWidth` espliciti, vedi CLAUDE.md sul clamp 560px).

### Dialog utenza (`utility-edit-dialog`)

- Nuova tab "Consumi" (disabilitata se nuova o `INTERNET`):
  - **Card riepilogo**: effettivo 12 mesi + "dati su N/365 giorni"; stima annua + badge *Manuale — valida fino al gg/mm/aaaa* / *Manuale — scaduta* / *Da storico* / *Nessun dato*.
  - **Grafico barre mensili** (SVG inline, componente standalone dedicato, nessuna nuova dipendenza): 24 mesi reali (barra piena, opacità ridotta se mese coperto parzialmente) + 12 mesi stimati (barra tratteggiata). Tooltip valore + unità.
  - **Tabella rilevazioni**: data o periodo, tipo, matricola, valore lettura, consumo calcolato, origine, note; azioni modifica/elimina (Admin/Operatore).
  - **Dialog rilevazione**: toggle Lettura/Periodo, campi condizionali, matricola precompilata con quella attuale. Errori 400 backend mostrati inline.
- Tab "Dati": campo "Consumo effettivo" → sola lettura (con hint "ultimi 12 mesi, da storico consumi"); sotto "Consumo annuo presunto" hint con origine/scadenza.
- **Selezione capitolo**: `mat-select` → `FilterableSelectComponent` (esteso se serve supporto a riga secondaria nell'opzione, contenuto custom in `<span>` interno, mai stile su host `<mat-option>`):
  - opzione: **`14091/0 — SPESE PER ENERGIA ELETTRICA CASETTE ACQUA`** + riga piccola `PDC 1.03.02.05.004 · Energia elettrica`;
  - ricerca su codice, articolo, descrizione, PDC;
  - capitoli compatibili col tipo utenza in cima (`LIGHT`↔`ELECTRICITY`, `GAS`↔`GAS_SUPPLY_ONLY`/`THERMAL_MANAGEMENT`, `WATER`↔`WATER`, `SPRAR_UTILITIES` sempre compatibile), gli altri sotto, comunque selezionabili;
  - campo chiuso mostra `codice/articolo — descrizione`, larghezza piena.

## Test

- **Unit `consumption-calculator`** (grosso del valore): letture semplici; letture a cavallo della finestra (pro-rata); cambio matricola; periodo sovrapposto a intervallo letture (precedenza); stagionale con anno precedente coperto; stagionale parziale (fallback media sui giorni scoperti); solo storico vecchio (> 12 mesi); nessun dato; serie mensile.
- **Unit `ConsumptionRecalcService`**: manuale valida non toccata; manuale scaduta con storico → `HISTORY`; manuale scaduta senza storico → invariata; `NONE` → `HISTORY`.
- **Unit service rilevazioni**: validazioni (lettura decrescente stessa matricola, matricola altrui, periodi sovrapposti, INTERNET), aggiornamento matricola utenza.
- **Unit `UtilitiesService`**: stima manuale → `MANUAL`+`set_at`; stima 0 → ricalcolo; univocità matricola.
- Frontend: `ng build` reale (type-check template).
- **E2E browser** con dati reali: inserimento letture/periodi, riepilogo e grafico, vista capitolo con totali, apertura dettaglio, selezione capitolo.

## Fuori scope

- Import consumi da fatture/tracciati/API.
- Correzione dei duplicati di matricola esistenti (manuale, dopo).
- Popup di ricerca capitolo con tabella (valutare oltre ~200 capitoli).
- Costi/ripartizioni economiche basate sui consumi.
