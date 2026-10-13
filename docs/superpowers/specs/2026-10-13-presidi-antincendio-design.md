# Presidi antincendio: nuovi tipi, quantità, scadenze degli estintori — design

Data: 2026-10-13

## Obiettivo

Registrare per intero la consistenza antincendio 2025 (`W:\PATRIMONIO\4_IMMOBILIARE\01_CONSISTENZE_CENSIMENTI\CONSISTENZE 2025\01_CONSISTENZA ANTINCENDIO 2025`):

1. il **censimento generale** (`00_censimento antincendio comune di montesilvano.xlsx`, 38 edifici) conta, oltre a idranti, naspi e attacchi VVF, anche **rivelatori di fumo, pulsanti di allarme, centrali di rivelazione, segnalatori ottico-acustici e sirene/campane**: oggi non hanno un tipo;
2. questi dispositivi sono **contati, non inventariati** (nessuna matricola): serve una **quantità** sulla riga;
3. le **scadenze degli estintori** oggi stanno nelle note (`scad. carica 2017; scad. collaudo 2017; ultima verifica 2014`): non si filtrano, non generano segnalazioni.

Successo: la scheda dell'impianto antincendio mostra tutti i presidi con quantità e scadenze; l'elenco impianti segnala gli impianti con estintori scaduti.

Fuori scope: caricamento delle quantità del censimento 2025 (lavoro dati, dopo, sul DB locale); campi degli ascensori; contratto di manutenzione degli impianti (progettazione a parte).

## Decisioni (brainstorming 2026-10-13)

| Tema | Decisione |
|---|---|
| Nuovi tipi | rivelatore di fumo, pulsante di allarme, centrale di rivelazione, segnalatore ottico-acustico, sirena/campana |
| «Vetri crash» del censimento | non un tipo: sono i vetri «safe crash» delle cassette di idranti e naspi (stesso numero delle cassette in ogni edificio); al più una nota sull'idrante |
| Tubi e lance UNI 45 | contenuto della cassetta idrante, già rappresentata dall'idrante |
| Quantità | intero ≥ 1, default 1, su ogni riga di ogni tipo; gli estintori restano una riga ciascuno (matricola) |
| Precisione delle date | **mese/anno** (`mm/aaaa`), come il cartellino; salvate come primo giorno del mese |
| Dati importati con il solo anno | gennaio di quell'anno, con l'indicazione «date importate: solo anno» nella nota |
| Campi dell'estintore | **ultimo controllo** (semestrale), **scadenza revisione**, **scadenza collaudo**: le scadenze si salvano come scritte sul cartellino, nessuna regola per agente |
| Stato | per estintore e per impianto; segnalazione «Presidi scaduti» nell'elenco impianti |

## Modello dati

Tabella `plant_fire_equipment` (una migration):

| Colonna | Tipo | Note |
|---|---|---|
| `equipment_type` | enum + `SMOKE_DETECTOR`, `ALARM_BUTTON`, `DETECTION_PANEL`, `ALARM_SIGNAL`, `SIREN` | valori esistenti invariati |
| `quantity` | int NOT NULL default 1 | DTO: `@IsInt() @Min(1)` |
| `last_check_on` | date NULL | ultimo controllo semestrale, primo giorno del mese |
| `revision_due_on` | date NULL | scadenza revisione (ricarica), primo giorno del mese |
| `test_due_on` | date NULL | scadenza collaudo, primo giorno del mese |

Le tre date valgono solo per `EXTINGUISHER`: il service le azzera per gli altri tipi (anche al cambio tipo). Nel DTO: `@DateOnly()`, normalizzate al primo del mese lato server.

### Conversione delle note (nella migration)

Sulle righe `EXTINGUISHER` non cancellate, le note nel formato importato:

- `scad. carica AAAA` → `revision_due_on = AAAA-01-01`
- `scad. collaudo AAAA` → `test_due_on = AAAA-01-01`
- `ultima verifica AAAA` → `last_check_on = AAAA-01-01`

I pezzi riconosciuti spariscono dalla nota; il resto (es. «armeria») resta, preceduto da `date importate: solo anno`. Nota senza nessun pezzo riconosciuto: invariata. Dati di oggi: 251 estintori con tre anni, 45 con due, 1 con «armeria», 1 senza note.

`down`: ricompone le note dalle colonne nello stesso formato (`scad. carica AAAA; scad. collaudo AAAA; ultima verifica AAAA`, più il testo residuo), poi elimina le colonne e riporta l'enum ai 4 valori (prima di farlo cancella fisicamente le righe dei nuovi tipi, segnalandolo nel log della migration).

Verifica: SELECT di controllo prima dei DDL, test con `QueryRunner` simulato fuori da `migrations/`, ciclo up → down → up sui dati veri (note identiche dopo il giro).

## Stato di un estintore

In `plant.calc.ts` (gemello frontend in `plant.model.ts`, da tenere allineati):

- una scadenza `mm/aaaa` vale fino all'**ultimo giorno di quel mese**;
- scadenza del controllo = ultimo controllo + 6 mesi (stessa regola di fine mese);
- stato di ciascuna scadenza con le soglie delle verifiche (`inspectionStatus`: scaduta, entro 60 giorni, in regola);
- **stato dell'estintore** = il peggiore delle tre scadenze presenti; nessuna data → «Senza data»;
- stato dei presidi di un impianto (`fire_equipment_status`, nella risposta dell'impianto come `inspection_status`) = il peggiore tra i suoi estintori; nessun estintore → `null`.

Gli altri tipi non hanno stato.

## Interfaccia

### Tab «Presidi» (`plant-fire-equipment-tab.component.ts`)

- Form: tipo (9 voci), **quantità**; per gli estintori anche matricola, agente, capacità e i tre campi `mm/aaaa` (ultimo controllo, scadenza revisione, scadenza collaudo); ubicazione e note per tutti. Il formato `mm/aaaa` si valida nel campo (mese 01–12, anno a 4 cifre).
- Tabella: colonne Tipo, Q.tà, Matricola, Agente, Capacità, Ubicazione, Controllo, Revisione, Collaudo, stato (pallino con i colori delle verifiche, tooltip con la scadenza che lo determina), Note.
- Totali con le quantità: «12 estintori · 8 rivelatori di fumo · 1 centrale».

### Elenco impianti

- Nuova segnalazione **«Presidi scaduti»** (`PLANT_SIGNALS`), alimentata dall'anomalia `plants_fire_equipment_overdue` (impianti non cancellati con almeno un estintore non cancellato scaduto), aggiunta in fondo a `getAnomalies()` (la spec delle anomalie usa mock posizionali).
- Con i dati attuali (scadenze 2016–2020) risulteranno scaduti quasi tutti gli impianti antincendio: è atteso.

### Guida

Sezione impianti: nuovi tipi di presidio, quantità, scadenze `mm/aaaa`, segnalazione «Presidi scaduti». Data in testa aggiornata.

## Test

- Backend:
  - `plant.calc.spec.ts`: fine mese, +6 mesi del controllo, peggiore delle tre, «Senza data», stato dell'impianto;
  - conversione delle note (funzione pura usata dalla migration, testata a parte) e `QueryRunner` simulato;
  - anomalia `plants_fire_equipment_overdue` in `anomalies.service.spec.ts`;
  - service: date azzerate per i tipi diversi dall'estintore, quantità ≥ 1.
- Frontend: `ng build`; prova reale con Playwright (nuovo presidio con quantità, estintore con scadenze, pallino, segnalazione nell'elenco).

## Rilascio

Minor con migration: v1.24.0.
