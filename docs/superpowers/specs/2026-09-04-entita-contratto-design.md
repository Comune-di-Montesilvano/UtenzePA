# Design: entità Contratto

Data: 2026-09-04

## Contesto e problema

Oggi i dati contrattuali (fornitore, CIG, ordini, date, cauzione, riferimento
Consip) vivono spalmati come colonne dirette su `Utility`, sotto l'assunzione
implicita che 1 utenza = 1 contratto proprio, mai condiviso.

Nella realtà del Comune questa assunzione non regge: un contratto (fornitura
energia/gas aggregata, global service manutenzione) copre tipicamente **più
utenze insieme**. Col modello attuale questo si può rappresentare solo
duplicando gli stessi dati contrattuali (CIG, date, fornitore) su ogni riga
`Utility` — ad ogni rinnovo servono N update manuali invece di uno, con
rischio concreto di disallineamento tra le righe duplicate.

Inoltre oggi non esiste storicizzazione: un rinnovo o cambio fornitore
sovrascrive i campi in-place su `Utility`, senza audit trail di chi era il
fornitore precedente o quando è cambiato.

## Obiettivo

Estrarre un'entità `Contratto` indipendente che:
- possa coprire più utenze contemporaneamente (relazione N:N con `Utility`)
- si storicizzi naturalmente: un rinnovo crea una nuova riga `Contratto`
  invece di sovrascrivere quella esistente, il gruppo di utenze coperte può
  variare liberamente ad ogni rinnovo (non necessariamente lo stesso set)
- diventi il punto di aggancio per le fatture (`Invoice`), sostituendo il
  legame diretto oggi con `Utility`+`Supplier`

## Modello dati

### Nuova tabella `contracts` (entità `Contratto`)

Riceve tutti i campi contrattuali oggi su `Utility`, nessuno resta lì:

| campo | tipo (invariato da Utility) |
|---|---|
| `id` | PK autoincrement |
| `supplier_id_fk` | int, nullable |
| `cig_contract` | text, nullable |
| `order_number` | text, nullable |
| `consip_order` | varchar(100), nullable |
| `consip_agreement_id` | int, nullable (FK opzionale a `ConsipAgreement`) |
| `supply_start_date` | date, nullable |
| `supply_expiry_date` | date, nullable |
| `management_expiry_date` | date, nullable |
| `takeover_termination_date` | date, nullable |
| `security_deposit` | decimal(10,2), default 0 |

più i soliti campi audit presenti su ogni entità del progetto:
`create_date`, `update_date`, `created_by_user_id`, `updated_by_user_id`,
`deleted`.

Relazioni:
- `ManyToOne` verso `Supplier` (`supplier_id_fk`)
- `OneToOne` verso `ConsipAgreement` (`consip_agreement_id`), opzionale —
  `ConsipAgreement` resta un'entità separata (convenzione quadro), non viene
  assorbita
- `ManyToMany` verso `Utility` tramite tabella ponte `contract_utilities`
- `OneToMany` verso `Invoice`

### Tabella ponte `contract_utilities`

Colonne: `contract_id`, `utility_id`. N:N puro, nessuna colonna aggiuntiva
(niente `valid_from`/`valid_to` sulla riga ponte) — la validità temporale
vive già nelle date del `Contratto` stesso: ogni rinnovo è una riga
`Contratto` diversa, con un proprio set di associazioni in questa tabella.

### "Contratto corrente" di un'utenza

Nessun campo stato dedicato. Derivato a runtime: tra i contratti associati
a un'utenza, quello con `supply_expiry_date` nulla oppure ≥ data odierna.
Se per errore/dato sporco più contratti risultassero "correnti"
contemporaneamente per la stessa utenza, la UI mostra tutti quelli in questo
stato (nessuna deduplica forzata lato backend in questa iterazione).

### Modifiche a `Utility`

Rimossi: `supplier_id_fk`, `cig_contract`, `order_number`, `consip_order`,
`consip_agreement_id`, `supply_start_date`, `supply_expiry_date`,
`management_expiry_date`, `takeover_termination_date`, `security_deposit`,
e le relative relazioni dirette (`supplier`, `consipAgreement`).

Aggiunta relazione `contratti: Contratto[]` (lato inverso della
`ManyToMany`).

### Modifiche a `Invoice`

Rimossi: `utility_id_fk`, `supplier_id_fk`.

Aggiunto: `contratto_id_fk` (int, nullable — nullable come lo era
`utility_id_fk` oggi), relazione `ManyToOne` verso `Contratto`.

Il fornitore di una fattura si legge sempre tramite
`invoice.contratto.supplier`, mai denormalizzato.

**Fuori scope esplicito**: nessun dettaglio di spesa per singola utenza
quando un contratto ne copre più di una (bolletta riepilogativa di gruppo).
Verrà affrontato da una futura feature di importazione XML fatture, quando
il dato di dettaglio per POD/contatore è effettivamente presente nel file —
oggi le fatture a sistema sono poche proprio perché spesso riepilogative.

## Backend API

Nuovo modulo `contracts/` (stesso pattern di `suppliers`/`consip-agreement`):
- `Contract` entity, `create-contract.dto.ts`, `update-contract.dto.ts`,
  `search-contract.dto.ts`
- `ContractsController` REST su `/api/v1/contracts` (CRUD + search, stesso
  schema degli altri moduli anagrafica)
- `ContractsService` con `search()` che supporta filtro per `utility_id`
  (per lo storico contratti nel dettaglio Utenza), `supplier_id`, range date,
  CIG

Associazione utenze gestita interamente dentro `update-contract.dto.ts`
come `utility_ids: number[]` — ad ogni save il service sostituisce l'intero
set della tabella ponte per quel contratto (stesso pattern già in uso per
`Invoice.budget_chapters` via `JoinTable`). Nessun endpoint dedicato
separato per aggiungere/rimuovere singole associazioni.

`UtilityService`/`InvoiceService`: rimossa la logica sui campi tolti;
aggiunta la relazione `contratti` nelle query di dettaglio dove serve
mostrarla (non in ogni `search()` di lista, per non appesantirle).

## Frontend

Nuova pagina "Contratti" (rotta + voce di menu), stessa struttura delle
pagine anagrafica esistenti (`Suppliers`, `ConsipAgreement`):
`ContractsComponent` (list + search), `SearchContractsComponent`,
`ContractFilterDialogComponent`, `ContractEditDialogComponent`,
`DataTableContractsComponent`, `contract.service.ts`, `contract.entity.ts`.

`ContractEditDialogComponent`: i campi ex-`Utility` (fornitore, CIG,
ordini, date, cauzione, riferimento Consip) più un `FilterableSelect`
**multi-select** per le utenze coperte dal contratto.

Dettaglio Utenza (`AssetEditDialogComponent` o dialog dedicato utenza —
verificare in fase di piano quale componente possiede oggi i campi
rimossi): tolti i campi contrattuali diretti, aggiunta sezione "Contratti"
con:
- multi-select per associare/disassociare l'utenza a contratti esistenti
  (gestione bidirezionale, come dal lato Contratto)
- badge "corrente" sul contratto la cui `supply_expiry_date` è nulla o
  ≥ oggi
- azione "+ Nuovo contratto" che apre `ContractEditDialogComponent` con
  questa utenza già presente nel multi-select

`InvoiceEditDialogComponent`: i picker separati `supplier`/`utility`
sostituiti da un unico picker `Contratto`; il fornitore associato viene
mostrato in sola lettura (derivato), non più selezionabile direttamente.

## Migrazione dati

Migration TypeORM unica (`CreateContract`), da trattare come temporanea:
verrà rimossa/squashata in un secondo momento nella baseline dello schema,
come già avvenuto in passato per `InitialSchema` — nessuno script di
rollback elaborato oltre il `down()` standard TypeORM.

Passi:
1. Crea le tabelle `contracts` e `contract_utilities`
2. Per ogni `Utility` con almeno un campo contrattuale valorizzato, crea 1
   riga `Contratto` copiando quei campi, e la relativa riga in
   `contract_utilities`
3. Per ogni `Invoice.utility_id_fk` valorizzato, risolve
   `contratto_id_fk` tramite il contratto appena creato per quella utenza
   (best-effort: essendo oggi 1:1 utenza↔dati contrattuali, il match è
   univoco; non gestisce casi ambigui perché non possono esistere prima di
   questa migrazione)
4. Drop delle colonne rimosse da `utilities` e `invoices`

Nessuna garanzia di qualità sui dati esistenti in produzione: la migrazione
copia quello che trova, senza validazione/pulizia — coerente con l'accordo
di non considerare troppo affidabile lo stato attuale e di rivalutare la
strategia di migrazione separatamente, quando si deciderà il rollout reale
verso produzione.

## Testing

- Unit test `ContractsService` (CRUD, filtro `utility_id`, sostituzione set
  `utility_ids` al save)
- Unit test migration (o test manuale documentato) sul backfill da dati
  `Utility`/`Invoice` esistenti
- `ng build` reale (non solo `tsc --noEmit`) obbligatorio prima di
  considerare conclusa la parte frontend, per le stesse ragioni già note nel
  progetto (type-checking dei template Angular non catturato da `tsc`)
