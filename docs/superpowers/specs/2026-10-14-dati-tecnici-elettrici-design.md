# Dati tecnici delle utenze elettriche, rinnovo dei contratti di fornitura, stima da storico — design

Data: 2026-10-14

## Obiettivo

Il fatturato del fornitore di energia elettrica (tracciato CH80, gen 2025 – set 2026, 181 POD) contiene dati tecnici che oggi non hanno un posto in UtenzePA. Già caricati sul DB locale: consumi mensili, tipologia ARERA, date di attivazione e cessazione, tensione uniformata. Questa release aggiunge:

1. **codice impianto del fornitore** sull'utenza elettrica (uno per POD, stabile tra i rinnovi annuali);
2. **consumi per fascia** F0 (monoraria), F1, F2, F3 sui consumi di periodo elettrici;
3. **penale per energia reattiva** sul consumo di periodo e segnalazione «Penali per energia reattiva» (31 POD la pagano quasi ogni mese: impianti da rifasare);
4. ~~stima annua da storico che prevale sulla manuale~~ — ritirata il 2026-10-14: la stima manuale resta valida 12 mesi; le stime importate il 03/09/2026 sono state retrodatate al 30/09/2025 (intervento sui dati, non sul codice);
5. **contratti di fornitura nella scheda utenza** ordinati (in corso in alto, poi dal più recente);
6. **nuovo contratto con le utenze di uno esistente**, chiudendo il precedente.

Fuori scope: parte contabile del CH80 (importi, fatture), potenza contrattuale distinta dalla disponibile, numero di fornitura e codice contratto del fornitore (cambiano a ogni rinnovo).

## Decisioni (brainstorming 2026-10-14)

| Tema | Decisione |
|---|---|
| Penale reattiva | sì/no sul consumo di periodo; segnalazione se almeno un periodo con penale termina negli ultimi 12 mesi; nessun importo |
| Fasce | facoltative; se almeno una è compilata (le vuote valgono 0) la somma deve coincidere col consumo entro 1 kWh, altrimenti errore |
| Stima manuale | regola invariata (12 mesi); la soglia dei 300 giorni è stata ritirata in favore di un intervento sui dati |
| Ordine contratti | in corso in alto; poi per decorrenza decrescente, senza decorrenza in fondo |
| Nuovo contratto dalle utenze | azione nella scheda contratto; casella «Chiudi il contratto precedente» spuntata di default: al salvataggio il precedente diventa chiuso e la sua scadenza, se assente o successiva, diventa il giorno prima della decorrenza del nuovo |

## Modello dati (una migration)

| Tabella | Colonna | Tipo | Note |
|---|---|---|---|
| `utilities` | `supplier_plant_code` | varchar(50) NULL | «Codice impianto fornitore»; solo utenze elettriche |
| `utility_consumptions` | `consumption_f0` | decimal(14,3) NULL | fascia F0 (monoraria) |
| `utility_consumptions` | `consumption_f1` | decimal(14,3) NULL | |
| `utility_consumptions` | `consumption_f2` | decimal(14,3) NULL | |
| `utility_consumptions` | `consumption_f3` | decimal(14,3) NULL | |
| `utility_consumptions` | `reactive_penalty` | boolean NULL | null = non noto |

Nessun dato da spostare: la migration aggiunge solo colonne nullable.

## Regole

### Utenza

- `supplier_plant_code` vale solo per le utenze elettriche (`HardTypeEnum.LIGHT`): la scheda lo svuota se il tipo diventa un altro, come già fa per la connettività. Filtro testo e colonna (facoltativa) nell'elenco utenze.

### Consumo di periodo

In `consumption-calculator.ts` (funzioni pure, testate):

- `normalizeByKind` azzera fasce e penale per le letture (`READING`);
- nuova `validateBands(candidate)`: se almeno una fascia è valorizzata, `|F0+F1+F2+F3 − consumo| ≤ 1`, altrimenti messaggio «La somma delle fasce (X kWh) non coincide con il consumo del periodo (Y kWh).» (numeri in formato italiano), restituito come 400 come gli altri errori di validazione dei consumi.

Nel service: fasce e penale azzerate anche quando l'utenza non è elettrica. DTO: fasce `@IsOptional() @IsNumber() @Min(0)`, penale `@IsOptional() @IsBoolean()`.

### Stima annua

Ritirata: nessuna modifica a `decideEstimate`. La stima manuale vale 12 mesi come prima; le stime manuali importate il 03/09/2026 sono retrodatate al 30/09/2025 sul DB, così al ricalcolo prevale lo storico.

### Anomalia «Penali per energia reattiva»

`utilities_with_reactive_penalty`, aggiunta in fondo a `getAnomalies()` (la spec usa mock posizionali): utenze non cancellate con almeno un consumo non cancellato `kind = PERIOD`, `reactive_penalty = 1` e `period_end` negli ultimi 365 giorni (data di oggi passata da Node con `todayIso()`, come `plants_fire_equipment_overdue`). Voce in `UTILITY_SIGNALS` (la card anomalie della dashboard resta invariata).

### Contratti di fornitura

- **Ordine nella scheda utenza** (tab e anteprima «Contratto di fornitura corrente»): funzione pura `sortSupplyContracts(contracts, today)` accanto a `supplyContractStatus` in `core/helpers/entity-status.ts`: prima gli «In corso», poi per `supply_start_date` decrescente, senza data in fondo, a parità per id decrescente.
- **Nuovo contratto con queste utenze**: azione nella scheda del contratto di fornitura (in modifica, utente con permessi di scrittura, contratto con almeno un'utenza). Apre `EntityNavigatorService.createSupplyContract(utilityIds, prefill)` con le utenze del contratto e precompilati fornitore, tipo di contratto, convenzione CONSIP e «manutenzione inclusa»; CIG, ordine, date e impegni vuoti. Il dialog in creazione mostra la casella «Chiudi il contratto precedente» (spuntata) solo quando arriva da questa azione.
- **Backend**: `CreateContractDto` accetta `replaces_contract_id?: number`. Se presente, nella stessa transazione della creazione: il contratto indicato (non cancellato, altrimenti 400) diventa `closed = true` e, se `supply_expiry_date` è nullo o ≥ `supply_start_date` del nuovo, `supply_expiry_date = supply_start_date − 1 giorno`; senza decorrenza del nuovo la scadenza del precedente non cambia. Audit sul contratto precedente come per una modifica normale.

## Interfaccia

- **Scheda utenza**: «Codice impianto fornitore» tra le caratteristiche tecniche (solo elettriche); suggerimento della stima aggiornato.
- **Dialog del consumo** (solo periodo, solo utenze elettriche): quattro campi F0–F3 su una riga con suggerimento «facoltative; la somma deve coincidere col consumo», casella «Penale per energia reattiva».
- **Tab Consumi**: colonna «Fasce» compatta («F1 1.234 · F2 567 · F3 890», F0 solo se valorizzata) e icona per la penale con tooltip. Grafico invariato.
- **Elenco utenze**: segnalazione «Penali per energia reattiva»; colonna e filtro «Codice impianto fornitore».
- **Scheda contratto di fornitura**: azione «Nuovo contratto con queste utenze».
- **Guida**: codice impianto, fasce, penale e segnalazione, nuova regola della stima manuale, ordine dei contratti, rinnovo con le stesse utenze. Data in testa aggiornata.

## Test

- Backend:
  - `consumption-calculator.spec.ts`: `validateBands` (somma esatta, entro 1 kWh, oltre, fasce vuote = 0, nessuna fascia = nessun controllo), azzeramento per le letture, `decideEstimate` con copertura sotto e sopra 300 giorni;
  - `utility-consumptions.service.spec.ts`: fasce e penale azzerate per utenze non elettriche, errore 400 sulla somma;
  - `anomalies.service.spec.ts`: nuova query in fondo;
  - `contracts.service.spec.ts`: `replaces_contract_id` chiude il precedente e ne accorcia la scadenza; scadenza già anteriore invariata; nuovo senza decorrenza; precedente inesistente → 400.
- Frontend: `ng build`; prova reale con Playwright (consumo con fasce sbagliate → errore, penale → segnalazione, ordine dei contratti, nuovo contratto con le utenze e chiusura del precedente).

## Dati dopo il rilascio (DB locale, poi produzione con backup e ripristino)

Script in `.audit-w/ch80/`, via API PATCH: fasce F0–F3 e penale (importo reattiva > 0 nel mese) sui 3.400 consumi CH80 già importati; codice impianto sui 181 POD.

## Rilascio

Minor con migration: v1.27.0.
