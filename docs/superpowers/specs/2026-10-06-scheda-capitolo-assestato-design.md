# Scheda capitolo di spesa e assestato (roadmap voci 14 e 20)

Data: 2026-10-06. Stato: da approvare.

## Obiettivo

Il capitolo di spesa è l'ultima anagrafica principale ancora nel dialog vecchio (tre tab: Dati, Utenze associate, Spesa storica). Diventa una scheda come le altre (immobile, utenza, contratto, fattura, soggetto terzo) e accoglie i dati di bilancio per esercizio. Così si vede, capitolo per capitolo, quanto è stanziato, quanto è impegnato, quanto è fatturato e quanto resta.

Criteri di riuscita:

- dalla scheda capitolo si raggiungono utenze, contratti (impegni) e fatture con un clic;
- per ogni esercizio si leggono insieme stanziamento iniziale, assestato, impegnato, fatturato, spesa della ragioneria e disponibile;
- uno sforamento dell'assestato, o un capitolo usato senza assestato, compare in dashboard e nell'elenco capitoli;
- registrando una fattura che porta un capitolo oltre l'assestato, la scheda fattura avvisa (senza bloccare).

## Decisioni prese

| Tema | Scelta |
|---|---|
| Dove salvare assestato e stanziamento iniziale | Sulla riga per capitolo + anno già esistente (`budget_chapter_spending`, la "spesa storica"): un solo posto per i dati della ragioneria sull'anno |
| Speso degli anni passati | Due colonne affiancate: "Spesa ragioneria" (inserita) e "Fatturato" (calcolato dalle fatture) |
| Disponibile | Assestato − impegnato |
| Mandati di pagamento | Non ora (restano in roadmap, voce 20) |
| Sforamento | Segnalazione "Capitoli oltre l'assestato", segnalazione "Capitoli senza assestato", avviso nella scheda fattura |

Fuori: FPV, impegni prenotati, pre-impegni, pre-liquidazioni, economie, riaccertamenti, cassa (contabilità della ragioneria, vedi voce 20).

## Dati

### `budget_chapter_spending` (una riga per capitolo + esercizio)

Resta la tabella e resta la regola "un solo record per capitolo/anno tra i non cancellati" (verificata nel service). Cambia:

| Colonna | Prima | Dopo |
|---|---|---|
| `amount` | obbligatoria | facoltativa, etichetta "Spesa ragioneria" |
| `initial_budget` | — | nuova, decimal(14,2) facoltativa, "Stanziamento iniziale" |
| `adjusted_budget` | — | nuova, decimal(14,2) facoltativa, "Assestato" |
| `notes`, `year` | invariate | invariate |

Una riga deve avere almeno uno dei tre importi (400 con messaggio altrimenti). Importi non negativi. Migration additiva: due colonne nuove, `amount` diventa `NULL`; le 104 righe esistenti (2022–2024) restano come sono. Il `down` rifiuta di partire se ci sono righe con `amount` nullo (controllo preliminare con errore leggibile, come le altre migration che toccano dati).

Nessun altro dato salvato: impegnato, fatturato, disponibile e stato si calcolano sempre.

### Calcoli per capitolo ed esercizio

Stesse regole della spesa già in uso (`apis/spending/`):

- **capitolo di una riga fattura** = capitolo dell'impegno della riga, altrimenti capitolo dell'utenza;
- **esercizio di una riga fattura** = esercizio dell'impegno, altrimenti anno della fattura;
- **fatturato** = somma degli importi delle righe (fatture e righe non cancellate) con quel capitolo ed esercizio, più il numero di fatture;
- **impegnato** = somma degli importi degli impegni del capitolo nell'esercizio, più il numero di impegni e quanti sono senza importo (oggi tutti e 12: l'impegnato vale 0 finché la ragioneria non li completa, e la scheda lo dice: "2 impegni senza importo");
- **disponibile** = assestato − impegnato (solo se c'è l'assestato);
- **oltre l'assestato** = assestato presente e (impegnato > assestato oppure fatturato > assestato).

Esercizio in corso = anno della data odierna.

## Backend

- `apis/spending/chapter-year.ts` (nuovo): calcolo condiviso tra spesa e anomalie. Funzioni pure di unione (riga di bilancio + impegni + fatturato → `ChapterYear`) e `chaptersYearSummary(query, year)` per tutti i capitoli di un esercizio, con le stesse tre query raggruppate.
- `apis/spending/`: `forChapter(chapterId)` → righe per esercizio `{year, spending_id, initial_budget, adjusted_budget, recorded_spending, notes, committed, commitments, commitments_without_amount, invoiced, invoices, available, over_budget}`. Esercizi = unione degli anni con una riga di bilancio, un impegno o una riga fattura, più l'esercizio in corso; ordinati dal più recente.
- `apis/spending/`: `chapterInvoiceLines(chapterId)` → righe fattura del capitolo (fattura, data, fornitore, utenza, importo, esercizio), dalla più recente; `chapterCommitments(chapterId)` → impegni del capitolo con contratto e fornitore.
- `apis/spending/`: `budgetCheck({invoice_id?, invoice_date, lines})` → per ogni capitolo + esercizio toccato dalle righe (capitolo e esercizio risolti lato backend con le regole sopra), fatturato delle altre fatture + righe inviate, avviso se supera l'assestato. Così la scheda fattura non deve conoscere i capitoli delle utenze.
- Endpoint: `GET /budget-chapters/:id` (oggi manca, serve alla scheda aperta dal navigatore), `GET /budget-chapters/:id/years`, `GET /budget-chapters/:id/invoice-lines`, `GET /budget-chapters/:id/commitments`, `GET /spending/chapters?year=` (riepilogo dell'esercizio per l'elenco), `POST /spending/budget-check`.
- `budget-chapter-spending`: DTO con i due importi nuovi, `amount` facoltativo, controllo "almeno un importo".
- Anomalie (`anomalies.service.ts`), sull'esercizio in corso:
  - `chapters_over_budget`: capitoli non cancellati oltre l'assestato (con assestato, impegnato, fatturato);
  - `chapters_without_budget`: capitoli non cancellati usati nell'esercizio (almeno un'utenza attiva con quel capitolo, o un impegno dell'esercizio) senza assestato dell'esercizio.
- Test jest scritti prima: calcoli di `forChapter` (capitolo dall'impegno o dall'utenza, esercizio dall'impegno o dalla fattura, cancellati esclusi, esclusione della fattura), validazione "almeno un importo", SQL delle due anomalie.

## Frontend

### Scheda capitolo (shell `entity-sheet`)

Aperta con `openSheet()` dall'elenco e con `EntityNavigatorService.openBudgetChapter(id)` (nuovo; usato dal Log modifiche; i collegamenti dalle altre schede che mostrano un capitolo restano per un giro successivo). Anche la creazione al volo (`createBudgetChapter`) passa alla scheda: in creazione è attivo solo il Riepilogo.

- **Intestazione**: "Capitolo 12332/0", descrizione, tipi utenza; badge dell'esercizio in corso: "Disponibile € …" (ok), "Oltre l'assestato" (danger), "Assestato non indicato" (neutro).
- **Riepilogo**: i campi del capitolo (codice, articolo, PDC, tipi utenza, descrizione: come oggi), il riquadro dell'esercizio in corso (stanziamento iniziale, assestato, impegnato, fatturato, disponibile) e le anteprime Utenze (conteggio per tipo), Impegni, Fatture, che portano ai tab.
- **Utenze**: il tab attuale (riepilogo consumi per tipo + tabella utenze dell'elenco Utenze, con colonne, dettaglio ed export), invariato.
- **Impegni**: contratto (fornitore, CIG), esercizio, numero, importo; apre il contratto.
- **Fatture**: righe fattura del capitolo (numero e data, fornitore, utenza, esercizio, importo); apre la fattura.
- **Esercizi** (sostituisce "Spesa storica"): tabella per anno con stanziamento iniziale, assestato, impegnato ("2 senza importo"), fatturato (n. fatture), spesa ragioneria, disponibile, note; riga oltre l'assestato evidenziata. "Nuovo esercizio" e modifica della riga con il dialog esistente (`spending-edit-dialog`) esteso ai due importi nuovi, tutti facoltativi ma almeno uno. Solo Admin/Operatore.
- **Storico**: `app-entity-history` su `budget_chapters`.

### Elenco capitoli

Segnalazioni (`app-list-signals`, come utenze e contratti): "Oltre l'assestato" e "Senza assestato dell'anno". Colonne nuove facoltative: "Assestato {anno}", "Disponibile {anno}" (dal riepilogo dell'esercizio in corso, da `GET /spending/chapters?year=`: una chiamata per l'elenco, non una per riga).

### Dashboard

Due voci nel riquadro anomalie, con clic sulla scheda capitolo.

### Avviso nella scheda fattura

Per ogni capitolo + esercizio toccato dalle righe della fattura (`POST /spending/budget-check`): fatturato delle altre fatture + righe correnti > assestato → avviso sotto le righe: "Capitolo 12332/0: con questa fattura il fatturato 2026 supera l'assestato (€ … su € …)". Nessun blocco, nessun avviso se l'assestato non c'è. Ricalcolato quando cambiano righe, importi o impegni.

## Verifica

- Jest backend (vedi sopra), CI.
- Migration: up → down → up con confronto dei dati della spesa storica.
- E2E Playwright: scheda capitolo (tab, navigazione verso utenza/contratto/fattura e ritorno), inserimento assestato e badge, segnalazioni in elenco e dashboard, avviso sulla fattura (fattura di prova, poi cancellata), Lettore in sola lettura. Utente temporaneo e dati di prova eliminati.

## Rilascio

Minor (migration additiva): v1.14.0. Nessun dato da sistemare prima. Gli assestati 2026 li inserisce la ragioneria/l'utente dalla scheda; finché mancano, la segnalazione "Capitoli senza assestato" li elenca.
