# Fatture per utenza e impegni di spesa (roadmap voci 6 e 17)

Data: 2026-10-05. Release prevista: v1.10.0.

## Obiettivo

Avere la spesa reale per utenza, immobile e capitolo, e preparare il modello per l'import massivo futuro (FatturaPA, tracciati dei fornitori). Le fatture si legano alle utenze con righe; il capitolo arriva da un **impegno di spesa** (contratto di fornitura + capitolo + esercizio). Decisioni prese con l'utente il 2026-10-05:

- impegni: per ora basta contratto ↔ capitolo per esercizio; numero e importo impegnato facoltativi, inseriti a mano quando la ragioneria li fornisce;
- fattura = testata + righe per utenza, con tutto facoltativo sulla riga tranne l'importo ("ogni fornitore fa a modo suo");
- in questo giro modello, API e UI con inserimento manuale; le fatture ACA 2025–2026 si caricano una tantum sul DB locale; import FatturaPA in un giro successivo;
- capitolo dell'utenza tra quelli impegnati sui suoi contratti: proposta nel select + anomalia, nessun blocco;
- importi delle righe IVA inclusa (costo per il Comune).

Fuori: import FatturaPA/tracciati, consumi da fattura nel tab Consumi (il consumo resta sulla riga), schede complete di fornitori e capitoli (voce 14), modifica di `budget_chapter_spending`.

## Modello dati

### `budget_commitments` (nuova)

| Colonna | Tipo | Note |
|---|---|---|
| `id` | int PK | |
| `contract_id_fk` | int, NOT NULL, FK `contracts` | contratto di fornitura |
| `budget_chapter_id_fk` | int, NOT NULL, FK `budget_chapters` | |
| `fiscal_year` | int, NOT NULL | esercizio |
| `commitment_number` | varchar(50), null | numero impegno della ragioneria |
| `amount` | decimal(14,2), null | importo impegnato |
| `notes` | text, null | |
| audit | | `create_date`, `update_date`, `created_by_user_id`, `updated_by_user_id`, `deleted` |

Unicità di contratto + capitolo + esercizio tra le righe non cancellate: controllo nel service (400 "Impegno già presente per questo capitolo ed esercizio"), non indice UNIQUE (le righe cancellate restano).

### `invoices` (testata, esistente)

- nuova `supplier_id_fk` (int, null, FK `third_parties`): fornitore; se manca e c'è il contratto, il service lo prende dal contratto;
- nuova `total_amount` (decimal(18,2), null): totale documento IVA inclusa;
- `net_amount_excl_vat` diventa nullable senza default (imponibile non noto, es. ACA);
- invariati: `invoice_id` (numero), `invoice_date`, `protocol_number`, `last_invoice_arrears`, `notes_on_invoices`, `contratto_id_fk` (già nullable);
- eliminati: relazione `budget_chapters` (`@ManyToMany`) e entity/tabella `invoice_budget_chapter` (0 righe).

### `invoice_lines` (nuova)

| Colonna | Tipo | Note |
|---|---|---|
| `id` | int PK | |
| `invoice_id_fk` | int, NOT NULL, FK `invoices` ON DELETE CASCADE | |
| `amount` | decimal(14,2), NOT NULL | importo IVA inclusa |
| `utility_id_fk` | int, null, FK `utilities` | |
| `commitment_id_fk` | int, null, FK `budget_commitments` | |
| `period_start`, `period_end` | date, null | periodo fatturato |
| `consumption` | decimal(14,3), null | unità del tipo di utenza |
| `supply_code` | varchar(50), null | POD/PDR/codice cliente come in fattura |
| `description` | varchar(255), null | |

Nessun audit né soft delete: le righe si sostituiscono in blocco col salvataggio della fattura.

### Regole

- Se la fattura ha un contratto, l'impegno di ogni riga deve appartenere a quel contratto (400 "L'impegno della riga N non è del contratto della fattura").
- `period_end` ≥ `period_start` se entrambi presenti (400).
- La somma delle righe può differire dal totale documento: la scheda mostra la differenza, non blocca.
- Spesa per capitolo: righe con impegno → capitolo dell'impegno; righe senza impegno → capitolo dell'utenza, se c'è; altrimenti "senza capitolo". Anno = esercizio dell'impegno, altrimenti anno della data fattura.
- `budget_chapter_spending` (spesa storica 2022–2024) resta separata e invariata.

### Migration `FatturePerUtenzaImpegni`

Solo schema, nessuno spostamento dati. Controllo preliminare: si ferma se `invoice_budget_chapter` ha righe (vanno ripensate a mano prima). Poi: create `budget_commitments`, create `invoice_lines`, add `invoices.supplier_id_fk` + FK, add `invoices.total_amount`, modify `net_amount_excl_vat` nullable senza default, drop `invoice_budget_chapter`. `down()` inverso (ricrea `invoice_budget_chapter` vuota con le sue FK; riporta `net_amount_excl_vat` NOT NULL DEFAULT 0 dopo `UPDATE … SET 0 WHERE NULL`).

Le 185 fatture esistenti restano testate senza righe; il loro `supplier_id_fk` si valorizza sul DB locale dal contratto (intervento una tantum) e arriva in produzione con l'export.

## Backend

Modulo nuovo `apis/budget-commitments/` e estensione di `apis/invoices/`.

- **Impegni**: `GET /contracts/:id/commitments` (con capitolo), `POST /contracts/:id/commitments`, `PATCH /commitments/:id`, `DELETE /commitments/:id` (soft delete; 400 "Impegno usato da N righe fattura" se referenziato). Ruoli come i contratti.
- **Fatture**:
  - `GET /invoices/:id` con righe (utenza con tipo, impegno con capitolo) e fornitore;
  - `POST`/`PATCH /invoices` accettano `lines: CreateInvoiceLineDto[]`; in transazione: salva testata, cancella le righe esistenti, inserisce le nuove (stesso schema degli immobili collegati all'utenza); `lines` assente nel PATCH = righe invariate;
  - filtri elenco: `utility_id`, `supplier_id_fk`; colonne calcolate nell'elenco: capitoli (dagli impegni delle righe), numero utenze;
  - audit log: testata come oggi; per le righe una voce `lines` con il conteggio prima/dopo.
- **Spesa calcolata** (solo lettura, query aggregate su `invoice_lines` di fatture non cancellate):
  - `GET /utilities/:id/spending` → per anno: totale, numero fatture;
  - `GET /assets/:id/spending` → per anno, somma delle utenze collegate all'immobile (un'utenza su più immobili conta intera su ciascuno);
  - `GET /contracts/:id/chapters-summary` → per capitolo: utenze attive del contratto con quel capitolo, impegni per esercizio (con importo se presente), speso da fatture per anno.
- **Anomalie** (`apis/anomalies/`):
  - "Fatture su utenze cessate": righe di fatture con data negli ultimi 12 mesi su utenze con `supply_active = 0`;
  - "Utenze con capitolo non impegnato sul contratto": utenze attive con capitolo, su un contratto aperto che ha almeno un impegno, quando il capitolo non è tra gli impegni di quel contratto;
  - "Righe fattura senza utenza".
- Date: `@DateOnly()` su `period_start`/`period_end` e sulla data fattura (convenzione unica delle date, PR #185).

## Frontend

- **Scheda contratto di fornitura**: tab nuovo "Impegni e capitoli": in alto il riepilogo per capitolo (utenze, impegnato e speso per anno; capitoli delle utenze senza impegno evidenziati), sotto l'elenco impegni con aggiungi/modifica/elimina (dialog: capitolo, esercizio, numero, importo, note; "Elimina" con conferma).
- **Scheda utenza**: tab nuovo "Fatture" (righe dell'utenza: data, numero, periodo, consumo, importo, capitolo; clic apre la fattura) con totale per anno. Select del capitolo: gruppo "Impegnati sui contratti" in cima (capitoli degli impegni dei contratti aperti dell'utenza), poi gli altri.
- **Scheda immobile**: nel Riepilogo riquadro "Spesa da fatture" per anno (nota se ci sono utenze condivise con altri immobili).
- **Fattura**: il dialog attuale diventa scheda (`openSheet`, shell `entity-sheet`): Riepilogo (testata: numero, data, protocollo, fornitore, contratto, totale documento, imponibile, insoluto, note) e tab "Righe" (tabella modificabile: utenza con ricerca anche per codice/POD, impegno filtrato sul contratto, periodo, consumo, importo, codice fornitura, descrizione; somma righe e differenza dal totale documento). Il capitolo N-N sparisce dal form.
- **Elenco fatture**: colonna "Capitoli" calcolata dalle righe, colonna "Utenze" (conteggio), filtro per utenza e fornitore.
- **Dashboard**: le tre anomalie nuove, con link alla scheda.

## Dati (DB locale, una tantum, script fuori dal repo in `.audit-w/`)

Fonte `aca_fatture_2025_2026.json` (490 fatture; abbinamento come in `aca_pulizia.py`: codice servizio su `utilities.utility_id`, o `utility_code` per le utenze vecchie; capitolo su codice + articolo). Verifica 2026-10-05: 490/490 utenze trovate, tutte sul contratto 1, 8 su utenze cessate, 489 con capitolo presente nel DB, 118 con capitolo diverso da quello attuale dell'utenza.

1. Impegni: uno per contratto 1 × capitolo × anno delle fatture (2025, 2026), senza numero né importo.
2. Fatture: testata (numero, data, fornitore ACA, contratto 1, `total_amount` = `tot`, imponibile e insoluto vuoti) + una riga (utenza, impegno del capitolo e anno, `amount` = `tot`, `supply_code` = codice servizio). La fattura senza capitolo ha la riga senza impegno. Deduplica per numero fattura + fornitore.
3. `supplier_id_fk` delle 185 fatture esistenti dal loro contratto.

Produzione: export del DB locale e import dopo il deploy della release (note di rilascio).

## Verifica

- Jest: sostituzione righe in transazione (anche rollback su errore), regola impegno ↔ contratto, unicità impegno, impegno usato non eliminabile, aggregati di spesa (impegno vs capitolo utenza, anno), le tre anomalie.
- Migration: ciclo up → down → up sul DB locale, confronto schema.
- E2E Playwright: impegni dalla scheda contratto; fattura con due righe salvata due volte (date invariate, righe invariate); tab Fatture dell'utenza; select capitolo con il gruppo degli impegnati; anomalie in dashboard.
