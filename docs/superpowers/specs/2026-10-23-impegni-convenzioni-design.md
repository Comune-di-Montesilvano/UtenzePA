# Impegni contabili veri, scheda convenzione, import impegni e capitoli 2026

Data: 2026-10-23. Stato: design approvato in chat, da pianificare.

## Perché

Gli impegni servono soprattutto per le **previsioni di spesa**: sapere se gli impegni dell'anno basteranno e quanto impegnare l'anno dopo, partendo dallo storico. Il ragionamento è macro (capitolo × anno), ma la **rimanenza del singolo impegno** si vede solo sapendo quanto ci è già stato speso sopra: per questo ogni riga di fattura deve pesare su un impegno preciso.

Oggi il modello (v1.10.0) ha un impegno = un contratto + capitolo + esercizio, unico, e nel DB locale ci sono solo impegni di prova (contratto 1 ACA, `PROVA-1`). Nella contabilità invece:

- un impegno nasce da una determina (es. adesione a una convenzione Consip) e copre **più contratti** (gli ordinativi della convenzione, ciascuno con il suo CIG derivato): è legittimo (art. 183 TUEL, principio 4/2 D.Lgs. 118/2011, impegno automatico art. 183 c. 2 lett. c per i contratti di somministrazione);
- sullo stesso fornitore + capitolo + anno ci sono spesso **più impegni** (determine diverse, integrazioni: es. 13506/2026 = 521, 1886, 1891);
- l'impegno ha un numero contabile `anno/num/prg` (prg = sub-impegno: 2026/514/1 A2A e 2026/514/2 HERA sono due impegni distinti).

Questo è il **progetto 1**. La stima a fine anno e la cifra suggerita per l'anno dopo sono il **progetto 2**, da progettare dopo l'import, sui dati veri.

## Obiettivi

1. Impegno con numero contabile, capitolo, anno di competenza, importo, fornitore, e **zero o più contratti** collegati (N-N).
2. Più impegni per stesso contratto + capitolo + esercizio.
3. Le righe di fattura consumano gli impegni **in ordine di numero**; si può sempre scegliere a mano.
4. **Rimanenza** per impegno (importo − righe assegnate) e, sommata, per capitolo × anno.
5. **Scheda convenzione** come le altre schede entità, con tab dei contratti collegati e degli impegni.
6. **Import una tantum** sul DB locale degli impegni 2026 e dei capitoli 2026 dagli export della contabilità (`.audit-w/Impegni 2026.csv`, `.audit-w/capitoli 2026.csv`); produzione = export + import del DB, come sempre.

## Non obiettivi

- Stima/previsione (progetto 2).
- Import ricorrente dalla contabilità: l'import è una tantum, poi gli impegni si gestiscono dalla UI. **Nessun codice di import nel repo** (regola del progetto, `docs/claude/data.md`): script fuori repo, nello scratchpad.
- Salvare la `Disponibilità` della contabilità: con un import una tantum invecchia subito. La rimanenza è solo quella calcolata da UtenzePA (include anche fatture arrivate e non ancora liquidate).
- Spese condominiali (13911, 15058…), banche dati (`1.03.02.05.003`), altri capitoli fuori da luce/acqua/gas/telefonia.
- Residui con competenza prima del 2024 (2016–2023 restano fuori), impegni annullati (`Annull.=A`).
- Capitoli rinumerati (11188→14091, 11201→11407, 11218→11408): restano come sono, gli impegni sui numeri vecchi non si importano.

## Anti-obiettivi

- Indovinare un abbinamento impegno → contratto: i casi dubbi finiscono in un elenco da rivedere, mai assegnati a caso.
- Somme di "impegnato" gonfiate: un impegno su N contratti conta **una volta** nel capitolo.
- Toccare una scelta manuale dell'utente sulla riga di fattura con il consumo automatico.

## Modello dati

### Impegno (`budget_commitments`)

- Nuove colonne: `commitment_year` (int, anno dell'impegno in contabilità, primo `anno` del CSV), `commitment_num` (int), `commitment_sub` (int, il `prg`, default 1), `supplier_id_fk` (soggetto terzo, nullable).
- `fiscal_year` resta = **anno di competenza** (secondo `anno` del CSV): un impegno 2026/530 con competenza 2027 ha `fiscal_year = 2027`.
- `commitment_number` (stringa libera) viene sostituito dai tre campi strutturati; la migration porta gli eventuali valori esistenti nelle note (oggi solo `PROVA-1`, dato di prova). Etichetta mostrata: `2026/514/1` (sub omesso se 1? → decisione del builder, purché coerente ovunque).
- Unicità (nel service, tra i non cancellati, come oggi): `commitment_year + commitment_num + commitment_sub`. Numero facoltativo per impegni inseriti a mano senza numero: in quel caso nessun vincolo.
- `contract_id_fk` diventa N-N: nuova tabella `budget_commitment_contracts (commitment_id, contract_id)`. La migration copre le righe esistenti. Zero contratti ammessi (l'impegno conta comunque nel capitolo; per esempio E-Distribuzione senza contratto).
- Tolta l'unicità contratto + capitolo + esercizio (`ensureFree`).
- `amount` resta = importo definitivo (`Importo Defin.`).

### Capitolo (`budget_chapters`)

- Nuova colonna `notes` (text, nullable): note locali che oggi stanno dentro la descrizione (es. "incluso via mincio", "incluso app. condiviso", "SERVIZIO UFF. TECNICO").

### Riga di fattura (`invoice_lines`)

- Nuova colonna `commitment_auto` (boolean): `true` = impegno assegnato dal consumo automatico, ricalcolabile; `false` = scelto a mano, mai toccato. Una riga senza impegno è `commitment_auto = true` (candidata all'assegnazione).

## Consumo automatico degli impegni

Regola (confermata): **in ordine di numero**.

- **Esercizio della riga = competenza effettiva** (deciso): anno del periodo della riga (`period_start`/`period_end`); periodo a cavallo d'anno = anno con più giorni del periodo, in parità l'anno di fine (*decisione mia*); solo inizio o solo fine = quell'anno; senza periodo = anno della data fattura. Esempio: bolletta di gennaio 2026 per dicembre 2025 → impegni con competenza 2025 (residui). Cambia anche il fallback di `LINE_YEAR` in `chapter-year.ts` (oggi `YEAR(i.invoice_date)`) e la scelta dell'esercizio in `invoice-matcher.service.ts`: stessa funzione, gemella SQL/TS.
- Per una riga di fattura con utenza: contratto della riga (come oggi: dall'utenza/fattura) → impegni non cancellati collegati a quel contratto, con capitolo = capitolo dell'utenza ed esercizio = esercizio della riga.
- Senza utenza (canoni/servizi del contratto in testata, v1.45.0): impegni del contratto nell'esercizio, qualsiasi capitolo; se più capitoli → nessuna assegnazione + segnalazione (come oggi `MISSING_COMMITMENT` "più impegni").
- Ordine: `commitment_year, commitment_num, commitment_sub`; gli impegni senza numero dopo, per id.
- Le righe si scorrono in ordine di data fattura (poi id). Ogni riga va **per intero** sul primo impegno con rimanenza > 0 al momento; se tutti sono esauriti va sull'ultimo (rimanenza negativa = sforamento visibile) e si segnala. *Decisione mia*: nessuno spezzamento di una riga su due impegni.
- Le righe `commitment_auto = false` contano nella rimanenza ma non si spostano.
- Ricalcolo: servizio di riconciliazione (sul modello di `SupplyReconcileService`) dopo ogni salvataggio di impegno (creazione, modifica importo/contratti/capitolo/esercizio, cancellazione), di fattura e dopo l'import da PEC, più a ogni avvio. Riassegna solo le righe `commitment_auto = true` dei gruppi contratto + capitolo + esercizio toccati. Scrittura di sistema: non tocca "Ultima modifica" della fattura (`update_date: () => '`update_date`'`).
- Scelta manuale dalla riga di fattura (select "Impegno" già esistente in `invoice-lines-tab`) → `commitment_auto = false`. Serve un modo per tornare all'automatico (es. voce "Automatico" nella select).
- L'import fatture da PEC (`InvoiceMatcher`/`InvoiceApplier`) non sceglie più l'impegno da sé: lascia la riga `auto` e il ricalcolo la assegna. `MISSING_COMMITMENT` resta quando non esiste alcun impegno per contratto + capitolo + esercizio.
- Eliminazione impegno: oggi bloccata se usato da righe. Nuovo comportamento: bloccata solo se ci sono righe **manuali** su quell'impegno; le automatiche si riassegnano. (Il conteggio deve escludere le fatture cancellate: bug noto in roadmap.)

## Rimanenza e somme

- Per impegno: importo, speso (somma righe assegnate, fatture non cancellate e non rifiutate: `NOT_REJECTED_SQL`), rimanenza = importo − speso (null se importo null).
- Per capitolo × anno (`apis/spending/chapter-year.ts`): impegnato = somma degli impegni del capitolo nell'esercizio, **ogni impegno una volta** anche se ha N contratti (oggi `COMMITMENTS` joina il singolo contratto: va rivisto per la N-N; un impegno con zero contratti conta). Fatturato come oggi. Aggiungere "rimanenza impegni" = somma delle rimanenze.
- Anomalie in `apis/anomalies/` che leggono `budget_commitments.contract_id_fk` (righe ~390, ~433, ~720): da riscrivere sulla tabella N-N. Nuova segnalazione: impegni sforati (rimanenza < 0) nell'esercizio in corso.

## UI

### Impegno

- Form impegno (oggi `pages/contracts/commitments/commitment-edit-dialog`): numero (anno / num / sub), capitolo, anno di competenza, importo, fornitore, contratti (multi-select, `app-multi-select`, "solo del fornitore" se valorizzato), note.
- Tab "Impegni" del contratto: elenco degli impegni collegati con importo, speso, rimanenza.
- Scheda capitolo, tab anni (`budget-chapter-years-tab`): impegni dell'anno con rimanenza.
- **Maschera impegni** (deciso), come Fatture e Capitoli: elenco (`app-list-filters`, `app-list-toolbar`, filtri in `pages/<entità>/<entità>-filters.ts`) con colonne numero, capitolo, competenza, fornitore, contratti, importo, speso, rimanenza; filtri anno di competenza, capitolo, fornitore, convenzione, contratto; segnalazioni (`app-list-signals`) "Sforati" (rimanenza < 0), "Senza contratto", "Senza importo". Voce di menu accanto a Fatture/Capitoli.
- **Scheda impegno** (shell `entity-sheet`, `EntityNavigatorService`): tab **Dati** (numero, capitolo, competenza, importo, fornitore, note), **Contratti** (`app-linked-table`, collega/scollega/crea al volo), **Fatture** (righe che lo consumano: fattura, data, periodo, utenza, importo, automatica/manuale, speso progressivo), **Documenti** (`app-entity-documents`, nuovo `entity_type` per l'impegno).
- I tab "Impegni" di contratto, capitolo (anni) e convenzione diventano `app-linked-table` che aprono la scheda impegno; il dialog `commitment-edit-dialog` viene sostituito dalla scheda.

### Scheda convenzione (`pages/consip-agreement/`)

Oggi è un dialog semplice. Diventa una scheda entità come le altre (shell `core/components/entity-sheet/`, apertura con `openSheet()`/`EntityNavigatorService`, regole in CLAUDE.md "Schede entità"):

- **Dati**: nome, descrizione, CIG master, fornitore, scadenza, salvaguardia.
- **Contratti**: `app-linked-table` con gli ordinativi collegati (`contracts.consip_agreement_id`): numero ordine, CIG derivato, periodo, stato. Apri, collega, scollega (con conferma), crea al volo.
- **Impegni**: impegni collegati ai contratti della convenzione, con importo, speso, rimanenza e totale.
- **Documenti**: `app-entity-documents` (determina di adesione…). Richiede `consip_agreement` tra gli `entity_type` degli allegati.

### Capitolo

- Campo note nel form capitolo.

### Guida

Aggiornare `frontend/public/guida/guida.md` (impegni, consumo in ordine di numero, scelta manuale, scheda convenzione) con la data in testa.

## Import una tantum (DB locale, script fuori repo)

Solo dopo il rilascio della feature sul DB locale. Autore = utente di sistema (-1). Report di ogni scarto in un file nello scratchpad da rivedere con l'utente prima di scrivere.

### Capitoli (`capitoli 2026.csv`, cp1252, `;`)

- Perimetro: PdC `1.03.02.05.*` luce/acqua/gas/telefonia (`.001`, `.002`, `.004`, `.005`, `.006`, `.000`/`.999` solo se la descrizione è di luce/acqua/gas/telefonia) + `1.03.02.16.*` telefonia; esclusi condominiali (`.007`) e banche dati (`.003`).
- Capitoli già nel DB (52, chiave `chapter_code + article`): descrizione = quella ufficiale; la vecchia, se diversa, va in `notes`. PdC: resta quello del DB, il CSV lo riempie solo se manca (11227).
- Capitoli nuovi: solo quelli del perimetro con assestato > 0 o con impegni importati (es. 12331/0, 14521/0, 13504/2, 15324/4, 13244/0, 10907, 12441, 10500…). Tipi utenza ammessi: da decidere caso per caso nel report.
- `budget_chapter_spending` 2026: `initial_budget = Stanziamento`, `adjusted_budget = Assestato` (aggiorna la riga esistente del 10618, crea le altre). `amount` ("Spesa ragioneria") non toccato.

### Impegni (`Impegni 2026.csv`, cp1252, `;`, campi multilinea, colonna `anno` ripetuta)

- Chiave: `anno` (1°) + `sigla` + `num.` + `prg.` (univoca nel file). Nel perimetro `sigla = 1`.
- Filtri: capitolo nel perimetro (dopo l'import capitoli), `Annull. = N`, competenza (2° `anno`) ≥ 2024.
- Campi: `commitment_year/num/sub` = anno/num/prg, `fiscal_year` = 2° anno, capitolo da `capit./art.`, `amount = Importo Defin.`, fornitore da `P. IVA`/`cod. Fiscale` su `third_parties`, note = descrizione + determina (`n deter`/`d deter`) + CIG dell'impegno.
- Contratti, in quest'ordine:
  1. CIG dell'impegno = CIG di un contratto (derivato) → quel contratto;
  2. CIG dell'impegno = CIG di una convenzione (dal file: B62074DDC1 Gas 17 lotto 8 Dolomiti, B42E6252B0/B6757A65EE Gas 16 lotto 8 AGSM, BB41E53322 Gas ID2958 Magis, …) → contratti della convenzione (`consip_agreement_id`) attivi nell'esercizio; il CIG va anche in `consip_agreement.cig_master` (oggi tutti `MANCANTE`);
  3. senza CIG → contratti del fornitore con utenze sul capitolo e attivi nell'esercizio (es. ACA → contratto 1; A2A ID2880 determina 247 → contratti della convenzione EE 23);
  4. nessun candidato o candidati ambigui → impegno importato con zero contratti e riga nel report.
- I 13 impegni di prova attuali: cancellati prima dell'import (verificare che nessuna riga di fattura li usi; se sì, le righe tornano `auto`).
- Dopo l'import: ricalcolo del consumo su tutte le righe, poi confronto per capitolo tra speso UtenzePA e `Importo Defin. − Disponibilità` della contabilità come verifica di plausibilità (solo report).

## Vincoli

- Migration: generate nel container, solo gli statement della feature, scratch path → `src/database/migrations/`, ciclo up → down → up sui dati (sposta `contract_id_fk` nella N-N). Versione minor (v1.47.0).
- Niente HTTP 409: duplicati = 400 con messaggio.
- `NOT_REJECTED_SQL` in ogni query su `invoices`.
- Nessun dato personale in repo/test (nomi fittizi).
- Spec anomalie a mock posizionali: query nuove in fondo.

## Lasciato al builder

- Nomi esatti di colonne/tabelle/endpoint, struttura del servizio di riconciliazione, formato dell'etichetta numero.
- Dettaglio dei filtri e delle colonne nelle nuove tabelle.
