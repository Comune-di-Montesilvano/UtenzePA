# Immobili: unità catastali e dati di patrimonio MEF — design

Data: 2026-10-12

## Obiettivo

Fase 2 di 4 della voce 2 della roadmap (inventario patrimoniale e catasto), dopo i complessi (fase 1):

1. complessi (`2026-10-11-complessi-design.md`);
2. **immobili: unità catastali e dati di patrimonio** (questo documento);
3. import MEF 2025 (beni → immobili, coordinate → unità, compendi → complessi);
4. export MEF.

Allineare l'immobile al "bene" del censimento MEF "Patrimonio della PA" senza appesantirlo: un immobile = un bene MEF (chiave `mef_id`), con **N unità catastali**; i dati MEF che l'app non può ricavare diventano campi veri dell'immobile; quelli ricavabili (utilizzo, titolo, stato di accatastamento, tipologia e finalità) si calcolano.

Fuori scope: terreni (fase 5), diritti gravanti (solo terreni), valore di mercato e segnalazione per cessione, variazioni di proprietà/detenzione (export, fase 4), popolamento dei dati (import, fase 3).

## Contesto e analisi

Fonti: domini ufficiali MEF 2025 (`.audit-w/Istruzioni_per_la_compilazione_Immobili_Dati2025/`, "Domini ammissibili per il file csv"), censimento 2025 del Comune (146 fabbricati), incrocio con gli immobili dell'app (`.audit-w/mef_vs_app.py`, 110 abbinati).

- **Finalità MEF** compilata solo se l'utilizzo è "Utilizzato direttamente" (49 beni); vuota per i beni dati a terzi (86), inutilizzabili (9), non utilizzati (2). Dove c'è segue la funzione dell'app (Istruzione → Attività didattica, Sport → Attività sportiva, Uffici istituzionali → Attività amministrativa, il resto → Altro).
- **Tipologia del fabbricato MEF** descrive l'edificio, non l'uso: stessa funzione, edifici diversi (Residenziale → 48 Abitazione e 12 Cantina/box/garage). Le incoerenze attuali nascono da immobili dell'app che aggregano più beni MEF e si risolvono con la fase 3 (un immobile per bene, garage compresi). Si accetta l'imprecisione dei casi d'uso atipici (es. appartamento usato come scuola → "Edificio scolastico"), correggibile in futuro con un campo di correzione se servisse.
- **Titolo**: 145 su 146 "Proprietà (100%)".
- Catasto oggi sull'immobile: foglio/particella/sub su 58 immobili su 190, categoria e rendita su 11. Usati solo nel modulo immobili (backend e frontend).

## Modello dati

### Tabella `asset_cadastral_units`

| Colonna | Tipo | Note |
|---|---|---|
| `id` | int PK | |
| `asset_id` | int, FK `assets.id`, `ON DELETE CASCADE` | |
| `section` | varchar(5), nullable | sezione catastale |
| `sheet` | varchar(50), obbligatorio | foglio |
| `parcel` | varchar(50), obbligatorio | particella |
| `subordinate` | varchar(50), nullable | subalterno |
| `category` | varchar(100), nullable | categoria catastale (es. A/3) |
| `cadastral_income` | decimal(15,2), nullable | rendita |

Nessun `deleted`: le unità si sostituiscono in blocco con l'immobile (come le righe fattura). Indice su (`sheet`, `parcel`). Duplicati (stessa terna su immobili diversi) ammessi a livello di DB, segnalati (sotto).

### Colonne nuove su `assets` (tutte nullable)

| Colonna | Tipo | Valori |
|---|---|---|
| `mef_id` | int, unique | Id bene MEF; sola lettura in UI, valorizzato dall'import |
| `legal_nature` | enum | `AVAILABLE` Patrimonio disponibile (1), `UNAVAILABLE` Patrimonio indisponibile (2), `STATE_PROPERTY` Demanio (3), `ND` (4) |
| `reference_area_sqm` | decimal(10,2) | superficie di riferimento |
| `appurtenance_area_sqm` | decimal(10,2) | superficie aree pertinenziali |
| `volume_m3` | decimal(12,2) | cubatura |
| `construction_period` | enum | `BEFORE_1919` (1), `FROM_1919_TO_1945` (2), `FROM_1946_TO_1960` (3), `FROM_1961_TO_1970` (4), `FROM_1971_TO_1980` (5), `FROM_1981_TO_1990` (6), `FROM_1991_TO_2000` (7), `FROM_2001_TO_2010` (8), `AFTER_2010` (9), `ND` (100) |
| `heritage_constraint` | enum | `NONE` Nessuno (1), `CULTURAL_INTEREST` Dichiarazione di interesse culturale (2), `PUBLIC_INTEREST` Dichiarazione di notevole interesse pubblico (3), `LANDSCAPE_BY_LAW` Area tutelata per legge - interesse paesaggistico (4), `CULTURAL_CHECK_PENDING` Verifica dell'interesse culturale in corso (5), `OVER_70_YEARS` Sottoposto a tutela - immobile con più di 70 anni di autore non più vivente (6), `INDIRECT_PROTECTION` Prescrizioni di tutela indiretta (7) |
| `federal_transfer` | boolean | acquisito ai sensi del federalismo demaniale (null = non noto) |
| `confiscated` | boolean | confiscato alla criminalità organizzata (null = non noto) |

Rimosse da `assets` (spostate nelle unità): `sheet`, `parcel`, `subordinate`, `category`, `cadastral_value`. Restano `area_sqm` (superficie del bene) e `services_and_artifacts`.

### Colonne nuove su `asset_functions` (nullable)

| Colonna | Valori |
|---|---|
| `mef_building_type` | 26 tipologie del fabbricato MEF, codici 11–36: `DWELLING` Abitazione (11), `HOTEL` Albergo, pensione e assimilabili (12), `LIBRARY_MUSEUM` Biblioteca, pinacoteca, museo, gallerie (13), `STORAGE_GARAGE` Cantina, soffitta, rimessa, box, garage, posto auto… (14), `PRISON` Carcere… (15), `ROAD_HOUSE` Casa cantoniera (16), `BARRACKS` Caserma (17), `HISTORIC_PALACE` Palazzo storico, castello (18), `WORSHIP` Edificio di culto e assimilabili (19), `SCHOOL` Edificio scolastico (20), `PRODUCTIVE` Fabbricato per attività produttiva (21), `LIGHTHOUSE` Faro, torre per segnalazioni marittime (22), `FORTIFICATION` Fortificazioni e loro dipendenze (23), `SPORTS_FACILITY` Impianto sportivo (24), `LABORATORY` Laboratori scientifici (25), `SHOP` Locale commerciale, negozio (26), `WAREHOUSE` Magazzino e locali di deposito (27), `COVERED_MARKET` Mercato coperto (28), `HOSPITAL` Ospedali, case di cura, cliniche e assimilabili (29), `PARKING` Parcheggio collettivo (30), `BATHING_SPA` Stabilimento balneare e termale (31), `COLLECTIVE_RESIDENCE` Struttura residenziale collettiva (32), `THEATRE` Teatro, cinematografo, struttura per concerti e spettacoli (33), `OFFICE` Ufficio strutturato ed assimilabili (34), `ROOF_TERRACE` Lastrico solare (35), `URBAN_AREA` Area urbana (36) |
| `mef_purpose` | 20 finalità dei fabbricati MEF: `SERVICE_HOUSING` Alloggio di servizio, foresterie (1), `ADMINISTRATIVE` Attività amministrativa/uffici pubblici (2), `ARTS_CULTURE` Attività artistica e culturale (3), `COMMERCE_CATERING` Attività commerciale e di ristorazione (4), `WORSHIP` Attività di culto o assimilabili (5), `INSTITUTIONAL` Attività di rappresentanza istituzionale (6), `EDUCATION` Attività didattica (7), `JUDICIAL` Attività giudiziaria (8), `PRODUCTIVE` Attività produttiva (9), `SPORTS_LEISURE` Attività sportiva, ricreativa e di intrattenimento (10), `TOURISM` Attività turistica (11), `SOCIAL_HEALTH_NON_RES` Servizi assistenza socio-sanitaria (non residenziali) (14), `SOCIAL_HEALTH_RES` Servizi assistenza socio-sanitaria (residenziali) (15), `PUBLIC_ORDER` Servizi ordine pubblico, sicurezza nazionale e militare (16), `PENITENTIARY` Servizio penitenziario (17), `OTHER` Altro (18), `STUDENT_HOUSING` Alloggio per studenti (19), `RESEARCH` Attività di ricerca (20), `ACCESSORY` Servizi accessori (21), `PARKING` Parcheggio (22) |

Il codice MEF tra parentesi va in una mappa `MEF_CODE` accanto a ciascun enum (serve all'export, fase 4). Enum backend in `apis/asset/enum/mef-*.enum.ts` con gemelli frontend `pages/assets/mef-domains.ts` (etichette).

### Valori calcolati (nessun campo)

In `apis/asset/asset-mef.ts`, funzioni pure testate, con gemella SQL dove serve un filtro:

- **Utilizzo** (`assetUsage`, gemella `assetUsageSql`): contratto immobiliare con direzione ACTIVE e stato mostrato attivo o in scadenza, collegato all'immobile → `THIRD_PARTIES` "Dato interamente a uno o più soggetti terzi" (5); immobile Dismesso → `UNUSABLE` "Inutilizzabile" (2); altrimenti `DIRECT` "Utilizzato direttamente" (1). (Regola dei dismessi da riverificare con l'import MEF.)
- **Titolo**: `ownership = 1` → "Proprietà"; altrimenti nessuno (bene non del Comune).
- **Stato di accatastamento**: almeno un'unità → `ACCATASTATO`, altrimenti `NON_ACCATASTATO`.
- **Tipologia e finalità MEF**: dalla funzione; la finalità vale solo con utilizzo diretto (vuota altrimenti, come nel MEF).

L'API immobile restituisce `mef: { usage, usage_grant_id, title, cadastral_status, building_type, purpose }` in dettaglio ed elenco.

## Migration

Una migration con spostamento dati (regole `docs/claude/backend.md`):

1. controlli preliminari (SELECT) con errore leggibile: nessun immobile con `parcel` senza `sheet` o viceversa;
2. `CREATE TABLE asset_cadastral_units`, indice, FK;
3. `INSERT … SELECT` un'unità per ogni immobile con `sheet` e `parcel` valorizzati (sub, categoria, rendita compresi; `section` NULL);
4. `ALTER TABLE assets` aggiunge le colonne nuove e toglie le cinque spostate;
5. `ALTER TABLE asset_functions` aggiunge le due colonne.

`down()`: ricrea le cinque colonne, ricopia sull'immobile la **prima** unità (id minore), elimina il resto. Test con `QueryRunner` simulato fuori da `migrations/`, poi ciclo reale up → down → up confrontando i dati dei 58 immobili.

## Backend

- Entity `AssetCadastralUnit` (`apis/asset/entity/`), relazione `Asset.cadastralUnits` (OneToMany, `cascade`), caricata in `findAll`/`findOne`.
- DTO immobile: `cadastral_units?: CadastralUnitDto[]` (sezione, foglio, particella obbligatori, sub, categoria, rendita); se presente sostituisce l'insieme, se assente lascia invariato (come `lines` delle fatture). Audit: campo `cadastral_units` solo se cambia (testo "fg/part/sub" ordinato).
- DTO immobile: i campi nuovi con validazione enum; `mef_id` **non** nel DTO (sola lettura, lo scrive solo l'import).
- Ricerca immobili: i filtri `sheet`/`parcel`/`subordinate`/`category` diventano `EXISTS` sulle unità; filtri nuovi `legal_nature` e `usage` (via `assetUsageSql`).
- Funzioni immobile: DTO e entity con `mef_building_type`, `mef_purpose`.
- Anomalie (in fondo a `getAnomalies()`): `assets_without_cadastre` (proprietà Sì, nessuna unità), `assets_without_mef_id` (proprietà Sì, tipologia Fabbricato, `mef_id` NULL), `units_without_subordinate` (due o più immobili con stessa via, civico, foglio e particella e almeno un'unità senza sub), `functions_without_mef_type` (funzioni usate da immobili di proprietà senza `mef_building_type`).
- Ricerca per catasto nel resto del codice: nessun altro uso oggi (verificato); gli script dati in `.audit-w/` si aggiornano nella fase 3.

## Frontend

### Scheda immobile

Nessun tab nuovo: il tab **Catasto** diventa **"Catasto e patrimonio"** (`aria-label` uguale all'etichetta) e raccoglie tutto il patrimoniale, in quattro sezioni una sotto l'altra:

```
Catasto e patrimonio
├─ Unità catastali     tabella: sezione | foglio | particella | sub | categoria | rendita   + Aggiungi
├─ Consistenza         superficie · sup. riferimento · sup. pertinenze · cubatura · epoca
├─ Patrimonio          natura giuridica · vincolo · federalismo · confiscato
└─ Per il MEF ▸        riquadro richiudibile (chiuso di default), sola lettura
```

- **Unità catastali**: tabella modificabile con aggiungi/modifica/rimuovi in riga, `FormArray` salvato con il **Salva** della scheda; vuota → "Nessuna unità catastale (immobile non accatastato)"; rimuovi chiede conferma.
- **Consistenza**: superficie (esistente), superficie di riferimento, superficie delle pertinenze, cubatura, epoca di costruzione; Servizi/manufatti come oggi.
- **Patrimonio**: natura giuridica, vincolo culturale/paesaggistico, federalismo demaniale, bene confiscato (select a tre stati Sì/No/Non noto).
- **Per il MEF** (`mat-expansion-panel` chiuso di default), con la provenienza di ogni valore: Id bene MEF; titolo (da Proprietà); stato di accatastamento (dalle unità); utilizzo (con link al contratto che lo determina); tipologia e finalità (dalla funzione, con link all'anagrafica funzioni; avviso se la funzione non le ha).
- Pallino del tab sui valori di unità, consistenza e patrimonio; pallino rosso su unità invalide (foglio o particella mancanti).
- Riepilogo, Utenze, Impianti, Contratti, Note, Foto, Storico invariati.

### Elenco immobili

- Colonne: tolte Foglio/Particella/Subalterno/Categoria/Valore catastale singoli, aggiunte "Catasto" (unità come "fg 16 part 492 sub 3", più unità separate da virgola), "Natura giuridica", "Utilizzo", "Id MEF" (nascoste di default).
- Filtri: Foglio, Particella (sulle unità), Natura giuridica, Utilizzo.
- Segnalazioni (`ASSET_SIGNALS`): "Senza catasto", "Senza Id MEF", "Sub da assegnare".

### Anagrafica funzioni

Due select "Tipologia fabbricato MEF" e "Finalità MEF" nella scheda funzione; colonna nell'elenco; segnalazione "Senza tipologia MEF".

## Guida operatori

Data in testa aggiornata; sezione "Catasto e dati di patrimonio" (tab "Catasto e patrimonio": unità catastali, consistenza, patrimonio, riquadro "Per il MEF" con cosa è calcolato e da dove); righe nuove nella tabella "Segnalazioni per elenco"; anagrafica funzioni (tipologia e finalità MEF).

## Test

- Migration: spec con `QueryRunner` simulato (controlli, insert-select, down), ciclo reale up → down → up con confronto dei dati.
- `asset-mef.spec.ts`: utilizzo (contratto attivo, in scadenza, scaduto, passivo, dismesso, nessuno), titolo, stato di accatastamento, finalità vuota se non diretto.
- `assets.service.spec.ts`: sostituzione delle unità, PATCH senza `cadastral_units` invariato, audit solo se cambiano, filtri `EXISTS`.
- Anomalie: query nuove nella spec (mock posizionali in fondo).
- `ng build`; E2E Playwright: aggiungi due unità, salva, riapri; sezione Patrimonio e riquadro "Per il MEF" con utilizzo da contratto; segnalazioni.

## Rilascio

Minor con migration che sposta dati: `softwareVersion` successiva a quella dei complessi (1.19.0 se i complessi escono come 1.18.0); nota di rilascio: migration che sposta il catasto nelle unità, nessun intervento manuale.
