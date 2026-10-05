# Elenchi uniformi: filtri, paginazione, toolbar

Data: 2026-10-05. Roadmap voce 15, primi due punti ("Elenchi uniformi", "Filtri coerenti").

## Problema

Gli elenchi cambiano da pagina a pagina:

- filtri: 12 pagine con un dialog "Filtri" scritto a mano, Impianti con filtri in linea, Soggetti terzi con chip per ruolo più dialog; nei dialog lo stesso tipo di dato usa controlli diversi; chiuso il dialog, i filtri attivi non si vedono;
- paginazione: 10 righe (10/20/50) negli elenchi su `AbstractDataTableComponent`, 50 (25/50/100) in Impianti, 20 nel log modifiche;
- testata: titoli in stili diversi ("Gestione Fatture", "Capitoli di Spesa", "Contratti di fornitura"), Esporta CSV e scelta colonne solo in alcuni elenchi;
- record eliminati: alcune API li restituiscono insieme agli attivi, altre mai;
- i filtri aperti dalla dashboard (`?alert=...`) si annunciano con un toast e non si possono togliere.

## Obiettivo

Un solo modello per tutti gli elenchi: ricerca libera, fino a 3 select in linea per i campi più usati, "Filtri avanzati" con tutti gli altri, chip dei filtri attivi, paginazione e toolbar uguali.

Successo: filtrare, togliere un filtro, cambiare pagina e numero di righe funziona nello stesso modo su ogni elenco, senza leggere il codice della pagina.

## Decisioni (utente, 2026-10-05)

- Filtri principali in linea come select, il resto in "Filtri avanzati".
- Paginazione: 25 righe di default, scelta 25/50/100, ricordata per elenco.
- Filtri dichiarati da una configurazione per pagina; un dialog avanzato generico al posto dei 12 scritti a mano.

## Configurazione dei filtri

Ogni pagina dichiara i propri filtri in `pages/<entità>/<entità>-filters.ts`:

```ts
export type FilterType = 'select' | 'multi' | 'text' | 'bool' | 'dateRange' | 'number';

export interface FilterDef {
  key: string;            // parametro di ricerca inviato al backend (es. 'utility_type_id_fk')
  label: string;
  type: FilterType;
  options?: TOption[] | (() => Observable<TOption[]>); // per select/multi: statiche o caricate
  inline?: boolean;       // in barra; al massimo 3 per pagina
  group?: string;         // sezione del dialog avanzato (es. 'Fornitura', 'Date', 'Catasto')
}
```

- Il dialog avanzato mostra tutti i filtri, compresi quelli in linea, divisi per `group`.
- `bool` = select Sì / No / (qualsiasi); `dateRange` = coppia di datepicker da/a, inviata come array `AAAA-MM-GG` (convenzione date unica, `DateHelper.toLocalIsoString`).
- Le opzioni caricate si leggono una volta per pagina e servono sia alle select sia ai chip.
- Le chiavi restano quelle accettate oggi dalle API: nessun cambio di contratto col backend, salvo i due filtri nuovi sotto.

Helper puro `filter-values.ts` (testato):

- `toSearchParams(defs, values)`: toglie vuoti, `null`, array vuoti; converte le date; restituisce l'oggetto passato a `service.search()`;
- `toChips(defs, values, optionsByKey)`: un chip per filtro valorizzato, `{key, label, text}` (es. "Tipo utenza: Luce", "Scadenza: 01/01/2026–31/12/2026", "Fornitura attiva: Sì");
- `countActive(defs, values)`: numero per il badge "Filtri avanzati (N)" (conta solo i filtri non in linea).

## Componenti

In `core/components/list/`:

- **`app-list-page`**: shell della pagina: titolo (`h1`), sottotitolo, slot per i filtri, slot per la tabella. Sostituisce l'HTML ripetuto di ogni `*.component.html` di pagina.
- **`app-list-filters`**: input `defs`, `values`; output `search` (parametri pronti) e `quickSearch` (testo). Contiene ricerca libera, select in linea (`app-filterable-select` per opzioni lunghe, `mat-select` per opzioni corte), pulsante "Filtri avanzati (N)", riga dei chip con "Azzera". Rimuovere un chip azzera quel filtro e rilancia la ricerca.
- **`app-advanced-filters-dialog`**: generico, costruisce la form da `FilterDef[]`; pulsanti "Azzera" e "Applica". Sostituisce i 12 `*-filter-dialog.component.*` e le 12 `search-*.component.*`, che si eliminano.
- **`AbstractDataTableComponent`**:
  - paginatore 25/50/100 con primo/ultimo, numero di righe salvato in `localStorage` (`list-page-size:<elenco>`, letture/scritture in try/catch, default 25);
  - toolbar comune: "Elenco (N)" a sinistra; a destra Colonne (se la pagina ha la scelta colonne), Esporta CSV (se ha l'export), "+ Nuovo" (ruoli Admin/Operatore). Stesso ordine e stessi stili ovunque.

`AbstractComponent` (pagina): la ricerca libera filtra lato client i dati già caricati con i filtri correnti, quindi si combina con loro (oggi una ricerca libera "sostituisce" lo stato dei filtri nella logica di `onSearch`). Dopo save/create/delete/restore si ricarica con gli ultimi filtri, come oggi.

## Record eliminati

Filtro standard `deleted` in ogni configurazione, gruppo "Record": "Mostra: Attivi / Eliminati / Tutti", default Attivi (`deleted=false`). Non è in linea; il chip compare solo se diverso da Attivi.

Le API non si comportano tutte allo stesso modo (es. `ContractsService` filtra sempre `deleted = false`, `AssetsService` solo se il parametro è presente): nel piano si verifica entità per entità e si allinea il backend perché `deleted` assente = tutti, `true`/`false` = filtro. Il frontend lo invia sempre.

## Viste coinvolte

Tutte le pagine elenco del menu: Immobili, Utenze, Impianti, Contratti immobiliari, Soggetti terzi, Capitoli di spesa, Fatture, Contratti di fornitura; da Impostazioni: Tipologie immobili, Funzioni immobili, Tipologie uso contatore, Convenzioni CONSIP, Utenti e ruoli, Log modifiche. Restano fuori Dashboard, Mappa, Backup, Branding (non sono elenchi).

## Filtri in linea

| Elenco | In linea |
|---|---|
| Immobili | Tipologia, Funzione, Stato |
| Utenze | Tipo utenza, Fornitura attiva, Fornitore |
| Impianti | Tipo, Stato, Verifiche (Posizione negli avanzati) |
| Contratti immobiliari | Stato, Direzione, Tipo |
| Contratti di fornitura | Fornitore, Stato (aperto/chiuso) |
| Fatture | Contratto di fornitura, Anno |
| Soggetti terzi | Ruolo, Tipo (fisica/giuridica) |
| Capitoli di spesa | Tipo fornitura |
| Convenzioni CONSIP | Fornitore |
| Utenti | Ruolo, Stato |
| Tipologie, Funzioni immobili, Tipi utenza | nessuno (solo ricerca libera e avanzati) |

Gli avanzati contengono tutti i campi filtrabili oggi nei dialog esistenti, senza toglierne nessuno.

Filtri nuovi:

- **Contratti di fornitura, Stato**: parametro `closed` (bool) in `SearchContractDto` e nel service. Unico intervento backend oltre a `deleted`.
- **Fatture, Anno**: solo frontend, select degli anni presenti; si traduce in `invoice_date_from`/`invoice_date_to` (1/1–31/12). Se l'utente imposta anche le date negli avanzati, vincono le date e il chip Anno sparisce.
- **Soggetti terzi, Ruolo**: sostituisce i chip per ruolo (stesso parametro `roles`).

## Filtri dalla dashboard

I link della dashboard aprono un elenco con query param: `/contracts?missing_cig=true`, `/contracts?supply_expiry_date_range=...`, `/utilities?safeguard=true`, `/utilizer-grant?alert=...`, `/plants?position=missing`, `/plants?inspection=...`, `/building` (immobili da classificare). Regola unica: un query param con lo stesso nome di una `FilterDef` valorizza quel filtro all'apertura; compare come chip e si toglie come gli altri. I preset che oggi non sono un filtro (`missing_cig`, `alert`) diventano `FilterDef` (gruppo "Segnalazioni", tipo `bool` o `select` con i preset esistenti). `selectedId` resta com'è (apre la scheda). Spariscono i toast "Filtro applicato".

## Impianti e log modifiche

- **Impianti**: oggi tabella e filtri propri (filtri lato server per tipo/stato/verifiche/posizione, ricerca lato client). Passa a `app-list-page` + `app-list-filters` + stesso paginatore; resta la sua tabella.
- **Log modifiche**: paginato lato server, resta così; stessa shell e barra filtri (Entità, Utente in linea), paginatore 25/50/100.

## Fuori perimetro

Dark mode, sidebar, nuovo nome (resto della voce 15); "+ Nuovo" dai campi collegati nelle schede (PR successiva, CRUD completo dalle schede); colonne e contenuti delle tabelle.

## Verifica

- `filter-values.ts` è puro e piccolo; il frontend non ha test eseguibili (nessun browser per Karma, la CI non li lancia): si verifica con la compilazione e con l'E2E sotto.
- Backend: test del service contratti per `closed` e dei service toccati per `deleted`.
- Compilazione `ng build` completa.
- E2E Playwright su Utenze, Fatture, Soggetti terzi: filtro in linea, filtro avanzato, chip rimosso, Azzera, ricerca libera insieme ai filtri, numero di righe ricordato dopo il ricaricamento, link "Contratti senza CIG" dalla dashboard con chip togliibile.
