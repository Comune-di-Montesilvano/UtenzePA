# Impianto elettrico dell'edificio — design

Data: 2026-10-15

## Obiettivo

Rappresentare l'impianto elettrico interno degli edifici comunali (scuole, uffici, palestre…) come impianto collegato all'immobile e all'utenza (POD), con i dati richiesti dalla normativa e le verifiche periodiche dell'impianto di terra:

- **DM 37/2008**: dichiarazione di conformità dell'installatore (DiCo) o, per impianti precedenti al 2008 senza DiCo, dichiarazione di rispondenza (DiRi);
- **DPR 462/2001**: messa in esercizio (la DiCo vale come omologazione ed è trasmessa all'INAIL), verifiche periodiche dell'impianto di terra ogni 2 anni (scuole, luoghi a maggior rischio di incendio, locali medici, luoghi con pericolo di esplosione) o 5 anni (altri), verifiche della protezione dalle scariche atmosferiche se presente.

Successo: ogni edificio può avere il suo impianto elettrico; la scheda mostra conformità, denuncia INAIL e classificazione; le verifiche DPR 462 compaiono da sole nel tab Verifiche con la periodicità giusta e alimentano le segnalazioni di scadenza già esistenti; i documenti (DiCo, verbali, progetti) vanno nel tab Documenti.

Fuori scope: inventario di quadri e componenti; sistema di distribuzione, gruppi elettrogeni, ente verificatore come dato di scheda (l'organismo è nella verifica); illuminazione di emergenza e allarme incendio (già tra i presidi antincendio); creazione degli impianti per gli edifici esistenti (lavoro dati dopo il rilascio).

## Decisioni (brainstorming 2026-10-15)

| Tema | Decisione |
|---|---|
| Nuovo tipo | `ELECTRICAL_SYSTEM`, «Impianto elettrico», icona `bolt` (`electrical_services` è già della cabina elettrica) |
| Scheda | quella richiesta dalla normativa: alimentazione, classificazione DPR 462, conformità (tipo, data, numero), denuncia INAIL (data, numero), protezione scariche atmosferiche |
| Verifiche | create/aggiornate dal sistema in base a classificazione e scariche atmosferiche; restano modificabili come le altre |
| Classificazione | scelta dall'operatore; proposta «maggior rischio» per un nuovo impianto collegato a un immobile scolastico |

## Modello dati (una migration)

- enum `plants.type`: aggiunto `ELECTRICAL_SYSTEM` (lista completa dei valori esistenti + il nuovo, come nelle migration precedenti dei tipi).
- nuova tabella `plant_electrical` (1:1 con `plants`, come `plant_elevator`):

| Colonna | Tipo | Valori |
|---|---|---|
| `plant_id` | int PK, FK `plants.id` ON DELETE CASCADE | |
| `supply` | enum NULL | `LV` (bassa tensione), `MV` (media tensione con cabina propria) |
| `grounding_class` | enum NULL | `ORDINARY` (5 anni), `HIGH_RISK` (2 anni: scuole, luoghi a maggior rischio di incendio, locali medici, aperti al pubblico), `EXPLOSION` (2 anni) |
| `conformity_type` | enum NULL | `DICO`, `DIRI` (null = non nota) |
| `conformity_date` | date NULL | |
| `conformity_number` | varchar(100) NULL | |
| `inail_date` | date NULL | data di invio della denuncia (messa in esercizio) |
| `inail_number` | varchar(100) NULL | numero pratica |
| `lightning_protection` | boolean NULL | null = non nota |

Il service elimina la riga `plant_electrical` se il tipo dell'impianto cambia (come per termico e ascensori).

## Regole

Funzioni pure in `plant.calc.ts` (testate), gemelle frontend dove servono:

- `GROUNDING_PERIOD_MONTHS = { ORDINARY: 60, HIGH_RISK: 24, EXPLOSION: 24 }`.
- Tipi di verifica: `GROUNDING_INSPECTION_KIND = 'Messa a terra (DPR 462/01)'`, `LIGHTNING_INSPECTION_KIND = 'Scariche atmosferiche (DPR 462/01)'`.
- `electricalInspectionPlan(electrical, existing)`: dato il dettaglio salvato e le verifiche non cancellate dell'impianto, restituisce le verifiche da creare e quelle di cui aggiornare la periodicità:
  - con `grounding_class` valorizzata: verifica «Messa a terra» con `period_months` della classe; se manca si crea (senza data: stato «Senza data»), se esiste con periodicità diversa si aggiorna la periodicità;
  - con `lightning_protection = true` e `grounding_class` valorizzata: stessa cosa per «Scariche atmosferiche»;
  - nessuna eliminazione: togliere la classificazione o le scariche atmosferiche lascia le verifiche esistenti (lo storico resta; l'operatore le elimina dal tab se vuole).
- Il service applica il piano dopo il salvataggio della scheda (stessa transazione del salvataggio dell'impianto), con audit come le verifiche create a mano.

Le segnalazioni «verifica scaduta / in scadenza» già esistenti per gli impianti valgono senza modifiche.

## Interfaccia

- Tipo «Impianto elettrico» nell'elenco tipi (`PlantType`, etichetta, icona `bolt`), tab `['technical', 'inspections']` in `PLANT_TYPE_TABS`.
- Tab **Dati tecnici** per il tipo: componente sul modello di quello degli ascensori, con:
  - Alimentazione (BT / MT con cabina propria);
  - Classificazione DPR 462 (ordinario — verifica ogni 5 anni / maggior rischio — 2 anni / pericolo di esplosione — 2 anni), con suggerimento «scuole, luoghi a maggior rischio di incendio, locali medici: maggior rischio»;
  - Conformità: tipo (DiCo / DiRi / non nota), data, numero;
  - Denuncia INAIL: data, numero pratica;
  - Protezione dalle scariche atmosferiche (sì / no / non nota).
  - Riga informativa: «Le verifiche DPR 462 sono create nel tab Verifiche al salvataggio».
- Proposta di classificazione: per un **nuovo** impianto elettrico, se un immobile collegato ha funzione con nome contenente «istruzion» o «scuol» (senza distinzione di maiuscole), il campo parte da «maggior rischio»; modificabile.
- Filtro dell'elenco impianti per tipo: il nuovo tipo compare da sé.
- Guida: sezione «Impianto elettrico di un edificio» (dati, verifiche DPR 462, documenti), data in testa.

## Test

- Backend:
  - `plant.calc.spec.ts`: `electricalInspectionPlan` (crea terra con 24/60 mesi; aggiorna periodicità al cambio classe; scariche atmosferiche solo se `true` e con classe; niente senza classe; nessuna eliminazione; verifiche cancellate ignorate);
  - `plants.service.spec.ts`: salvataggio del dettaglio elettrico, verifiche create, dettaglio eliminato al cambio tipo;
  - DTO: enum validi, date `@DateOnly()`.
- Migration: ciclo up → down → up; `schema:log` pulito sulle tabelle toccate. Il `down` si ferma con un errore esplicito se esistono impianti del nuovo tipo (anche cancellati logicamente): hanno collegamenti, verifiche e allegati che non si possono buttare in silenzio; senza impianti elettrici elimina la tabella e riduce l'enum.
- Frontend: `ng build`; prova reale con Playwright (nuovo impianto elettrico su una scuola: classificazione proposta, salvataggio, verifica «Messa a terra» con 24 mesi nel tab Verifiche; scariche atmosferiche sì → seconda verifica).

## Dati dopo il rilascio

Creazione degli impianti elettrici delle 9 scuole del progetto 2011 «Adeguamento impianti elettrici scuole» (sul DB locale, via API) con allegati scheda intervento, relazione, tavole e computo; poi gli altri edifici man mano che emergono DiCo e verbali dal fileserver.

## Rilascio

Minor con migration: v1.28.0.
