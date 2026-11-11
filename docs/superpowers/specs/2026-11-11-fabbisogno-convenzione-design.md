# Fabbisogno della convenzione: quanto impegnare e avviso in corsa — design

Data: 2026-11-11. Fase 1 del piano a lungo termine (`docs/roadmap-patrimonio.md`, voce 24). Rilascio previsto: **v1.55.0** (minor, c'è una migration).

Legenda: **[utente]** = detto dall'utente; **[scelta mia]** = decisione di chi ha scritto il design, da contestare se non convince; il resto sono fatti verificati sul DB locale l'11/11.

## Perché

Quasi tutta la spesa di luce e gas passa da convenzioni CONSIP. Quando si aderisce, la ragioneria impegna una cifra per capitolo per tutta la durata; oggi quella cifra nasce da «storico più un tanto al chilo» **[utente]**. Sbaglia due volte: i consumi sono stagionali (luce del fornitore principale: da 99.000 kWh a maggio a 198.000 a dicembre) e il prezzo è variabile (costo tutto incluso da 0,375 a 0,279 €/kWh dentro lo stesso ordine).

Servono due cose, con lo stesso calcolo **[utente]**:

1. **all'inizio**: una proposta di quanto impegnare, capitolo per capitolo, per la durata della convenzione;
2. **durante l'anno**: se col prezzo reale degli ultimi mesi e i consumi di quest'anno gli impegni non basteranno, un avviso già a metà anno che invita a integrare l'impegno o a chiedere la variazione di bilancio. Accorgersene all'ultimo pagamento è tardi.

## Come lavora l'ufficio (da rispettare)

- **Comanda la convenzione** **[utente]**: sotto una convenzione stanno più ordini (contratti di fornitura con `consip_agreement_id`), ognuno col suo CIG e le sue date. Convenzione 57: 12 ordini, 180 utenze; 62: 6 ordini, 162 utenze; 63 (gas): 4 ordini, 51 utenze.
- Le utenze che entrano più tardi sono **già note** al primo ordine **[utente]** e si impegna subito per tutte.
- Stesso ordine, capitoli diversi: il capitolo dipende da cosa serve l'utenza (contratto 285: 158 utenze su 15 capitoli). Un impegno per capitolo **[utente]**.
- **Il CIG non è l'unità**: gli impegni pagano fatture di CIG diversi dal proprio (2026: 378.295 € su 2,5 milioni liquidati). Tre casi visti: un impegno sul CIG principale paga una ventina di ordini piccoli; l'impegno dell'ordine scaduto paga il rinnovo; sul gas l'impegno porta il `cig_master` della convenzione e le fatture il CIG derivato. Nessun calcolo di questa funzione deve passare dal CIG.

## Obiettivi

- Per ogni convenzione, **fabbisogno per capitolo ed esercizio**: speso, ancora da fatturare (previsto), totale previsto, impegnato, differenza.
- Prezzo: **un solo costo unitario tutto incluso** (€/kWh, €/Smc, IVA compresa) proposto dall'app e correggibile a mano **[utente]**.
- **Avviso** quando il totale previsto dell'esercizio in corso supera l'impegnato, distinto in: impegni da integrare, e capitolo da variare (non basta nemmeno l'assestato) **[scelta mia, non contestata dall'utente]**.
- Luce e gas dalla prima versione **[utente]**.
- Ogni numero si deve poter spiegare: da quali utenze, con che consumo, a che prezzo, con quanta parte di dati reali.

## Fuori (non obiettivi)

- Creare o modificare impegni: la funzione propone e avvisa, non scrive (con l'import della contabilità acceso gli impegni arrivano da Tinn).
- Scomporre il prezzo in materia, spread, oneri, imposte.
- Acqua e connettività (non passano da convenzioni; acqua: 1 utenza su 104 con consumi).
- Canoni a corpo e fatture senza righe per utenza: non si proiettano (vedi «Limiti dichiarati»).
- Avvisi via email (fase 2 del piano), conguagli sui consumi (residuo della voce 6, PR a parte).
- Contratti di fornitura senza convenzione: fuori da questa versione.
- Un elenco separato di «utenze previste» sulla convenzione: sostituito dall'ordine in bozza.

## Da evitare (anti-obiettivi)

- **Falsi allarmi**: un avviso che scatta per pochi euro o per dati mancanti verrà ignorato, e con lui quelli veri. Soglie e copertura minima sotto.
- **Numero senza spiegazione**: una cifra che la ragioneria non può ricostruire non verrà usata.
- **Lentezza delle segnalazioni**: `GET /anomalies` è appena sceso da 40 s a 0,4 s (v1.54.1); non deve ricalcolare proiezioni.

## Ordine in bozza

Le utenze che entreranno più tardi sono note al primo ordine, ma il loro ordine non esiste ancora e non ha un CIG. Per dirlo all'app **[utente: «ordine futuro in bozza»]** un contratto di fornitura può essere una **bozza**:

- CIG e numero d'ordine facoltativi (oggi il CIG è obbligatorio per il tipo Ordinario); fornitore, convenzione, date di fornitura previste e utenze come un contratto normale. Le date sono obbligatorie: senza, la bozza non entra nel calcolo;
- si crea come ogni contratto, anche con «Nuovo contratto con queste utenze» e «Collega le utenze di un contratto» dal tab Utenze, con la spunta **Bozza (ordine non ancora emesso)**; badge «Bozza» in scheda ed elenco, filtro in elenco;
- **vale solo per il fabbisogno**: una bozza non è un contratto valido. Non copre l'utenza (resta «senza contratto di fornitura valido» se non ne ha un altro), non entra nei controlli di sovrapposizione, CIG mancante o duplicato, manutenzione a carico, capitoli impegnati sul contratto, e l'import delle fatture non la sceglie mai. Chi implementa deve passare ogni query che legge `contracts` e decidere caso per caso: è la parte delicata di questo pezzo;
- diventa un ordine togliendo la spunta: da quel momento valgono le regole normali (CIG obbligatorio per il tipo Ordinario). Un contratto vero non torna bozza **[scelta mia]**;
- una bozza con data di inizio passata è segnalata nell'elenco contratti («Bozze scadute: ordine da emettere o da eliminare») **[scelta mia]**;
- gli impegni si possono collegare a una bozza **[scelta mia]**: si impegna prima di emettere l'ordine.

Nel calcolo sotto, «ordine» comprende le bozze. Nel tab Fabbisogno le utenze che arrivano da una bozza sono distinguibili.

Rilascio in due PR **[scelta mia]**: prima la bozza (piccola, con migration, utile da sola), poi il fabbisogno.

## Il calcolo

Funzioni pure in `backend/src/apis/spending/` (file nuovo, es. `agreement-forecast.ts`, con spec), sul modello di `chapter-utility-stats.ts`, da cui si riusano `lineShare` (riga di fattura pro rata sui giorni), `spendOnDays` (spesa sui soli giorni con consumo: oggi privata, da esportare) e l'idea di finestra in giorni; i consumi giornalieri vengono da `buildDailyConsumption` (`utility-consumptions/consumption-calculator.ts`).

**Perimetro.** Utenze collegate (`contract_utilities`) ai contratti non cancellati della convenzione. Un'utenza conta nei giorni coperti da almeno un ordine della convenzione (`supply_start_date`–`supply_expiry_date`); giorni coperti da due ordini contano una volta. Non conta nei giorni in cui la fornitura risulta cessata o volturata a un terzo dallo storico (`utility_supply_events` con data effettiva: fuori dalla cessazione in poi e dalla voltura fino alla reintestazione), cioè conta solo quando il costo è del Comune, come nelle segnalazioni esistenti (`inChargeSql`). Ordine senza date **[scelta mia]**: escluso dal calcolo ed elencato tra gli avvisi del tab («ordine senza date di fornitura»).

**Orizzonte.** Dal primo `supply_start_date` all'ultimo `supply_expiry_date` degli ordini della convenzione **[scelta mia]** (`consip_agreement.expiration_date` è il termine per aderire, non la durata della fornitura). Esercizio = anno solare del giorno.

**Per ogni utenza e ogni giorno dell'orizzonte**, in quest'ordine:

1. **giorno già fatturato** (coperto da una riga di fattura dell'utenza, fatture rifiutate e compensate escluse come nel resto della spesa: `NOT_REJECTED_SQL`, `NOT_OFFSET_SQL`): vale la quota reale della riga (`lineShare`). Contano le righe di qualunque fattura dell'utenza che coprono quei giorni, non solo quelle con il CIG di un ordine della convenzione. Righe senza periodo completo **[scelta mia]**: non coprono giorni; il loro importo entra nel fatturato dell'esercizio (`lineFiscalYear`), l'utenza è elencata negli avvisi del tab («righe senza periodo») e i suoi giorni non contano come coperti nella copertura;
2. **giorno non fatturato** (passato senza fattura o futuro): costo previsto = consumo atteso del giorno × prezzo.

**Consumo atteso del giorno** **[scelta mia]**:

- consumo dello stesso giorno dell'anno prima (da `buildDailyConsumption`), moltiplicato per l'**andamento**: consumo reale degli ultimi 90 giorni con dati / consumo degli stessi giorni dell'anno prima, calcolato sull'insieme delle utenze della convenzione per tipo (non per utenza: troppo rumore), tenuto tra 0,7 e 1,5; senza dati sufficienti = 1;
- se l'utenza non ha quel giorno nello storico: presunto annuo dell'utenza (già salvato dal ricalcolo consumi) diviso sui giorni;
- se non ha nemmeno quello: **ripiego sulla spesa**, costo del giorno = spesa media giornaliera dell'utenza dalle sue righe degli ultimi 12 mesi, senza passare dal prezzo; l'utenza è marcata «stima dalla sola spesa»;
- se non ha nulla: esclusa ed elencata («senza dati»).

Lo stesso ripiego sulla spesa vale per le utenze che hanno spesa ma consumo zero (quote fisse).

**Prezzo.** Per convenzione e tipo di utenza (`hard_type`):

- **proposto** = spesa delle righe / consumo, sulle utenze della convenzione, negli ultimi 3 mesi con fatture, contando solo i giorni con consumo (stessa regola del costo unitario di `chapter-utility-stats`); se la convenzione non ha ancora fatture, lo stesso calcolo sulle stesse utenze qualunque sia il contratto;
- **a mano** = valore inserito dall'utente, che sostituisce il proposto finché non lo si toglie («Torna al proposto»). Si salva sulla convenzione con chi e quando; forma della tabella lasciata a chi implementa (serve un prezzo per tipo, anche se di norma una convenzione ha un tipo solo).

**Aggregazione.** Capitolo = capitolo attuale dell'utenza (`budget_chapter_code_fk`); utenze senza capitolo in una riga «Senza capitolo». Per (capitolo, esercizio):

- **Fatturato** = somma dei giorni reali;
- **Previsto da fatturare** = somma dei giorni previsti;
- **Totale previsto** = i due sopra;
- **Impegnato** = annualità (`budget_commitment_years`) di quell'esercizio degli impegni non cancellati su quel capitolo collegati ad almeno un ordine della convenzione (`budget_commitment_contracts`). Un impegno collegato a ordini di due convenzioni conta per intero in entrambe ed è segnalato nel tab **[scelta mia]**;
- **Rimanenza** = impegnato − tutte le quote già spese su quegli impegni in quell'esercizio (`COMMITMENT_SPENT`), qualunque fattura le abbia consumate: gli impegni pagano anche altro (CIG diversi, fatture senza righe) e quei soldi non ci sono più;
- **Differenza** = rimanenza − previsto da fatturare (negativa = manca) **[scelta mia, dopo la revisione]**. È il confronto che conta per l'avviso; il totale previsto resta in tabella perché è la cifra da impegnare all'inizio, quando la rimanenza coincide con l'impegnato;
- **Copertura** = quota dei giorni dell'esercizio calcolati da dati reali o dal consumo storico (non dal ripiego sulla spesa né esclusi).

Gli esercizi chiusi si mostrano ma senza proiezione (solo fatturato e impegnato).

## Dove si salva

Il risultato è una **cache** in una tabella nuova (una riga per convenzione, capitolo, esercizio, con gli importi sopra, copertura e `computed_at`) **[scelta mia]**: stesso principio dei valori di consumo salvati sull'utenza dal ricalcolo, perché le segnalazioni devono leggere e non calcolare. Ricalcolo:

- ogni notte, dopo il ricalcolo dei consumi e la riconciliazione degli impegni (cron proprio, variabile d'ambiente come gli altri);
- all'apertura del tab, se la cache della convenzione è più vecchia dell'ultimo salvataggio del prezzo, e col pulsante **Ricalcola**;
- al salvataggio del prezzo a mano;
- dopo il salvataggio di un impegno collegato a un ordine della convenzione e alla fine di un caricamento della contabilità (dopo `reconcileAll`), così l'avviso sparisce appena l'impegno è integrato **[scelta mia]**.

Il dettaglio per utenza del tab (consumo atteso, origine della stima, avvisi) non si salva: si calcola all'apertura, e lo stesso giro riscrive la cache della convenzione, così i totali del tab e quelli delle segnalazioni coincidono.

Scrittura di sistema: nessun audit, `update_date` della convenzione invariata. Un giro fallito su una convenzione non blocca le altre.

## Avvisi

Solo sull'esercizio in corso, solo convenzioni con almeno un ordine non chiuso. Soglie **[scelta mia]**, costanti nel file del calcolo: ammanco oltre il 5 % dell'impegnato **e** oltre 200 €; nessun avviso se la copertura è sotto il 60 % (al suo posto, nel tab, «dati insufficienti per l'avviso»).

Due segnalazioni nuove in `GET /anomalies` (in fondo a `getAnomalies()`, lette dalla cache):

| Chiave | Significato | Dove |
|---|---|---|
| `agreements_commitments_short` | Convenzioni con impegni che non basteranno (per capitolo: quanto manca) | dashboard, elenco Convenzioni CONSIP, elenco Impegni |
| `chapters_variation_needed` | Capitoli dove l'ammanco previsto delle convenzioni supera il «da impegnare» (assestato − impegnato, da `chapter-year.ts`): serve la variazione | dashboard, elenco Capitoli di spesa |

Un capitolo senza alcun impegno della convenzione nell'esercizio in corso, con spesa prevista, rientra nella prima (manca tutto). Un capitolo senza assestato dell'anno non entra in `chapters_variation_needed` (c'è già `chapters_without_budget`) ma resta nella prima.

L'elenco Convenzioni CONSIP oggi non ha segnalazioni: `app-list-signals` e i suoi `*_SIGNALS` vanno aggiunti lì da zero.

## Interfaccia

Tab nuovo **Fabbisogno** nella scheda della convenzione CONSIP (`pages/consip-agreement/consip-agreement-sheet.component`), regole delle schede entità (`aria-label`, `app-tab-label`, gruppi apribili):

- in testa: **Costo unitario** per tipo, con il valore proposto, il campo per quello a mano, «Torna al proposto», l'**andamento** dei consumi sull'anno prima, data dell'ultimo calcolo e **Ricalcola**;
- tabella per **esercizio** (gruppi apribili, aperto quello in corso), una riga per capitolo: utenze, fatturato, previsto da fatturare, totale previsto, impegnato, differenza (in rosso se manca, col tono dei token esistenti), copertura; riga dei totali; export come le altre tabelle;
- clic su un capitolo: le sue utenze con consumo atteso, costo previsto e origine della stima (storico, presunto annuo, sola spesa, senza dati); clic sull'utenza apre la scheda (`EntityNavigatorService`);
- avvisi del tab: ordini senza date, utenze senza dati, impegni condivisi con un'altra convenzione, dati insufficienti;
- badge in intestazione della scheda quando la convenzione è nella segnalazione.

Prezzo a mano: Admin e Operatore. Tutto il resto in sola lettura per tutti i ruoli. Nessun dato dell'ente nel codice.

**Roadmap** (stessa PR): la voce 24 diceva «nessun dettaglio per utenza: basta una stima»; va riscritta, perché la stima per capitolo qui nasce dalle utenze.

**Guida operatori** (`frontend/public/guida/guida.md`, stessa PR, data in testa): estendere «Gestire una convenzione CONSIP» col tab Fabbisogno e come leggere la differenza; due righe nuove in «Segnalazioni per elenco»; un problema frequente «La convenzione risulta con impegni insufficienti» (Causa / Soluzione / Apri un ticket se).

## Limiti dichiarati (scritti anche in guida)

- **Fatture senza righe per utenza** (canoni; gas 2025 del vecchio fornitore: 467 fatture): i giorni non risultano fatturati e vengono previsti. Le loro quote riducono la rimanenza e gli stessi giorni vengono previsti: l'ammanco risulta gonfiato. Il tab mostra, per esercizio, l'importo delle quote di fatture senza righe sugli impegni della convenzione, così l'utente lo vede. Oggi luce 2026 e gas 2026 hanno righe per utenza.
- **Ordine nuovo senza pattern di import**: il contratto 112 (da luglio 2026) ha 6–8 bollette al mese con righe contro circa 135 prima. La proiezione regge (prevede i giorni non fatturati) ma il prezzo proposto si basa su poche fatture: va creato il pattern. Non è lavoro di questa PR.
- **128 utenze luce attive senza consumi né righe** (probabile pubblica illuminazione a canone, non verificato): se stanno sotto una convenzione finiscono in «senza dati».
- Il prezzo futuro non lo conosce nessuno: l'app propone il recente e mostra l'effetto dell'ipotesi dell'utente, non prevede il mercato.

## Verifica

- Spec delle funzioni pure: giorno fatturato vs previsto, ingresso dell'utenza a metà orizzonte, due ordini sovrapposti, cessazione, andamento con i limiti, i quattro livelli del consumo atteso, soglie e copertura, esercizio a cavallo.
- `anomalies.service.spec.ts`: mock posizionali in fondo e `toHaveBeenCalledTimes` aggiornato.
- Migration: ciclo up → down → up; `schema:log` pulito sulle tabelle toccate.
- Sul DB locale, a mano: per la convenzione 62 (luce, chiusa a metà 2026) rifare il calcolo «come se fosse» fine 2025 e confrontare il previsto del primo semestre 2026 col fatturato vero; lo scarto va scritto nella PR. È la prova che la proiezione vale qualcosa.
- E2E dall'host (Playwright) sul tab: prezzo a mano, ricalcolo, clic sul capitolo.

## Lasciato a chi implementa

Nomi di tabelle, colonne, endpoint e componenti; forma del salvataggio del prezzo; query di caricamento (attenzione ai volumi: 180 utenze × 2 anni di giorni per convenzione); orario del cron; taratura dell'andamento e delle soglie se la prova sulla convenzione 62 lo suggerisce (dichiarandolo nella PR).
