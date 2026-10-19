# Letture stimate (roadmap voce 23) — design

Data: 2026-10-19. Versione prevista: v1.34.0 (migration).

## Perché

Le fatture (ACA per prime, poi luce e gas) riportano letture e consumi «stimati» dal fornitore oltre a quelli reali. L'import fatture in corso (sul DB locale, fuori dal repo) deve poter salvare la rilevazione come stimata. Oggi il calcolo non distingue: una stima troppo alta seguita dalla lettura reale (conguaglio) gonfia un periodo e sgonfia il successivo, e i controlli in inserimento rifiutano la lettura reale più bassa della stima precedente, bloccando l'import.

Regola approvata dall'utente: **un valore stimato conta finché non arriva un dato reale; da quel momento i dati stimati intermedi si ignorano** (il conguaglio riporta tutto al valore reale). Nel tab Consumi le stime si vedono come tali.

## Obiettivi

- Flag «Stimata» su ogni rilevazione (`utility_consumptions`), letture e periodi, default no.
- Calcolo (consumo effettivo, copertura, buchi, serie mensile, fasce, stima annua da storico) con priorità del dato reale sullo stimato.
- Controlli in inserimento che non blocchino i conguagli.
- Tab Consumi: badge «Stimata», righe superate dal dato reale in grigio.

## Non obiettivi

- Parser del PDF/XML della fattura (voce 6) e import: fuori dal repo / altra voce.
- Conguagli scritti come consumi negativi: non gestiti (consumo resta ≥ 0); si valuta quando l'import ne trova uno.
- Grafico: le stime contate restano nel «reale» del grafico, nessuna serie separata (scelta mia, rivedibile).

## Modello

- Colonna `utility_consumptions.is_estimated` `boolean NOT NULL DEFAULT false` (nome per non confondersi con la «stima annua» `estimated_annual_consumption`/`MonthlyPoint.estimated`, che è una previsione). Migration solo DDL, dati esistenti = reali.
- DTO create/update: `is_estimated?: boolean` (`@IsOptional() @IsBoolean()`); update senza campo = invariato. Audit come gli altri campi.
- Risposta di `GET` rilevazioni dell'utenza (`findByUtility`): `is_estimated` e nuovo campo calcolato `superseded: boolean` (true solo per stime che non contano più).

## Regole di calcolo (`consumption-calculator.ts`, funzioni pure)

### Letture

Per matricola, in ordine di data:
- una lettura stimata è **superata** se esiste una lettura reale della stessa matricola con data ≥ della sua (a pari data vince la reale);
- le letture «valide» = tutte le reali + le stimate non superate (cioè quelle dopo l'ultima reale della matricola);
- coppie (`readingPairs`), delta (`readingDeltas`), interruzione per cambio contatore e matricola attuale (`currentMeterReading`) usano solo le letture valide. Una lettura superata ha delta `null`;
- una coppia è «stimata» se almeno uno dei due estremi è stimato.

### Periodi

Un giorno prende il consumo, in ordine di priorità, da:
1. periodi reali;
2. coppie di letture reali;
3. periodi stimati;
4. coppie di letture con almeno un estremo stimato.

Il livello successivo riempie solo i giorni non coperti da quelli prima (oggi esistono solo 1 e 2, invariati). Stesso schema per le fasce (`buildDailyBands`).

Un periodo stimato è **superato** se tutti i suoi giorni sono coperti da dati reali (livelli 1–2); se coperto solo in parte conta per i giorni scoperti e resta «Stimata».

I giorni da stima contano come coperti (copertura, buchi, finestra di 12 mesi, stima da storico): la stima vale finché non arriva il reale.

## Controlli in inserimento (`validateConsumption`)

Letture:
- obbligatori, data futura, data minima: invariati;
- stessa matricola e stessa data: vietato tra due reali e tra due stimate; reale + stimata nella stessa data ammessa (vince la reale);
- lettura **reale**: «inferiore alla precedente» / «superiore alla successiva» (anche per totalizzatori F1–F3) confrontata solo con le letture reali;
- lettura **stimata**: solo «inferiore alla precedente» rispetto all'ultima lettura valida precedente (reale o stimata non superata); nessun limite verso le successive.

Periodi:
- sovrapposizione vietata tra due reali e tra due stimati; reale e stimato possono sovrapporsi (vince il reale).

## Frontend

- Dialog rilevazione (`consumption-edit-dialog`): spunta «Stimata» per letture e periodi.
- Tab Consumi (`utility-consumptions-tab`): badge «Stimata» sulla riga; se `superseded`, riga in grigio con «Superata dal dato reale» (tooltip/testo), consumo calcolato vuoto.
- Colori solo da token (`--tone-*`, `--app-*`).

## Guida

Sezione consumi: cosa vuol dire «Stimata», regola del conguaglio, riga superata. FAQ: «Ho inserito la lettura reale e il consumo stimato è sparito».

## Ricalcolo

Dopo il deploy nessun dato cambia (tutti reali). Dopo l'import con stime: ricalcolo notturno o «Backup e manutenzione → Consumi» (`POST /utility-consumptions/recalc`), come per ogni insert SQL diretto (vedi `CLAUDE.md`, sezione Dati).

## Test

- Calculator: lettura stimata tra due reali ignorata (delta, giornaliero); stime dopo l'ultima reale contano a catena; reale e stimata nella stessa data; cambio contatore con stime; priorità dei quattro livelli; periodo stimato superato del tutto / in parte; fasce.
- Validazione: reale più bassa della stima precedente accettata; stimata più bassa della reale precedente rifiutata; duplicati e sovrapposizioni per combinazione reale/stimata.
- Service: `superseded` e `is_estimated` nella risposta.

## Lasciato al builder

Nomi delle funzioni interne, struttura dei livelli nel calcolo, testo esatto del badge/tooltip nel rispetto del lessico sopra.
