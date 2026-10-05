# Creazione dalle schede ("+ Nuovo" sui collegamenti)

Data: 2026-10-05. Terzo blocco della revisione UI (dopo rinomina "Contratti di fornitura" ed elenchi uniformi, v1.11.0).

## Obiettivo

Richiesta utente: «se sto aggiungendo un nuovo contratto non ho il tasto per aggiungere il soggetto […] deve essere tutto presente senza girare per mille menu». Chi compila una scheda deve poter creare al volo qualunque elemento da collegare, senza chiudere la scheda e passare da un altro elenco.

Fuori scope: rifiniture della voce 13 della roadmap (PR separata subito dopo), allegati (voce 19).

## Giro CRUD: dove oggi si esce dalla scheda

Analisi delle schede (2026-10-05):

| Scheda | Campo / tab | Manca |
|---|---|---|
| Contratto di fornitura | Fornitore | nuovo soggetto terzo |
| Contratto di fornitura | Convenzione CONSIP (`mat-select`) | nuova convenzione |
| Contratto di fornitura | tab Utenze (solo "Collega") | nuova utenza |
| Contratto di fornitura → Impegni | Capitolo | nuovo capitolo |
| Contratto immobiliare | Parti del contratto (`app-multi-select`) | nuovo soggetto terzo |
| Contratto immobiliare | tab Immobili, tab Utenze | nuovo immobile, nuova utenza |
| Utenza | Tipo utenza (`mat-select`) | nuovo tipo |
| Utenza | Capitolo di spesa | nuovo capitolo |
| Utenza | Volturata a (`mat-select`) | nuovo soggetto terzo |
| Utenza | tab Immobili, tab Impianti | nuovo immobile, nuovo impianto |
| Utenza | tab Fatture | nuova fattura con la riga dell'utenza |
| Immobile | Tipologia, Funzione (`mat-select`) | nuova tipologia, nuova funzione |
| Impianto | tab Immobili, tab Utenze | nuovo immobile, nuova utenza |
| Fattura | Contratto di fornitura, Fornitore | nuovo contratto, nuovo soggetto terzo |
| Fattura → righe | Utenza, Impegno | nuova utenza, nuovo impegno |
| Soggetto terzo | tab Contratti immobiliari, tab Forniture | nuovo contratto con il soggetto già impostato |
| Convenzione CONSIP | Fornitore | nuovo soggetto terzo |

Già presenti (base da riusare): da Immobile "Aggiungi utenza", "Nuovo impianto", "Nuovo contratto immobiliare"; da Utenza "Nuovo contratto di fornitura" (`EntityNavigatorService.createUtility/createPlant/createGrant/createSupplyContract`).

## Decisioni

- **Permessi**: il "+" segue i permessi del backend, che per tutte queste entità ammette `Admin` e `Operatore` sul `POST` (anche tipi utenza, tipologie e funzioni, pur stando sotto Impostazioni). Visibile solo se la scheda è modificabile (`canEdit`); mai per il Lettore. Nessuna modifica backend.
- **Scheda in pila**: la creazione apre la scheda dell'entità sopra quella corrente (`openSheet`, offset di pila già gestito) o, per le anagrafiche semplici, il loro dialog attuale. Alla chiusura con salvataggio il record è già creato sul server; la scheda di partenza lo riceve e lo seleziona/collega. Annulla = nessun effetto.
- **Il collegamento resta della scheda di partenza**: il nuovo record si crea subito (serve l'id), ma il legame con la scheda di partenza segue la regola di oggi — si salva con il Salva della scheda di partenza (come "Collega"). Eccezione: dove la creazione ha già il legame nel proprio payload (es. contratto di fornitura creato dall'utenza con `preselectedUtilityIds`, impianto creato dall'immobile), resta come oggi.

## Design

### 1. `EntityNavigatorService`: un metodo `create…` per ogni entità

Si aggiungono, con la stessa forma di quelli esistenti (scheda/dialog → `service.create` → `Observable<T | null>`, errore = toast con il messaggio del backend):

- `createThirdParty(prefill?)`, `createBudgetChapter()`, `createConsipAgreement(prefill?)`, `createUtilityType()`, `createAssetNature()`, `createAssetFunction(natureId?)`, `createAsset(prefill?)`, `createInvoice(prefill?)`, `createCommitment(contractId)`;
- `createPlant` restituisce il record creato (oggi `boolean`): serve a collegarlo dall'utenza. Il dialog impianto salva da sé e dopo una creazione resta aperto (verifiche, presidi e foto richiedono l'id): alla chiusura restituirà l'impianto salvato invece di `true`/`saved` (i chiamanti attuali usano solo la truthiness);
- `createUtility(prefill)`, `createGrant`, `createSupplyContract` esistono già: si estendono i prefill (es. contratto con fornitore, contratto immobiliare con parte).

**Payload unico**: oggi la trasformazione entity → payload di capitoli, tipi utenza, tipologie, funzioni e convenzioni sta nella pagina elenco (`entityToPayload` + `onCreate`). Si sposta in una funzione accanto all'entity o nel service (`toPayload`), usata sia dall'elenco sia dal navigatore: un solo punto da tenere allineato. Autore (`created_by_user_id`/`updated_by_user_id`) aggiunto dal navigatore come fa `createUtility`.

**Funzione dell'immobile**: le funzioni ammesse dipendono dalla tipologia (`asset_nature_functions`). Una funzione creata dalla scheda immobile con una tipologia già scelta viene aggiunta anche alle funzioni ammesse di quella tipologia (PATCH della tipologia con `function_ids` + la nuova), altrimenti non comparirebbe tra le opzioni. Senza tipologia scelta il "+" della funzione è disabilitato (come oggi il campo).

### 2. Select con "+ Nuovo …"

`app-filterable-select` e `app-multi-select` ricevono:

- `@Input() createLabel: string | null` (es. "Nuovo soggetto terzo"); `null` = nessuna opzione;
- `@Output() create = new EventEmitter<string>()` con il testo digitato (utile come prefill del nome).

L'opzione è l'ultima del pannello, sempre visibile anche col filtro attivo, con icona `add` e stile distinto; selezionarla non cambia il valore del controllo e chiude il pannello. La scheda di partenza chiama il navigatore e, al ritorno, aggiunge il record alle proprie opzioni (array nuovo, campo cache — vedi gotcha dei getter in CLAUDE.md) e lo imposta come valore (multi: lo aggiunge alla selezione), `markAsDirty()`.

Le `mat-select` semplici di Tipo utenza, Convenzione CONSIP, Tipologia, Funzione e Volturata a passano ad `app-filterable-select` per avere lo stesso "+" (comportamento uguale, con ricerca). La logica oggi su `(selectionChange)` (`onUtilityTypeChange`, `onConsipAgreementChange`) passa a `valueChanges` del controllo.

Stessa sorgente di opzioni per più campi della stessa scheda (es. fattura: fornitore della testata e contratto): dopo una creazione si aggiornano tutte le liste della scheda che contengono quel tipo.

### 3. "Nuovo …" nelle tabelle collegate

`app-linked-table` ha già `createLabel`/`(create)`. Si aggiunge dove manca:

| Scheda → tab | Pulsante | Effetto |
|---|---|---|
| Contratto di fornitura → Utenze | Nuova utenza | `createUtility({})`, poi collegata come "Collega" |
| Contratto immobiliare → Immobili | Nuovo immobile | `createAsset()`, poi collegato |
| Contratto immobiliare → Utenze | Nuova utenza | `createUtility({})`, poi collegata |
| Utenza → Immobili | Nuovo immobile | `createAsset()`, poi collegato |
| Utenza → Impianti | Nuovo impianto | `createPlant(null)`, poi collegato |
| Impianto → Immobili | Nuovo immobile | `createAsset()`, poi collegato |
| Impianto → Utenze | Nuova utenza | `createUtility({plant_ids: [id]})` (legame nel payload, come da Immobile) |
| Utenza → Fatture | Nuova fattura | `createInvoice` con una riga sull'utenza e il contratto aperto dell'utenza, se unico |
| Soggetto terzo → Contratti immobiliari | Nuovo contratto immobiliare | `createGrant` con il soggetto tra le parti |
| Soggetto terzo → Forniture | Nuovo contratto di fornitura | `createSupplyContract` con il fornitore impostato |

Dopo la creazione, la tabella della scheda di partenza si ricarica come oggi dopo un'apertura con salvataggio.

### 4. Righe della fattura

`invoice-lines-tab`: "+" su Utenza (`createUtility`) e su Impegno (`createCommitment` sul contratto della fattura; disabilitato con tooltip se la fattura non ha contratto). Le nuove opzioni risalgono alla scheda fattura (`utilityOptions`/`commitmentOptions` sono input del tab: evento verso il padre che aggiorna l'array).

## Gotcha noti da rispettare

- Righe/opzioni passate ai componenti: campi cache, non getter.
- Schede aperte sempre con `openSheet()`/navigatore, mai `dialog.open` con dimensioni a mano.
- Una scheda figlia che modifica entità della madre: riallineare solo i controlli `pristine` (gotcha tab Consumi).
- `findAll()` non joina tutto: il record restituito da `create` può non avere le relazioni che la scheda di partenza mostra in tabella; per le righe delle tabelle collegate ricaricare (come fanno già `loadPlants`/`loadGrants`), per le opzioni bastano id + etichetta.

## Verifica

- Compilazione (`ng serve` / `pnpm run build`), CI.
- E2E Playwright con utente temporaneo (poi eliminato con i record creati), un percorso per ogni riga della tabella "Giro CRUD": crea dal "+", controlla selezione/collegamento, salva la scheda di partenza, riapre e verifica.
- Lettore: nessun "+" visibile.
