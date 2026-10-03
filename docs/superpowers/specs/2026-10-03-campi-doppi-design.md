# Campi doppi e ambigui (roadmap voce 18, parte 2)

Data: 2026-10-03. Release prevista: v1.9.1.

## Obiettivo

Togliere i campi che duplicano un'informazione o la rendono ambigua, emersi dall'analisi della voce 18. Decisioni prese con l'utente il 2026-10-03.

## Modifiche

1. **Indirizzo di fornitura** (`utilities.supplier_address`, 328 utenze): resta, serve per i contatori senza immobile né impianto. Sul DB locale si svuota dove l'utenza è collegata a un immobile o a un impianto e l'indirizzo coincide con quello dell'immobile o dell'impianto (confronto normalizzato: minuscole, senza "via"/"viale"/"piazza" e spazi doppi). Etichetta UI invariata ("Indirizzo Fornitura").
2. **Coordinate dell'utenza**: restano (contatori fuori da immobile e impianto). Nessuna modifica.
3. **Note**: `additional_notes` (107) e `specifications` (81) confluiscono in `notes`, in coda con etichetta ("Note aggiuntive: …", "Specifiche: …"), sul DB locale; poi migration che fa drop delle due colonne; tolti da entity, DTO, scheda, elenco, export.
4. **Deposito cauzionale** (`security_deposit`): colonna nullable senza default; sul DB locale gli 0,00 diventano NULL ("non noto"). UI: campo vuoto = non noto.
5. **`utility_code`**: etichetta UI "Codice cliente fornitore" (scheda, elenco, filtri, export). Nessuna modifica di schema.
6. **Ordini Consip**: l'unico `contracts.order_number` valorizzato passa in `consip_order` (se vuoto, altrimenti in coda) sul DB locale; migration drop di `order_number`; tolto da entity, DTO, scheda, elenco, export.
7. **FK di `invoice_budget_chapter`**: `schema:log` propone di rifarle; verificare se nasce dalla doppia definizione (entity `InvoiceBudgetChapter` + `@JoinTable` su `Invoice`) e allineare, senza cambiare lo schema reale.

Fuori: `budget_chapters.supply_type` (voce 17), `utility_types` (rimandato), `associated_building` (voce 4), catasto (voce 2).

## Migration

Solo schema, con controllo preliminare leggibile prima di ogni DDL:

- `MergeUtilityNotes`: si ferma se `additional_notes` o `specifications` hanno ancora valori (vanno prima uniti in `notes`); poi drop delle due colonne. `down()` le ricrea vuote.
- `SecurityDepositNullable`: `MODIFY security_deposit decimal NULL DEFAULT NULL`. `down()` rimette NOT NULL DEFAULT 0 con `UPDATE … SET 0 WHERE NULL` prima.
- `DropContractOrderNumber`: si ferma se `order_number` ha ancora valori; poi drop. `down()` la ricrea vuota.

**Produzione** (lezione di v1.9.0: la migration `InvoiceBudgetChapterFk` si è fermata in produzione sulle righe orfane pulite solo in locale): le migration che si fermano su dati da sistemare richiedono di importare il DB locale *prima* di aggiornare le immagini, oppure di lanciare in produzione le stesse pulizie. Le note di rilascio lo dicono esplicitamente.

## Test

- Spec delle migration con `QueryRunner` simulato (si ferma con valori presenti, procede con colonne vuote).
- Ciclo reale up → down → up sul DB locale.
- E2E: scheda utenza (note unite, deposito vuoto salvato come vuoto, "Codice cliente fornitore"), scheda contratto senza "Numero ordine", Salva senza 400.

## Documentazione

- `CLAUDE.md`: gotcha migration che si fermano su dati puliti solo in locale.
- Roadmap: voce 18 parte 2 fatta, esito dati.
