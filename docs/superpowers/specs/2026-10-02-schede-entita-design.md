# Schede entità: riepilogo + tab per categoria

Data: 2026-10-02
Ambito: solo frontend. Entità: immobile, utenza, impianto, contratto di fornitura, contratto immobiliare.

## Obiettivo

Oggi i dialog di dettaglio mettono quasi tutto nella prima maschera (immobile ~25 campi, utenza 7 fieldset), i collegamenti fra entità sono select non navigabili (impianto → utenze), lo stato (attivo/dismesso…) si perde fra i campi e il dialog cambia altezza/posizione a ogni tab.

Risultato atteso:
- prima maschera = **Riepilogo**: dati generali, mappa, anteprime compatte dei collegamenti;
- tutto il resto in tab per categoria, con icona e badge (conteggio o pallino di stato);
- **stato in evidenza come badge nell'header**, sempre visibile;
- collegamenti in tabelle cliccabili che aprono la scheda collegata;
- dialog ad altezza fissa, header e riga dei tab fermi, scorre solo il contenuto;
- colori e icone coerenti fra entità.

## Decisioni

- Le schede restano **dialog** (non pagine dedicate), ad altezza fissa.
- Navigazione fra entità: **dialog impilati** (come oggi). Ogni livello ha il suo Salva/Annulla.
- Modello di salvataggio invariato: un form per dialog, collegamenti nei form control, un unico Salva. Fanno eccezione le sotto-entità che già oggi salvano da sole (verifiche e presidi impianto, consumi, foto).
- Una sola PR.
- Fuori scope: id inserito dall'utente in altre entità (es. fornitore), pagine lista, backend.

## Componenti condivisi (`frontend/src/app/core/components/entity-sheet/`)

### `EntitySheetComponent`
Shell del dialog, layout flex a colonna su tutta l'altezza del dialog:
- **header fisso**: icona entità in cerchio colorato, titolo, sottotitolo facoltativo (es. indirizzo), slot `[sheetBadges]` per i badge stato, "Ultima modifica: data — utente" allineato a destra;
- **body**: contenuto proiettato (il `mat-tab-group` del dialog). La riga dei tab resta ferma, scorre solo il corpo del tab (`.mat-mdc-tab-body-wrapper` `flex:1; overflow:auto`, `min-height:0` a ogni livello della catena flex);
- **footer fisso**: slot `[sheetActions]`.

I `mat-tab` restano dichiarati nel template di ciascun dialog: `mat-tab-group` non vede tab proiettate via `ng-content` di un altro componente.

### `openSheet(dialog, component, data)`
Unico punto per le dimensioni del dialog: `width: 1150px`, `maxWidth: 95vw`, `height: 90vh`, `position: {top: 5vh}`. Un dialog impilato scende di 2vh per livello già aperto (`top` +2vh, `height` −2vh) per mostrare la profondità. Sostituisce le larghezze sparse (900/1000/1150) e corregge le aperture dell'impianto senza `position` (oggi centrato, quindi "salta").

Tutti i punti di apertura dei 5 dialog (tabelle, mappa, audit log, dashboard, dialog fra loro) passano da `openSheet`.

### `StatusBadgeComponent`
`<app-status-badge tone="ok|warn|danger|off|info" [icon] [label] [tooltip]>`: pillola colorata.

### `entity-status.ts` (`core/helpers/`)
Funzioni pure che restituiscono `{tone, label, icon?, tooltip?}`:

| Funzione | Badge principale | Badge secondari |
|---|---|---|
| `assetStatus(a)` | `status`: Attivo ok / Da verificare warn / Dismesso off | tipo precedente (warn) se `legacyTypeLabel` |
| `utilityStatus(u)` | `supply_active`: Attiva ok / Non attiva off | contatore rimosso (off), contatore non verificato (warn) |
| `plantStatus(p)` | `status`: Attivo ok / Da verificare warn / Dismesso off | verifiche scadute (danger) |
| `supplyContractStatus(c)` | Chiuso off se `closed`; Scaduto danger se `supply_expiry_date` < oggi; altrimenti In corso ok | senza CIG (danger) se manca CIG e non esente |
| `grantStatus(g)` | `computed_status`: Attivo ok / In contenzioso danger / Restituito off / Cessato off | stato dichiarato ≠ calcolato (warn) |

Nel dialog il badge si calcola dal valore corrente del form, quindi riflette subito una modifica non ancora salvata.

### `TabLabelComponent`
`<app-tab-label icon label [count] [tone] [dot]>`: icona, testo, badge numerico (`count`, nascosto se null) o pallino colorato (`dot` = il tab ha dati; `tone` colora badge/pallino, es. danger per scaduti).

### `LinkedTableComponent`
Tabella collegamenti generica.
- Input: `columns: {key, label, format?: (row) => string}[]`, `rows`, `addOptions: TOption[]` (picker "aggiungi", nascosto se assente), `readOnly`, `emptyText`.
- Output: `open(row)`, `add(id)`, `unlink(id)`.
- Ogni riga è cliccabile (apre la scheda), con un'azione "scollega" a destra se non `readOnly`.

### `PreviewCardComponent`
Riquadro del Riepilogo: titolo, icona, colore, conteggio, prime 3 righe (template proiettato o `label/sublabel`), link "vedi tutti →" che emette `seeAll` (il dialog imposta `selectedIndex` del tab corrispondente). Con zero righe mostra un testo vuoto breve.

### `EntityNavigatorService`
`openAsset(id)`, `openUtility(id)`, `openPlant(id)`, `openSupplyContract(id)`, `openGrant(id)`:
1. GET del record completo (`findAll()` non joina le stesse relazioni di `findOne()`);
2. apertura con `openSheet`;
3. alla chiusura, persistenza dove il dialog non persiste da sé (immobile, utenza, contratti: oggi lo fa la tabella via `onSave`). Restituisce `afterClosed()` così il chiamante può ricaricare.

Sostituisce `navigateToAsset`, `openUtilityDetail`, `openPlant` duplicati nei dialog. I componenti dialog sono importati con `import()` dinamico (i dialog iniettano il servizio, il servizio apre i dialog: niente import circolari).

### Token colore e icone
In `styles.scss`:
- `--tone-{ok,warn,danger,off,info}-{bg,fg}`;
- colore per entità: `--entity-asset` (blu), `--entity-plant` (arancio), `--entity-supply-contract` (viola), `--entity-grant` (teal); l'utenza usa il colore del tipo (`HardTypeColor`).

Icone tipo utenza da font-awesome a Material Icons (`bolt`, `water_drop`, `local_fire_department`, `wifi`): nuovo `HardTypeMatIcon` accanto a `HardTypeIcon` (quest'ultimo resta finché ha altri usi).

## Struttura delle schede

Convenzione: ogni tab ha un'icona; badge = numero di righe collegate, pallino = il tab contiene dati. I tab che richiedono l'id (collegamenti in sola lettura, foto, storico, verifiche) sono disabilitati in creazione.

### Immobile
Header: icona tipologia (`nature.icon`), nome, sottotitolo indirizzo; badge `assetStatus`.
1. **Riepilogo**: nome, tipologia, funzione, stato, categoria, proprietà, toponimo/indirizzo/civico/comune/CAP, lat/lng, mappa. Anteprime: Utenze (conteggio per tipo con icona), Impianti (per tipo), Contratti immobiliari attivi. Promemoria in evidenza (riquadro ambra) se valorizzato.
2. **Catasto** (pallino): valore catastale, foglio, particella, subalterno, superficie, descrizione fabbricato, servizi/manufatti.
3. **Utenze** (n): un solo tab con **sezioni per tipo** (titolo con icona colorata e conteggio, es. "Energia elettrica (4)"), ognuna con tabella cliccabile e "aggiungi utenza" di quel tipo; sezioni vuote nascoste; in fondo "+ utenza di altro tipo". Sostituisce un tab per tipo.
4. **Impianti** (n): contenuto attuale di `AssetPlantsTabComponent`, righe aperte via navigatore.
5. **Contratti immobiliari** (n; tone danger se almeno uno scaduto).
6. **Note** (pallino): specifiche, promemoria.
7. **Foto** (n). 8. **Storico**.

### Utenza
Header: icona e colore del tipo, POD, sottotitolo tipo uso; badge `utilityStatus`.
1. **Riepilogo**: POD, matricola, tipo uso, codice cliente, aggregato, indirizzo fornitura, capitolo di spesa, costi a carico di, lat/lng, mappa. Anteprime: Immobili, Impianti, contratto corrente, consumo 12 mesi vs presunto.
2. **Tecnici e stato**: potenza/tensione/fase (luce) o WBS (gas), disalimentabilità, fornitura attiva, contatore rimosso/verificato, fornitore manutenzione, concessione acqua, deposito cauzionale.
3. **Immobili** (n) e 4. **Impianti** (n): `LinkedTableComponent` sui form control `asset_ids`/`plant_ids`; vincolo "almeno un immobile o un impianto" mostrato nel Riepilogo e sui due tab.
5. **Contratti** (n; ok se c'è un contratto corrente, warn se no): tabella cliccabile + "Nuovo contratto".
6. **Consumi**: consumo annuo presunto, comunicato Consip, effettivo 12 mesi + tab consumi esistente.
7. **Controparti e finalità** (n).
8. **Note** (pallino): specifiche, note, note aggiuntive.
9. **Foto**. 10. **Storico**.

### Impianto
Header: icona tipo, "codice — nome", sottotitolo tipo; badge `plantStatus` + qualità posizione.
1. **Riepilogo**: tipo, codice, nome, stato, toponimo/indirizzo/civico, mappa, note. Anteprime: Immobili, Utenze, prossima verifica in scadenza, stato VVF/INAIL (solo termico).
2. **Dati tecnici** (solo termico/ascensore; tone warn se una certificazione obbligatoria manca).
3. **Presidi** (n; solo antincendio).
4. **Verifiche** (n; tone danger se scadute).
5. **Immobili** (n) e 6. **Utenze** (n): `LinkedTableComponent` al posto delle multi-select.
7. **Foto**. 8. **Storico**.

Tab per tipo in un'unica config `PLANT_TYPE_TABS: Record<PlantType, PlantTab[]>` in `plant.model.ts`; un tipo futuro dichiara lì i suoi tab.

### Contratto di fornitura
Header: icona contratto, CIG (o "CIG non specificato"), sottotitolo fornitore; badge `supplyContractStatus`.
1. **Riepilogo**: CIG/esente, chiuso, numero ordine, fornitore, convenzione e ordine CONSIP, date con barra di validità (decorrenza → scadenza, oggi marcato), scadenza gestione, voltura/cessazione. Anteprima: utenze per tipo.
2. **Utenze** (n): `LinkedTableComponent` (righe cliccabili, aggiungi, scollega), con filtro testo esistente.

### Contratto immobiliare
Header: icona per direzione (attivo/passivo), "controparte — tipo", sottotitolo oggetto; badge `grantStatus`.
1. **Riepilogo**: direzione, tipo, stato, controparte, oggetto, settore, tipo utilizzo, atto. Riquadro canone: canone + periodicità → canone annuo calcolato, decorrenza → scadenza con barra di validità, rinnovo e preavviso.
2. **Immobili** (n): `LinkedTableComponent` al posto della multi-select.
3. **Contratti collegati** (n): contratto padre (selezione + link alla scheda) e tabella figli cliccabile.
4. **Dati amministrativi** (pallino): registrazione/repertorio, dati catastali, superficie, note.
5. **Storico**.

## Gestione errori

Invariata: validazioni dei form esistenti; errori di salvataggio come oggi per ciascun dialog. Il navigatore registra in console un errore di GET e non apre il dialog. Un tab con campi invalidi mostra il pallino `danger` sull'etichetta, così l'errore non resta nascosto in un tab non visibile (oggi impossibile, ora che i campi sono distribuiti fra i tab).

## Test

- Unit (Karma/Jasmine): `entity-status.ts` (ogni ramo della tabella), `PLANT_TYPE_TABS`, `LinkedTableComponent` (emissione open/add/unlink, readOnly), `openSheet` (offset per livello).
- `ng build` reale (il type-check dei template sfugge a `tsc`).
- E2E Playwright su dati reali, per ciascuna delle 5 schede:
  - altezza e posizione costanti cambiando tab;
  - badge stato coerente e aggiornato cambiando il campo;
  - navigazione impilata (immobile → utenza → impianto → immobile) e ritorno;
  - aggiungi/scollega un collegamento e salva;
  - creazione nuova entità (tab che richiedono id disabilitati).
