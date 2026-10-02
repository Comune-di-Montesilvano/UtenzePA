# Soggetti terzi (controparti + fornitori) — design

Data: 2026-10-02 · Roadmap patrimonio, voce 9

## Obiettivo

Un'unica anagrafica **Soggetti terzi** (persona fisica o giuridica) al posto di controparti (`utilizer`) e fornitori (`suppliers`). Il ruolo (fornitore, locatore, conduttore) non è un campo: si ricava dai collegamenti. È la base delle voci 12 (costi a carico calcolato: paga il Comune o il soggetto del contratto immobiliare), 6 (fatture per utenza) e 14 (scheda fornitori, coperta qui).

Principi decisi:

- collegamenti sempre per **id** interno;
- identificativo fiscale **obbligatorio e unico**: P.IVA per i soggetti giuridici, codice fiscale per le persone fisiche. Un soggetto = un record;
- dati storici senza identificativo: migrati lo stesso, ma la scheda non salva finché non lo si inserisce (obbligo nella validazione, colonna nullable nel DB);
- niente codice legacy: l'importatore Access si elimina (PR separata, prima di questa), la pulizia dei dati si fa a mano una volta sola, non con codice.

Fuori scope: fatture per utenza (voce 6), pagatore calcolato e rimozione del tab Controparti della scheda utenza (voce 12), schede di capitoli e fatture (voce 14).

## Contesto (DB locale, 2026-10-02)

- `utilizer`: 212 righe attive (102 soft-deleted), nessuna con codice fiscale, 35 con contatti in testo libero. Referenziata solo da `utilizer_grant.utilizer_id_fk` (129 contratti attivi, tutti con controparte).
  - 103 collegate a un contratto: quasi tutte soggetti veri; ~15 non lo sono ("CANILE COMUNALE", "SPRAR", "LOCALI EX FEA", "PUBBLICO PINETA E CONCESSIONARIO CHIOSCO", "appartamento locato da settore amministrativo", "Locatore autoparco via Danubio (da completare)"…).
  - 109 senza contratto: nessuna è un soggetto (fontane, semafori, pompe, casette dell'acqua, note di lavoro, usi), già coperte dalla voce 3 (impianti).
  - Righe con più persone: "Mosca Marco e Giovanna", "Colangelo/Giancaterino", "De Flaviis Remo e Cicerone Angela", "Di Donato Maria Teresa e Cristina", "Ruffa/Pace", "Colazilli Giacinto e Teresa".
  - Doppioni: "VODAFONE (ex OMNITEL)" / "VODAFONE OMNITEL N. V.".
- `suppliers`: 13 righe, 5 con P.IVA. `supplier_id` è una sigla inserita a mano, usata come etichetta in tutta la UI. Pseudo-fornitori: `TERZI` (2 convenzioni CONSIP), `ACA_TERZI` e `comune` (nessun uso).
- FK: solo `contracts.supplier_id_fk` è dichiarata; `consip_agreement.supplier_id` punta a `suppliers` senza FK.
- Id disgiunti: `utilizer` 961–1274, `suppliers` 42–54.

## Modello dati

### `third_parties`

| Colonna | Tipo | Note |
|---|---|---|
| `id` | int PK | id originali di `utilizer` e `suppliers` conservati |
| `type` | enum `NATURAL`/`LEGAL` | |
| `company_name` | varchar(255) null | giuridica |
| `last_name`, `first_name` | varchar(100) null | fisica |
| `vat_number` | varchar(20) null, **unique** | |
| `tax_code` | varchar(16) null, **unique** | |
| `address`, `city`, `postal_code` | null | |
| `email`, `pec`, `phone` | null | |
| `contacts` | text null | referente, recapiti in testo libero |
| `notes` | text null | |
| audit (`create_date`, `update_date`, `created_by_user_id`, `updated_by_user_id`), `deleted` | | come le altre entity |

Il vincolo unique vale anche sulle righe soft-deleted: un doppione eliminato non si ricrea. I NULL non collidono.

### `utilizer_grant_parties`

N-N contratto immobiliare ↔ soggetti (`utilizer_grant_id`, `third_party_id`, PK composta, FK su entrambe). Sostituisce `utilizer_grant.utilizer_id_fk`: un contratto ha una o più parti (co-intestatari).

### FK spostate

- `contracts.supplier_id_fk` → `third_parties.id`;
- `consip_agreement.supplier_id` → `third_parties.id` (FK nuova).

Contratto di fornitura e convenzione CONSIP restano con un solo fornitore.

### Migration

Unica migration, solo struttura + copia meccanica:

1. crea `third_parties` e `utilizer_grant_parties`;
2. copia `suppliers` (tutte le righe, `deleted` compreso) come `LEGAL`: `company_name`, `vat_number`, `tax_code`, indirizzo, email, PEC; `supplier_id` scartata;
3. copia `utilizer` (tutte le righe) come `LEGAL` provvisorio: `name` → `company_name`, `description` → `notes`, `tax_code`, `contacts`;
4. riempie `utilizer_grant_parties` da `utilizer_grant.utilizer_id_fk`;
5. sposta le FK di `contracts` e `consip_agreement`;
6. elimina `utilizer_grant.utilizer_id_fk`, `utilizer`, `suppliers`.

`down()` ripristina struttura e dati (prima parte per contratto in `utilizer_id_fk`).

## Validazione

DTO (`@ValidateIf` per tipo) e form, stesse regole:

- `LEGAL`: `company_name` e `vat_number` obbligatori;
- `NATURAL`: `last_name`, `first_name`, `tax_code` obbligatori; P.IVA facoltativa.

Formati: P.IVA 11 cifre, CF 16 caratteri alfanumerici (maiuscolo, spazi rimossi). Il CF di un soggetto giuridico può essere numerico a 11 cifre (es. ACA): accettato.

Duplicato: il service controlla prima con una query sull'identificativo (righe eliminate comprese) e risponde **400** (`BadRequestException`, mai 409: il reverse proxy di produzione blocca le risposte 409) "P.IVA già usata da <nome>" / "Codice fiscale già usato da <nome>"; `ER_DUP_ENTRY` intercettato come rete di sicurezza con lo stesso 400. La UI mostra il messaggio sotto il campo P.IVA/CF.

## Ruoli derivati e filtri rapidi

| Ruolo | Regola |
|---|---|
| Fornitore | almeno un contratto di fornitura (`contracts`) o una convenzione CONSIP non eliminati |
| Locatore | parte di un contratto immobiliare `PASSIVE` (il Comune paga) |
| Conduttore | parte di un contratto immobiliare `ACTIVE` (il Comune incassa) |

Lista Soggetti terzi: chip rapide **Tutti · Fornitori · Locatori · Conduttori · Senza collegamenti**, combinabili in OR. Nel dialog filtri: tipo soggetto, tipo contratto immobiliare (`ContractKind`, si combina con le chip). Backend: parametro `roles` sulla ricerca, risolto con `EXISTS`; nessuna colonna salvata. Gli stessi ruoli compaiono come badge in lista e nel Riepilogo.

## Backend

- Nuovo modulo `apis/third-parties/` (entity, DTO, service, controller `GET/POST/PATCH/DELETE /third-parties`, ricerca su nome, P.IVA, CF + `roles`, `type`, `kind`).
- Eliminati `apis/utilizer/`, `apis/suppliers/`, `apis/shared/entities/supplier.entity.ts`.
- `UtilizerGrant`: `parties: ThirdParty[]` (ManyToMany su `utilizer_grant_parties`); DTO `party_ids: number[]` con almeno un elemento.
- `Contract.supplier` e `ConsipAgreement.supplier` → `ThirdParty`.
- Da adattare: `utility.service.ts` (join e filtro utenze per controparte), `anomalies.service.ts`, `real-estate-contract.privacy.ts` (per il Lettore oscura `tax_code` e `phone` dei soggetti `NATURAL`), `contracts.service.ts`, `consip-agreement`.
- Anomalie: nuova "soggetti senza identificativo fiscale"; "contratto senza controparte" diventa "contratto immobiliare senza parti".

## Frontend

- Pagina **Soggetti terzi** (`/third-parties`), una voce in sidebar al posto di Controparti e Fornitori. Lista: nome, tipo, P.IVA/CF, badge ruoli; chip rapide sopra la tabella.
- **Scheda** sulla shell `entity-sheet` (aperta con `openSheet()`/`EntityNavigatorService`):
  - Riepilogo: badge ruoli, identificativo, contatti, conteggi collegamenti;
  - Dati: campi condizionali per tipo;
  - Collegamenti: contratti immobiliari, contratti di fornitura, convenzioni CONSIP (`app-linked-table`, navigabili, sola lettura).
- Helper unico `partyName()` (denominazione oppure "Cognome Nome") ovunque oggi compare `supplier_id` o `utilizer.name`: select e tabella contratti, tabella fatture, dashboard, tabella e filtri utenze, scheda immobile, scheda contratto immobiliare.
- Contratto immobiliare: multi-select delle parti; titolo scheda e colonne con i nomi uniti da ", ".
- Eliminati `pages/utilizer/`, `pages/suppliers/` e le route `/utilizer`, `/suppliers` (nessun redirect).

## Pulizia dati (one-off, dopo la migration, sul DB locale)

Operazioni manuali con conferma dell'utente per ogni lista, nessun codice nel repo. In produzione arrivano per la stessa strada dei dati delle voci 1 e 3.

1. **Orfane**: report CSV delle 109 controparti senza contratto (nome, descrizione, contatti) per riportare a mano sull'utenza le note utili; poi soft delete.
2. **Non-soggetti con contratto** (~15): testo accodato a `utilizer_grant.notes`, parte rimossa dal contratto, soggetto soft-deleted. Il contratto compare nell'anomalia "senza parti".
3. **Doppioni e pseudo-fornitori**: lista (Vodafone, `TERZI`, `ACA_TERZI`, `comune`, eventuali altri) con il soggetto superstite; collegamenti riassegnati, doppioni soft-deleted.
4. **Tipo e nominativi**: lista proposta `NATURAL`/`LEGAL` per ogni soggetto, con split cognome/nome per le persone e una riga per persona nei contratti con più intestatari.

## Test

- Unit: validazione per tipo, duplicato → 400 con nome del soggetto, ruoli derivati e filtro `roles`, privacy (CF e telefono oscurati per il Lettore), anomalie nuove; spec di grant/contracts/consip/utility aggiornati.
- Migration: provata su copia del DB locale, poi `down()` e di nuovo `up()`.
- E2E Playwright: crea e modifica soggetto (giuridico senza P.IVA non salva), chip rapide, contratto immobiliare con due parti, scheda soggetto con collegamenti navigabili, Lettore con CF oscurato.

## Ordine

1. PR: rimozione importatore Access (`data-importer`, `apis/import`, sezione import della pagina Backup).
2. PR: soggetti terzi (migration + backend + frontend).
3. Pulizia dati sul DB locale.
