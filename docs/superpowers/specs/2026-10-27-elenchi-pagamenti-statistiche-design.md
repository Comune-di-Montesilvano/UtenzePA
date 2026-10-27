# Elenchi veloci, pagamenti, schede raggruppate, statistiche dei capitoli — design

Data: 2026-10-27. Raccoglie le richieste dell'utente del 27/10 dopo l'import della contabilità (fasi 3–4, v1.50.0–v1.51.1). Una PR per punto, nell'ordine sotto.

## Perché

Con la contabilità importata (dal 2022) UtenzePA ha 12.690 fatture, capitoli con migliaia di righe e decine di utenze. Le viste pensate per pochi dati ora sono lente e lunghe da scorrere, e mancano due informazioni che l'utente cerca ogni giorno: se una fattura è pagata e quanto costa davvero un'utenza.

## Riepilogo

| # | Richiesta | Stato |
|---|---|---|
| 1 | Elenco fatture leggero | Fatto: PR #340 (in `main`, non ancora rilasciato) + seguito in corso |
| 2 | Stato del pagamento delle fatture | Fatto: PR #341 (in coda di merge) |
| 3 | Elenchi raggruppati nelle schede | Fatto, PR da aprire |
| 4 | Statistiche nella scheda capitolo → Utenze | Fatto, PR da aprire |
| 5 | Impostazione «Sezione catastale» | Da fare |

Rilascio: **v1.52.0** dopo 1 e 2 (migration e nuova immagine `tinn`). Finché non esce, l'immagine `latest` è la v1.51.1: chi la usa vede ancora il vecchio `GET /invoices`.

## 1. Elenco fatture leggero

**Problema.** `GET /invoices` restituiva ogni fattura con righe, quote, impegni e capitoli: 36 MB e 2,4 s per 12.690 fatture, caricati interi dalla pagina Fatture e dai tab Fatture delle schede.

**Fatto (PR #340).** `GET /invoices/list` con gli stessi filtri: solo i campi della tabella, il nome del fornitore e i valori calcolati dal server (utenze, totale e periodo delle righe, capitoli, POD per la ricerca libera). La pagina Fatture e `app-invoices-tab` lo usano; la scheda carica la fattura completa con `getById` prima di aprirsi (dalla riga leggera un Salva svuoterebbe le righe). 9,9 MB (360 KB compressi), 0,6 s.

**Seguito (misurato nel browser il 27/10).** Il rendering pesa ~200 ms. Il resto è la richiesta, che parte in parallelo con le opzioni dei filtri avanzati (`/utilities?deleted=false` ~2 s) e se le contende con il server:

- `findList` come una sola query con righe grezze (`getRawMany`), aggregati di righe e quote in join: 1,4 s → 0,7 s lato server.
- Opzioni dei filtri caricate solo per i filtri in linea e quelli valorizzati; le altre al passaggio del mouse o all'apertura di «Filtri avanzati» (`app-list-filters`, vale per tutti gli elenchi).

**Non obiettivo per ora:** paginazione lato server (ricerca, ordinamento, segnalazioni ed export passerebbero al server). Si riconsidera se l'elenco resta lento dopo il seguito.

## 2. Stato del pagamento

**Fatto (PR #341).** Il container Tinn estrae i mandati delle liquidazioni (`GFMARIN1`/`GFMATEN1`, annullati esclusi) come colonne facoltative di `liquidazioni.csv`. Il passo `payments` dell'import scrive `invoices.payment_status` e `paid_on`:

| Stato | Regola |
|---|---|
| Da liquidare | Nessuna liquidazione valida |
| Liquidata | Liquidata, almeno un mandato non pagato o non emesso |
| Pagata | Tutti i mandati con data di pagamento; esercizi chiusi: basta il mandato emesso (in Tinn le quietanze 2021–2023 mancano spesso) |

Senza stato: fatture prima dell'anno di partenza, note di credito, rifiutate. Colonna e filtro «Pagamento» nell'elenco (al posto di `is_paid`, mai valorizzato), badge e tab «Pagamento» nella scheda con liquidazioni e mandati.

## 3. Elenchi raggruppati nelle schede

**Problema.** Nelle schede le liste possono avere migliaia di righe (capitolo: 4.479 fatture; soggetto terzo: 7.126) tutte renderizzate insieme.

**Componente riusabile** `app-sheet-groups` (`core/components/entity-sheet/sheet-groups.component.ts`):

- Riceve gruppi `{key, label, rows, summary?, open}` e un template figlio con le righe del gruppo; intestazione cliccabile con etichetta, numero di elementi e totale (se dato). `groupByYear()` costruisce i gruppi per anno, `keepOpen()` conserva aperto/chiuso dopo un ricaricamento.
- **I gruppi chiusi non si renderizzano** (`@if` sul contenuto): è questo che toglie il peso.
- Lo stato aperto/chiuso resta finché la scheda è aperta; non si ricorda tra le aperture.

**Fatture per anno**, aperto solo l'anno corrente o, se vuoto, l'ultimo con fatture; totale dell'anno in intestazione (rifiutate escluse, come oggi):

| Scheda | Tab |
|---|---|
| Capitolo | Fatture (righe di fattura, per esercizio di competenza) |
| Impegno | Fatture (quote, per esercizio di competenza) |
| Contratto di fornitura | Fatture (`app-invoices-tab`) |
| Soggetto terzo | Fatture (`app-invoices-tab`) |
| Utenza | Fatture (`utility-invoices-tab`) |

Contratto, soggetto terzo e utenza raggruppano per anno della data fattura.

`app-invoices-tab` ha già i totali per anno: diventano le intestazioni dei gruppi.

**Capitolo → Utenze per stato:** «Attive» aperto, «Cessate» chiuso (stato dallo storico, `supply_active`).

## 4. Statistiche nella scheda capitolo → Utenze

**Periodo** (decisione dell'utente): selettore con «Ultimi 12 mesi» (default) e gli anni con dati.

**Riepilogo del capitolo nel periodo:**

- Spesa totale e media per utenza attiva.
- Per tipo di utenza: consumo totale e costo unitario medio (€/kWh, €/Smc, €/m³; tipi senza consumo solo spesa).
- Variazione rispetto al periodo precedente di pari durata (12 mesi prima o anno prima).

**Per utenza** (colonne della tabella): spesa del periodo, consumo, costo unitario, variazione della spesa, segnalazione **fuori norma**.

**Fonti** (nessun dato salvato, come il resto della spesa in `apis/spending/`):

- Spesa: righe di fattura dell'utenza per competenza del periodo della riga (`lineYearSql`), rifiutate escluse (`NOT_REJECTED_SQL`), IVA inclusa.
- Consumo: `utility_consumptions` (stime superate escluse, come `consumption-calculator.ts`).
- Endpoint `GET /budget-chapters/:id/utility-stats?period=last12|YYYY` (calcolo in `apis/spending/chapter-utility-stats.ts`, funzioni pure).
- Anno in corso: fino a oggi, confrontato con lo stesso tratto dell'anno prima.
- **Variazione solo se confrontabile**: righe di fattura con periodo che coprono almeno l'80 % dei giorni in entrambi i periodi. Senza questa regola il 2025 contro il 2024 segnalava 76 utenze su 93 (nel 2024 molte fatture non hanno righe per utenza); il riepilogo somma solo le utenze confrontabili.
- Vista «Statistiche» (default) e «Anagrafica» (tabella utenze di prima) nel tab, filtro «Solo fuori norma».

**Decisioni (confermate dall'utente il 27/10):**

1. **Fuori norma** = costo unitario oltre il doppio della mediana delle utenze dello stesso tipo nel capitolo, oppure spesa cambiata di oltre il 50 % rispetto al periodo precedente.
2. **Ripartizione nel periodo**: una riga di fattura a cavallo dei limiti del periodo conta pro rata sui giorni del suo periodo (righe senza periodo: data della fattura).

## 5. Impostazione «Sezione catastale»

Il Comune di Montesilvano non ha sezioni catastali: il campo è superfluo.

- Interruttore per gli Admin in Impostazioni (pagina generale), salvato in `settings`; **acceso di default** sulle installazioni nuove (il campo esiste nel resto d'Italia), spento a mano per Montesilvano.
- Spento: nasconde la colonna «Sezione» nei dati catastali della scheda immobile e negli export; la colonna del DB resta e i valori non si toccano.
- Letto all'avvio come il branding (`provideAppInitializer` con fallback).

## Note di credito (risolto in v1.53.0)

- **Note di credito nel capitolo** (segnalato dall'utente il 27/10, verificato sul DB Tinn lo stesso giorno):
  - In Tinn una nota di credito non ha mai liquidazioni, reversali o accertamenti: non tocca il capitolo. Si abbina a una o più fatture (`GFRIPNC`, nota → fattura con importo). La fattura stornata per intero non si liquida mai (192 dal 2024), quella stornata in parte si liquida al netto (31). Spesa del capitolo = liquidazioni = netto.
  - UtenzePA oggi: le fatture stornate in parte che ha (6) hanno quote ACCOUNTING al netto, giuste, e le loro note non ci sono; nessuna delle 192 stornate per intero è in UtenzePA.
  - **Gap 1**: 12 note di credito (−709 €, quasi tutte A2A come TD01 negative) hanno una quota AUTO negativa e riducono la spesa del capitolo, mentre in Tinn non sono abbinate a nulla e non pesano sul capitolo.
  - **Gap 2 (futuro)**: con l'import PEC arriveranno insieme fattura e nota. Stornata in parte: fattura con quote ACCOUNTING al netto + nota con quota AUTO negativa = riduzione contata due volte. Stornata per intero: fattura con quota AUTO al lordo e stato «Da liquidare» per sempre.
  - Soluzione (v1.53.0, PR #344): `note_credito.csv` facoltativo dal container `tinn` (abbinamenti di `GFRIPNC`) in `acc_credit_notes`. Stati del pagamento `CANCELLED` (Stornata: nessuna liquidazione e note abbinate che ne annullano il totale), `COMPENSATED` (nota abbinata) e `TO_COMPENSATE` (nota non abbinata). Su questi stati nessuna quota AUTO e niente spesa del capitolo (`NOT_OFFSET_SQL` in `CHAPTER_ITEMS`); spesa di utenze e immobili invariata (dalle righe).
  - Esito sul DB locale: 50 note «Da compensare», 0 quote AUTO negative (prima 12, −708,70 €). Nessuna «Stornata» o «Compensata»: le note in UtenzePA non sono abbinate in Tinn. Gap 2 coperto quando l'import PEC porterà fattura e nota insieme.

## Per ogni PR

- Test del backend sui file toccati, `ng build`, verifica in browser con utente temporaneo (poi eliminato).
- Guida aggiornata nella stessa PR per ogni modifica visibile, con la data.
- Merge con la coda; release quando un gruppo di PR è pronto (v1.52.0 dopo 1 e 2).
