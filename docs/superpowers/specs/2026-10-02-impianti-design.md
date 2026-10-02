# Impianti (entità unificata) — design

Data: 2026-10-02

## Obiettivo

Introdurre l'entità **Impianto**: oggetto tecnico (centrale termica, ascensore, antincendio, fotovoltaico, fontana, semaforo, pompa di sollevamento, quadro di pubblica illuminazione…) con posizione propria, legato facoltativamente a un immobile, alimentato da zero o più utenze, con dati tecnici per tipo e **scadenzario delle verifiche periodiche**.

Due effetti collaterali voluti:

1. l'anagrafe **immobili** torna a contenere solo patrimonio vero: circa 240 "immobili" creati in Access solo per agganciare un'utenza (punti luce, fontane, pompe, semafori, cabine…) diventano impianti;
2. il "minestrone" del vecchio campo utilizzatore (concessioni mescolate a destinazioni d'uso e note sul contatore) si risolve insieme ai contratti immobiliari, con tre destinazioni: contratti, impianti, note utenza.

Fuori scope:

- censimento dei singoli punti luce (consistenza CPL 2014, 8.371 punti): import futuro;
- aree verdi, inventario catastale, complessi: voci separate della roadmap (`docs/roadmap-patrimonio.md`);
- contratti di manutenzione collegati agli impianti (roadmap voce 7).

## Contesto

- Ogni utenza oggi ha esattamente un immobile (660/660, tabella `utility_assets`); la mappa posiziona le utenze con le coordinate dell'immobile.
- Immobili candidati (per prefisso del nome): 243. Di questi 229 hanno un'utenza, 10 nessuna (cabine), 4 due utenze (es. fontana con acqua e luce). Nessuna foto collegata.

| Prefisso `asset_name` | Quanti | Tipo impianto |
|---|---|---|
| `pi`, `piver`, `pirot` | 146 | Pubblica illuminazione |
| `fon` | 40 | Fontana |
| `pom` | 16 | Pompa di sollevamento |
| `sem` | 11 | Semaforo |
| `cabina` | 10 | Cabina elettrica |
| `bike` | 7 | Bike station |
| `cas` | 4 | Casetta dell'acqua |
| `telecam` | 3 | Videosorveglianza |
| `colonninataxi` | 3 | Arredo urbano alimentato |
| `punto` | 3 | Punto presa / alimentazione eventi |

- FK verso `assets` oggi: `thermal_plants.asset_id_fk`, `utility_assets.asset_id`, `utilizer_grant_assets.asset_id` (branch contratti immobiliari).
- La classificazione v1.3.0 degli immobili (tipologia) è quasi tutta vuota nel DB locale (469/477): nessun conflitto con la tipologia "Impianto" degli immobili, che resta per i manufatti impiantistici che sono beni patrimoniali (es. un impianto sportivo).
- "Finalità d'uso" esistente = categorie standard per la richiesta al fornitore (uso cottura, riscaldamento…): **non** si usa per dire "cosa alimenta il contatore". Quell'informazione è il collegamento utenza → impianto.

## Decisioni

- Impianto = entità autonoma con posizione propria; collegato a zero o più immobili (`plant_assets`, es. centrale termica che serve più edifici; decisione 2026-10-02, sostituisce l'immobile contenitore unico).
- Tabella base `plants` + tabelle figlie solo per i tipi con dati ricchi (termico, ascensore, antincendio) + scadenzario generico `plant_inspections`.
- Utenza ↔ impianto molti-a-molti (`utility_plants`), come utenza ↔ immobile. Un'utenza deve avere almeno un immobile **o** un impianto.
- Gli impianti termici della v1.6.0 confluiscono in `plants` + `plant_thermal` (nessuna perdita, `thermal_plants` rimossa).
- La riclassificazione immobile → impianto è uno **script con prova** (`.audit-w/impianti/`, dati reali fuori repo), non una migration: richiede giudizio e revisione dell'utente; la migration fa solo le trasformazioni strutturali.
- Si sviluppa **sullo stesso branch** dei contratti immobiliari (`feat/contratti-immobiliari`): pulizia del minestrone fatta una volta, rilascio unico v1.7.0.
- Tipi in enum (i tipi con tabelle figlie hanno logica dedicata nel codice); nessun tipo generico "Altro".

## Schema DB

### `plants`

| colonna | tipo | note |
|---|---|---|
| `id` | int PK | |
| `type` | enum(`THERMAL`,`ELEVATOR`,`FIRE_PROTECTION`,`PHOTOVOLTAIC`,`PUBLIC_LIGHTING`,`TRAFFIC_LIGHT`,`LIFTING_PUMP`,`FOUNTAIN`,`ELECTRICAL_CABIN`,`WATER_KIOSK`,`VIDEO_SURVEILLANCE`,`BIKE_STATION`,`POWER_POINT`,`WATER_POINT`,`SEWAGE`,`IRRIGATION`,`POWERED_STREET_FURNITURE`) | |
| `code` | varchar(100), unique tra i non cancellati (verifica nel service) | per i migrati = vecchio `asset_name` (es. `fon_17`) |
| `name` | varchar(255) | descrizione |
| `toponym`, `address`, `civic_number` | varchar, nullable | come `assets` |
| `latitude`, `longitude` | varchar(20), nullable | come `assets` (formato e helper invariati) |
| `geocoded_latitude`, `geocoded_longitude`, `geocoded_at` | come `assets` | |
| `status` | enum(`ACTIVE`,`DECOMMISSIONED`,`TO_VERIFY`), default `ACTIVE` | |
| `notes` | text, nullable | |
| audit standard | `create_date`, `update_date`, `created_by_user_id`, `updated_by_user_id`, `deleted` | |

Etichette UI dei tipi: Termico, Ascensore, Antincendio, Fotovoltaico, Pubblica illuminazione, Semaforo, Pompa di sollevamento, Fontana, Cabina elettrica, Casetta dell'acqua, Videosorveglianza e antenne, Bike station, Punto presa / alimentazione eventi, Presa d'acqua, Depurazione e fognatura, Irrigazione, Arredo urbano alimentato.

### `plant_assets`

`(plant_id, asset_id)` PK composta, FK CASCADE: immobili collegati all'impianto (migration `1791200000000-PlantAssets`, che copia il vecchio `asset_id_fk`).

### `utility_plants`

`(utility_id, plant_id)` PK composta, FK CASCADE, come `utility_assets`.

### `plant_thermal` (1:1, solo `THERMAL`)

`plant_id` PK/FK + tutte le colonne specifiche di `thermal_plants` v1.6.0: `power_kw`, `generators_description`, `vvf_certification`, `vvf_exempt`, `inail_certification`, `inail_exempt`, `served_area_sqm`, `water_room`, `outdoor_units`, `indoor_units`, `fan_coils`, `air_handling_units`, `chillers_heat_pumps`. Obblighi calcolati dalla potenza invariati (`thermal-plant-obligations.ts`).

### `plant_elevator` (1:1, solo `ELEVATOR`)

`plant_id` PK/FK, `serial_number` (matricola), `plant_number` (n. impianto), `manufacturer`, `year`, `test_date` (collaudo), `elevator_type` (ascensore/montacarichi/piattaforma), `drive` (elettrico/oleodinamico), `capacity_kg`, `stops`, `speed`.

### `plant_fire_equipment` (N righe, solo `FIRE_PROTECTION`)

`id`, `plant_id` FK, `equipment_type` enum(`EXTINGUISHER`,`HYDRANT`,`HOSE_REEL`,`FIRE_BRIGADE_CONNECTION`), `serial_number`, `agent` (polvere/CO2/…), `capacity` (kg o litri, testo breve), `location` (piano/locale), `notes`, audit standard.

Un impianto antincendio per edificio (o per corpo di fabbrica); i presidi sono le righe figlie.

### `plant_inspections` (scadenzario, tutti i tipi)

| colonna | tipo | note |
|---|---|---|
| `id` | int PK | |
| `plant_id` | int FK | |
| `kind` | varchar(150) | es. "Verifica periodica biennale", "Manutenzione semestrale estintori" |
| `period_months` | int, nullable | ricorrenza |
| `last_date` | date, nullable | |
| `next_date` | date, nullable | calcolata come `last_date + period_months` al salvataggio se non indicata; modificabile |
| `provider` | varchar(255), nullable | ente o ditta |
| `outcome` | varchar(255), nullable | esito |
| `notes` | text, nullable | |
| audit standard | | |

Stato derivato: `OVERDUE` (`next_date` < oggi), `DUE_SOON` (entro 60 giorni), `OK`, `NO_DATE`.

Proposte di periodicità (precompilate alla creazione di una verifica, modificabili; indicative, non vincolanti):

| Tipo | Verifica | Mesi |
|---|---|---|
| Ascensore | Verifica periodica (ente notificato) | 24 |
| Ascensore | Manutenzione ordinaria | 6 |
| Antincendio | Controllo periodico estintori | 6 |
| Antincendio | Controllo idranti e naspi | 6 |
| Termico | Controllo di efficienza energetica | 48 (24 oltre 100 kW) |
| Fotovoltaico | Manutenzione / verifica impianto | 12 |

### `photos`

`entity_type` aggiunge `plant` (galleria foto esistente).

## Tipologia immobile "Impianto" rimossa

La classificazione v1.3.0 degli immobili (`1790400000000-AddAssetClassification`) prevede la tipologia "Impianto" con le funzioni elencate sotto. Con l'entità Impianto quella tipologia non ha più senso: un dispositivo o punto di fornitura tecnico **non è un immobile**. Le sue funzioni diventano tipi di impianto:

| Funzione immobile (tipologia Impianto) | Tipo impianto |
|---|---|
| Illuminazione pubblica | `PUBLIC_LIGHTING` |
| Semaforo | `TRAFFIC_LIGHT` |
| Fontana | `FOUNTAIN` |
| Casetta dell'acqua | `WATER_KIOSK` |
| Pompa di sollevamento | `LIFTING_PUMP` |
| Cabina elettrica | `ELECTRICAL_CABIN` |
| Videosorveglianza e antenne | `VIDEO_SURVEILLANCE` |
| Bike sharing | `BIKE_STATION` |
| Presa energia elettrica | `POWER_POINT` |
| Presa d'acqua | `WATER_POINT` |
| Depurazione e fognatura | `SEWAGE` |
| Irrigazione | `IRRIGATION` |
| Altro | nessuno (voce generica eliminata) |

Regola di classificazione degli immobili aggiornata (commento in `AddAssetClassification` e testi UI): 1) edificio chiuso → Fabbricato; 2) opera costruita non chiusa → Manufatto; 3) altrimenti superficie scoperta → Area. Un dispositivo o punto di fornitura tecnico va negli Impianti.

## Migration (strutturale)

Solo trasformazioni strutturali (decisione 2026-10-02: prima il codice, poi la migrazione dei dati fatta a mano sul DB locale, copia della produzione):

1. Crea `plants`, `utility_plants`, `plant_thermal`, `plant_elevator`, `plant_fire_equipment`, `plant_inspections`; estende l'enum di `photos.entity_type`.
2. Per ogni riga di `thermal_plants` non cancellata: inserisce `plants` (`type='THERMAL'`, `code='TERM-<id>'`, `name`, `asset_id_fk`, `notes`) + `plant_thermal`; se `utility_id_fk` valorizzato, riga in `utility_plants`.
3. Rimuove `thermal_plants`.

La rimozione della tipologia "Impianto" e delle sue funzioni dagli immobili è un passo della migrazione manuale dei dati (le tipologie presenti nel DB di produzione non coincidono con il seed v1.3.0): soft delete in `asset_natures`/`asset_functions` e delle coppie in `asset_nature_functions`, dopo la conversione degli immobili. Il codice non dipende da quei record.

La migration non tocca gli immobili: la riclassificazione è nello script.

## Riclassificazione immobili → impianti (script)

`.audit-w/impianti/assets_to_plants.py`, modalità `--dry-run` con report, poi applicazione in transazione dopo conferma dell'utente. Si convertono gli immobili che:

- hanno tipologia "Impianto": il tipo si ricava dalla funzione (tabella della sezione precedente); senza funzione o con "Altro" → segnalati nel report, non convertiti;
- oppure hanno un `asset_name` che corrisponde alla mappa prefisso → tipo (tabella in Contesto, regex esplicite, nessuna euristica sul testo libero).

Per ognuno:

1. crea `plants` con `code = asset_name`, `name = associated_building` (o `asset_name` se vuoto), indirizzo e coordinate (anche geocodificate) copiati, `notes` = `specific_details`/`memo` concatenati;
2. sposta le utenze: per ogni riga `utility_assets(utility, asset)` crea `utility_plants(utility, plant)` e cancella la riga `utility_assets`;
3. soft delete dell'immobile (`deleted = 1`) con nota nel report;
4. le righe del vecchio registro concessioni (`utilizer_grant`) che puntano a quell'immobile vengono soft-deleted (sono le etichette "PUBBLICA ILLUMINAZIONE", "POMPA DI SOLLEVAMENTO"…): questo passo sostituisce il gruppo "destinazione d'uso" della pulizia contratti per quegli immobili.

Report: impianti creati per tipo, utenze spostate, immobili con 0 o più utenze, nomi che non corrispondono alla mappa ma sembrano impianti (solo segnalati, non migrati).

Ordine complessivo dei dati (tutto su DB locale, poi export verso produzione come per gli altri import):

1. deploy della migration (impianti termici → `plants`);
2. riclassificazione immobili → impianti;
3. pulizia del registro concessioni (script contratti, gruppi ridotti: contratti veri restano, note utenza → note, scuole → report complessi, destinazioni residue → soft delete);
4. import contratti immobiliari;
5. import impianti da fonti (sezione successiva).

## Import impianti dalle fonti

Script `.audit-w/impianti/import_plants.py`, stesso schema prova/conferma:

| Fonte (`4_IMMOBILIARE/01_CONSISTENZE_CENSIMENTI/CONSISTENZE 2025/`) | Diventa |
|---|---|
| `02_CONSISTENZA ASCENSORI 2025/0 REGISTRO ascensori comunali.xlsx` (anagrafe + scadenzario) e schede in `anagrafica ascensori/` | ~10 impianti `ELEVATOR` + `plant_elevator`; verifiche periodiche 2024/2025 come `plant_inspections` (ultima e prossima) |
| `01_CONSISTENZA ANTINCENDIO 2025/` (schede per edificio: estintori con matricola/tipo/kg/carica, idranti, naspi, attacchi VVF) | un impianto `FIRE_PROTECTION` per scheda/edificio + righe `plant_fire_equipment`; verifica "Controllo periodico estintori" con data della scheda se presente |
| `04_CONSISTENZA IMPIANTI FOTOVOLTAICI/Impianti fotovoltaici.xls` | 1 impianto `PHOTOVOLTAIC` (Trisi, 17,16 kWp, convenzione GSE, POD collegato all'utenza) |

Abbinamento all'immobile contenitore per nome edificio/indirizzo, solo se univoco; altrimenti impianto senza immobile e riga nell'Excel "da abbinare".

## Posizione degli impianti

Situazione dei 243 candidati: 0 con coordinate inserite a mano, 211 con sola posizione geocodificata dall'indirizzo (per punti luce, pompe, semafori di solito è il centro della via, non il punto reale), 32 senza alcuna posizione (indirizzo presente, geocodifica fallita).

Regole:

1. **Posizione mostrata**, in ordine di priorità: coordinate inserite a mano → coordinate del primo immobile collegato che ne ha una (impianti interni a un edificio: ascensore, termico, antincendio non hanno bisogno di coordinate proprie) → coordinate geocodificate dall'indirizzo.
2. **Qualità della posizione**, calcolata e mostrata con un badge in elenco e nel dialog: *precisa* (inserita a mano), *dall'immobile*, *stimata* (geocodifica), *assente*.
3. **Impianti senza posizione**: non compaiono in mappa (come oggi gli immobili senza coordinate); filtro "posizione: assente / stimata" nell'elenco; anomalia "impianti senza posizione" in dashboard (solo *assente*, le *stimate* sarebbero troppo rumorose).
4. **Correzione**: nel dialog impianto la mini-mappa esistente (`LocationMapComponent`) mostra la posizione stimata e permette di fissare quella reale con un clic, come già per gli immobili. Per gli impianti con immobile contenitore la mini-mappa è in sola anteprima (posizione ereditata), con la possibilità di sovrascriverla.
5. **Foto**: tab Foto con la galleria esistente (`entity_type = 'plant'`), stesso caricamento e limiti delle foto di immobili e utenze.

## API

- `GET/POST /plants`, `GET/PATCH/DELETE /plants/:id`; filtri: `type`, `status`, `asset_id`, `utility_id`, `inspection` (`overdue`, `due_soon`), `q`.
- Dettaglio con: immobile, utenze, dati specifici del tipo (`thermal`, `elevator`), presidi antincendio, verifiche con stato derivato; per `THERMAL` anche gli obblighi calcolati (VVF/INAIL/efficienza).
- `POST/PATCH/DELETE /plants/:id/inspections[/:inspId]`, idem `/plants/:id/fire-equipment`.
- `GET /plants/summary`: conteggi per tipo, verifiche scadute/in scadenza, impianti senza posizione.
- Filtro `position` (`precise`, `from_asset`, `estimated`, `missing`) e campo calcolato `position_quality` in ogni riga.
- Utenze: DTO con `asset_ids` e `plant_ids`; validazione "almeno un immobile o un impianto". Le risposte delle utenze includono gli impianti collegati.
- Endpoint impianti termici v1.6.0 (`/thermal-plants`, `/assets/:id/thermal-plants`, `/utilities/:id/thermal-plants`): rimossi, sostituiti da `/plants?type=THERMAL`, `/plants?asset_id=`, `/plants?utility_id=`.
- Geocodifica: `GeocodingService` estesa agli impianti senza coordinate (stesso scan all'avvio e stesso pulsante manuale).

## UI

- Menu Patrimonio: **"Impianti"** sostituisce "Impianti termici". Elenco con filtro per tipo (chip o select), stato, immobile, verifiche (scadute / entro 60 giorni), ricerca libera, scelta colonne, export CSV; totale per tipo.
- **Dialog impianto**, tab: *Dati* (tipo, codice, nome, immobile, posizione con mini-mappa come immobili, stato, note); *Dati tecnici* (solo termico/ascensore, campi del tipo; per il termico gli obblighi calcolati come in v1.6.0); *Presidi* (solo antincendio: tabella editabile); *Verifiche* (scadenzario con stato colorato, periodicità proposta per tipo); *Utenze* (collegamento multiplo); *Foto*; *Storico*.
- **Dialog immobile**: tab "Impianti" (sostituisce "Impianti termici") con gli impianti contenuti, di ogni tipo.
- **Dialog utenza**: oltre agli immobili, selezione degli impianti alimentati; riquadro "Alimenta:" generalizzato (oggi solo termici).
- **Mappa**: livello impianti con icona per tipo (`L.divIcon`, CSS in `styles.scss` globale come da CLAUDE.md); le utenze collegate solo a impianti si posizionano con le coordinate dell'impianto; filtro per tipo impianto.
- **Dashboard**: card "Verifiche impianti" (scadute, entro 60 giorni) con link all'elenco filtrato; anomalia "impianti senza posizione".

## Test

- Unit: calcolo `next_date` e stato derivato delle verifiche (fine mese, 29 febbraio, senza periodicità).
- Unit: validazione utenza "almeno un immobile o un impianto"; codice impianto univoco tra i non cancellati.
- Unit: obblighi termici invariati dopo il passaggio a `plant_thermal`.
- Migration su copia del DB locale: 46 impianti termici in `plants`/`plant_thermal`, collegamenti utenza conservati, `thermal_plants` rimossa.
- Script di riclassificazione: prova con conteggi per tipo coerenti con la tabella di Contesto; nessuna utenza resta senza immobile né impianto.
- E2E Playwright: creazione ascensore con verifica che scade entro 60 giorni → compare in dashboard; utenza di una fontana migrata posizionata in mappa con le coordinate dell'impianto; dialog immobile mostra gli impianti contenuti.

## Rilascio

Insieme ai contratti immobiliari, v1.7.0 (stesso branch). Ordine in produzione: deploy (migration) → script nell'ordine della sezione "Riclassificazione" → verifica dei report.
