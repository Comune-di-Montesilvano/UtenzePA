# Capitoli per destinazione e fabbisogno dei capitoli — design

Data: 2026-11-27. Stato: approvato (rilascio a), rilascio b da progettare.

## Perché

La ragioneria impegna su un capitolo e liquida su un altro, mese per mese, seguendo la
capienza degli impegni: nel 2026 il capitolo 12191/0 (luce scuole materne) ha pagato
16.209 € di bollette, di cui 14.338 € di utenze che UtenzePA assegna a 12331/2
(istituti comprensivi) e a 14521/20 (asilo nido). Il motivo è che i capitoli sono
«bianchi e neri» (materna, elementare, comprensivi, media) mentre gli edifici sono
promiscui, e nessuno ha mai definito quale utenza vada su quale capitolo. Il risultato
è che ogni anno gli stanziamenti non corrispondono alla spesa reale delle utenze e
gli impegni si rincorrono.

Obiettivo: definire una volta per tutte, in modo semplice, il capitolo «ideale» di
ogni utenza e calcolare su quello il fabbisogno dell'anno dopo, così da chiedere alla
ragioneria la variazione di bilancio giusta. Le liquidazioni reali restano come sono,
le differenze si segnalano.

## Decisioni dell'utente

- **Battesimo dell'edificio**: ogni immobile riceve un'etichetta X (la «destinazione di
  spesa»: Scuola materna, Istituti comprensivi, Asilo nido…), una sola anche se
  nell'edificio convivono più scuole. Niente ripartizioni percentuali.
- **Capitolo = destinazione + natura**, univoco: per ogni X un solo capitolo luce, uno
  gas, uno acqua.
- **Il capitolo dell'utenza si ricava** (join): utenza → edificio → X; tipo utenza →
  natura; (X, natura) → capitolo.
- **Discrepanze con le liquidazioni**: solo segnalate.
- **Fabbisogno sull'associazione ideale**: la spesa dell'anno dell'utenza luce di X va
  tutta sul capitolo luce X, comunque sia stata pagata.
- **Fabbisogno slegato dalla convenzione**: pagina a sé.
- Approccio scelto: anagrafica nuova «Destinazione di spesa» (vedi Approcci).

## Obiettivi

1. Anagrafica delle destinazioni di spesa, assegnabile a immobili e impianti.
2. Capitoli con destinazione e natura; coppia unica.
3. Capitolo dell'utenza ricavato, visibile nella scheda utenza con la spiegazione
   («da Scuola materna, immobile Via …, luce»).
4. Segnalazione delle utenze liquidate su capitoli diversi dal loro.
5. Pagina «Fabbisogno capitoli»: per ogni capitolo, spesa dell'anno prima / in corso /
   dopo delle sue utenze contro lo stanziamento, proposta di variazione ed export.

## Non obiettivi

- Ripartire un'utenza su più capitoli (percentuali).
- Correggere le quote o le liquidazioni importate dalla contabilità.
- Scrivere in Tinn (`GFUTCAPITOLI`): al più un export da consegnare, in futuro.
- Toccare il fabbisogno della convenzione per gli impegni dell'anno in corso
  (avviso «Impegni insufficienti»): resta com'è.

## Anti-obiettivi

- Il capitolo di un'utenza cambiato di nascosto dall'import notturno (oggi
  `planUtilityChapters` lo fa): con le destinazioni l'import non scrive più il capitolo.
- Un deploy che lascia utenze senza capitolo: finché un'utenza non ricava una
  destinazione, tiene il capitolo che ha oggi.

## Approcci considerati

1. **Anagrafica «Destinazione di spesa» (scelto).** Tabella gestita dagli Admin;
   immobili e impianti ne hanno una; i capitoli hanno destinazione + natura. Copre le
   utenze senza edificio (illuminazione pubblica, fontane, casette dell'acqua) tramite
   l'impianto. Una rinumerazione dei capitoli si fa spostando l'etichetta sul capitolo
   nuovo, senza toccare gli immobili.
2. Funzione dell'immobile come X (nuove funzioni «Scuola materna»…): niente anagrafica
   nuova ma mescola classificazione patrimoniale (icone, mappa, filtri) e contabile;
   gli impianti non hanno funzione. Scartato.
3. Tre campi capitolo (luce/gas/acqua) su immobile e impianto: diretto, ma ogni
   rinumerazione obbliga a ritoccare tutti gli immobili. Scartato.

## Design

### Dati

- `spending_destinations` (nuova): `id`, `name` (unico tra i non cancellati), `notes`,
  colonne standard di autore/date, `deleted`.
- `assets.spending_destination_id` e `plants.spending_destination_id`: facoltativi.
- `budget_chapters.spending_destination_id` + `budget_chapters.hard_type` (natura,
  stesso enum `HardTypeEnum` dei tipi di utenza, internet compreso): facoltativi; unicità di (destinazione, natura) tra
  i capitoli non cancellati controllata dal service (400 con messaggio, mai 409).
- `utilities.budget_chapter_code_fk` resta (lo leggono spesa, anomalie, impegni,
  fabbisogno della convenzione) ma diventa un valore ricalcolato quando la
  destinazione si ricava; nuova colonna `utilities.chapter_source` =
  `DERIVED` | `MANUAL`.

### Regola del capitolo (funzione pura, gemella SQL se serve)

1. Destinazione dell'utenza, nell'ordine (decisione dell'utente: vince l'immobile,
   perché la maggior parte degli impianti non ha una destinazione propria: un impianto
   di riscaldamento non sa se scalda una materna o un comprensivo):
   1. immobili collegati all'utenza;
   2. se l'utenza non ha immobili: impianti collegati, con la loro destinazione se
      l'hanno (illuminazione pubblica, casette dell'acqua, fontane), altrimenti quella
      degli immobili dell'impianto (`plant_assets`).
   Contano solo immobili e impianti *con* destinazione: un immobile con e uno senza =
   quella presente; nessun immobile con destinazione = si passa agli impianti.
   Cancellati esclusi, dismessi compresi. Più destinazioni diverse allo stesso passo =
   ambigua (nessun capitolo ricavato, segnalazione).
2. Natura = `hard_type` del tipo di utenza.
3. Capitolo = capitolo non cancellato con quella destinazione e natura; se non c'è,
   capitolo con quella destinazione e natura vuota («tutte le nature», per i capitoli
   generici `1.03.02.05.000`); se non c'è neanche quello, nessun capitolo ricavato.
4. Capitolo ricavato → `budget_chapter_code_fk` = quello, `chapter_source = DERIVED`.
   Nessun capitolo ricavato → resta il valore attuale, `chapter_source = MANUAL`
   (modificabile dalla scheda come oggi). Con capitolo ricavato il campo nella scheda è
   in sola lettura: per cambiarlo si cambia la destinazione dell'immobile/impianto o
   l'etichetta del capitolo, mai l'utenza (niente eccezioni per singola utenza).

Ricalcolo: dopo il salvataggio di destinazione, capitolo, immobile, impianto, utenza o
dei loro collegamenti, all'avvio e di notte, con la coda di `SupplyReconcileService`
ma con l'audit di `LinkApplierService` (`link-applier.service.ts`: audit sul campo
capitolo dell'utenza, autore di sistema `-1`; `SupplyReconcileService` invece non
scrive audit). Ogni cambio di capitolo passa da `CommitmentReconcileService.
reconcileUtilities` come oggi.

**Esercizi chiusi congelati** (decisione dell'utente): un cambio di capitolo
dell'utenza ricalcola le quote `AUTO` solo delle fatture con competenza nell'esercizio
in corso o successivi; le quote `AUTO` degli esercizi chiusi restano come sono (oggi
`reconcileAll`/`reconcileUtilities` le rifanno tutte: va aggiunto il limite). Le
fatture senza alcuna quota (nessun impegno) seguono ancora il capitolo attuale
dell'utenza anche negli anni passati: caso residuale, accettato.

L'import della contabilità smette di scrivere il capitolo di tutte le utenze, anche
`MANUAL`: il passo `links` tiene i contratti degli impegni e `planUtilityChapters`
non scrive più (la segnalazione sotto la sostituisce). L'anomalia `accounting_utility_chapter_ambiguous`
è sostituita da quella nuova.

### Segnalazioni

- Anomalia `utilities_paid_on_other_chapters`: utenze con spesa degli ultimi 12 mesi
  liquidata su capitoli diversi dal loro (stesso calcolo «pagato qui / altrove» della
  v1.61.0), con importo e capitoli.
- Anomalia `utilities_destination_missing`: utenze attive senza capitolo ricavato
  (immobile/impianto senza destinazione, destinazione ambigua, nessun capitolo per
  destinazione + natura).
- Scheda utenza, campo Capitolo: «12191/0 — da Scuola materna (immobile …), luce»
  oppure «a mano»; sotto, se c'è, «pagata anche su 12331/2: giu 2026».

### Interfaccia

- Impostazioni → Destinazioni di spesa (Admin): elenco con numero di immobili,
  impianti, capitoli e utenze per destinazione.
- Scheda immobile e scheda impianto: campo «Destinazione di spesa».
- Scheda capitolo: campi «Destinazione» e «Natura».
- Aiuto al primo popolamento: nella pagina delle destinazioni, gli immobili senza
  destinazione con la proposta ricavata dai capitoli attuali delle loro utenze (la
  destinazione del capitolo più frequente); accettazione esplicita, singola o a
  blocchi, mai automatica.

### Fabbisogno capitoli (secondo rilascio)

Pagina nel menu Spesa. Per ogni capitolo con destinazione, sulle sue utenze ricavate:
spesa dell'anno intero prima / in corso / dopo (stessa logica di `annualCost` del
fabbisogno della convenzione, estesa a tutte le nature: per acqua e altre senza prezzo
della convenzione la stima viene dalla sola spesa), stanziamento dell'anno dopo se c'è,
altrimenti assestato dell'anno in corso, differenza; proposta di spostamenti
(`simulateMoves`, capitoli escludibili) ed export `.xlsx` per la ragioneria. Il tab
«Richiesta alla ragioneria» della convenzione diventa un collegamento a questa pagina.

## Rilasci

Il calcolo «pagato qui / altrove» è della v1.61.0 (PR #461): il rilascio (a) parte
da `main` dopo il suo merge.

1. **(a)** Destinazioni, capitoli con destinazione + natura, capitolo ricavato,
   segnalazioni, scheda utenza, aiuto al popolamento, stop alla scrittura del capitolo
   dall'import. Migration (minor).
2. **(b)** Pagina Fabbisogno capitoli e collegamento dalla convenzione. Da progettare
   a parte prima di costruirla: quali utenze contano senza ordini della convenzione
   (oggi `annualCost` vuole un ordine non chiuso), prezzi senza convenzione, destino di
   `chapterNeeds` e dell'anomalia `chapters_variation_needed`.

## Lasciato a chi costruisce

Nomi di componenti e file, posizione dei campi nelle schede, testi della guida,
dettagli del ricalcolo (coda, debounce) sul modello di `SupplyReconcileService`.

## Scelte mie, da verificare

- Natura vuota sul capitolo = «tutte le nature» (per i capitoli generici).
- `budget_chapter_code_fk` tenuto come valore ricalcolato invece di sostituirlo con una
  vista: nessuna delle query esistenti cambia.
- La tabella `budget_chapter_utility_types` (tipi ammessi) resta com'è; la natura del
  capitolo è un campo nuovo e separato.
- Chi assegna la destinazione a immobili e impianti: Admin e Operatore; l'anagrafica
  delle destinazioni solo Admin.
