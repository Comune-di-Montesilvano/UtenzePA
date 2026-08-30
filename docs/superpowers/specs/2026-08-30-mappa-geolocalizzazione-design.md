# Mappa geolocalizzazione immobili/contatori — design

Data: 2026-08-30

## Obiettivo

Nuova sezione "Mappa" in sidebar che mostra geolocalizzati tutti gli immobili
(asset) e i contatori (utility) che hanno coordinate GPS. Quelli che hanno
solo indirizzo vengono comunque mostrati (geocodificati automaticamente),
ma distinti graficamente da quelli con GPS reale. La mappa è visibile anche,
in forma ridotta, nel dialog di modifica di un singolo immobile/contatore.

## Contesto rilevante

- `Asset` (`backend/src/apis/asset/entity/asset.entity.ts`) ha già
  `latitude`/`longitude` (varchar(20) nullable) e indirizzo strutturato
  (`toponym`, `address`, `civic_number`, `zip_code`, `municipality`).
- `Utility` (`backend/src/apis/utility/entity/utility.entity.ts`) ha
  `latitude`/`longitude` proprie, ma **nessun campo di indirizzo fisico**
  (`supplier_address` è l'indirizzo di fatturazione del fornitore, non la
  posizione fisica del contatore). La posizione fisica di un contatore è
  quindi sempre quella dell'asset collegato (`asset_id_fk`), salvo un GPS
  manuale proprio.
- Nessuna libreria mappe presente nel frontend. Nessun servizio di geocoding
  nel backend.
- Non esiste una pagina "dettaglio" dedicata per asset/utility: si editano
  via dialog (`AssetEditDialogComponent`, `UtilityEditDialogComponent`).

## Decisioni

- Geocoding **automatico** via Nominatim (OpenStreetMap), nessuna API key.
- Scan geocoding gira **all'avvio del backend** (una volta), non un cron
  periodico. Una volta cachato il risultato non viene rifatto, solo se
  l'indirizzo cambia in un update successivo.
- Pin "GPS reale" vs "stimato da indirizzo" distinti per **colore**.
- Mappa nel dialog edit: visualizzazione **+ selezione manuale** (click per
  impostare lat/long).
- Contatore senza propri lat/long: **eredita** la posizione dell'asset
  collegato (reale o stimata, con lo stesso colore ereditato).
- Click su un pin nella mappa sidebar: apre **subito** l'edit-dialog
  esistente di quell'immobile/contatore.
- Libreria mappa: **Leaflet + OpenStreetMap** (open source, nessun costo,
  coerente con l'assenza di dipendenze esterne a pagamento nel progetto).
- Filtri v1 sulla pagina mappa: toggle Immobili/Contatori + filtro per
  aggregato-immobile e tipo-utenza (riuso pattern esistenti nei filtri
  tabella).

## 1. Modello dati (migrazione)

Su `Asset`, tre nuove colonne:

- `geocoded_latitude` (varchar(20), nullable)
- `geocoded_longitude` (varchar(20), nullable)
- `geocoded_at` (timestamp, nullable)

Le colonne esistenti `latitude`/`longitude` restano il GPS "reale" inserito
a mano (invariato). Nessuna modifica a `Utility`.

Precedenza per il pin di un asset:
`latitude/longitude` (reale, blu) → `geocoded_latitude/geocoded_longitude`
(stimato, arancione) → nessun pin (finisce in "non geolocalizzabili").

Migrazione generata dentro il container dopo la modifica entity (comando
standard, vedi CLAUDE.md).

## 2. Backend — geocoding

Nuovo modulo `backend/src/apis/geocoding/`:

- `GeocodingService`:
  - Chiama `https://nominatim.openstreetmap.org/search` con `fetch` nativo
    (Node ≥24, nessuna nuova dipendenza HTTP) e header `User-Agent` custom
    (obbligatorio da ToS Nominatim).
  - Query costruita da `address + civic_number + zip_code + municipality`.
  - Throttle sequenziale: 1.1s tra chiamate (rispetto rate-limit Nominatim,
    nessuna concorrenza).
  - Se nessun match o errore: lascia i campi `null`, nessun retry
    automatico (evita loop/ban per abuso involontario).

- **Scan all'avvio** (`GeocodingModule.onModuleInit`, in background, non
  blocca il boot dell'app): seleziona asset con
  `latitude IS NULL AND geocoded_latitude IS NULL AND address IS NOT NULL`,
  geocodifica uno a uno, salva `geocoded_latitude`/`geocoded_longitude`/
  `geocoded_at`. Log riassuntivo a fine scan (quanti processati, quanti
  falliti).

- **Su update asset** (`AssetsService.update`): se cambiano campi indirizzo
  e non è stato fornito un `latitude`/`longitude` manuale nella stessa
  richiesta, azzera `geocoded_latitude`/`geocoded_longitude`/`geocoded_at`
  e rilancia un geocode singolo, best-effort (try/catch — un Nominatim non
  raggiungibile non deve mai far fallire il save dell'asset).

## 3. Backend — endpoint mappa

Nuovo modulo `backend/src/apis/map/` (o incluso in `geocoding`, da
confermare in fase di piano implementativo), un endpoint:

`GET /api/v1/map/points`

Query param opzionali: `showAssets`, `showUtilities` (bool),
`assetAggregatorId`, `utilityTypeId`.

Risposta:

```json
{
  "points": [
    { "id": 1, "type": "asset", "name": "...", "address": "...", "lat": "...", "lng": "...", "source": "gps" }
  ],
  "ungeolocated": [
    { "id": 2, "type": "utility", "name": "...", "reason": "no_address" }
  ]
}
```

Logica utility: `lat`/`lng` proprie se presenti (`source: "gps"`) →
altrimenti quelle dell'asset collegato (`source` ereditata dall'asset:
`"gps"` o `"geocoded"`) → altrimenti `null`, finisce in `ungeolocated` con
`reason` ereditata dall'asset (`no_address` se l'asset non ha indirizzo,
`geocode_failed` se ha indirizzo ma Nominatim non ha trovato nulla).

Filtri `assetAggregatorId`/`utilityTypeId` riusano le stesse colonne già
filtrate nei DTO `search-asset`/`search-utility` esistenti.

## 4. Frontend — pagina mappa (sidebar)

- Nuova voce sidebar "Mappa" (icon `map`), route `/map`, subito dopo
  Dashboard (`sidebar.component.ts`).
- Nuove dipendenze: `leaflet` + `@types/leaflet` + `leaflet.markercluster`
  (+ types), installate via pnpm dentro container (convenzione progetto).
- `pages/map/map.component.ts` standalone: Leaflet map, tile layer OSM,
  `MarkerClusterGroup` per gestire densità di pin.
- Icone marker: forma per tipo (immobile = icona apartment, contatore =
  icona bolt, coerenti con le icone già usate in sidebar), colore per
  source (blu = gps, arancione = geocoded). Legenda visibile sulla mappa.
- Pannello laterale: due checkbox toggle (Immobili/Contatori), select
  filtro aggregato-immobile e tipo-utenza (riuso componenti select già
  usati nei filter-dialog esistenti `asset-filter-dialog`/
  `utility-filter-dialog`), lista "Non geolocalizzabili" (nome + reason
  leggibile in italiano) sotto i filtri.
- Click su pin → apre subito l'edit-dialog esistente
  (`AssetEditDialogComponent`/`UtilityEditDialogComponent`).
- Click su item nella lista "non geolocalizzabili" → stessa azione (apre
  edit-dialog, l'utente può aggiungere indirizzo/GPS a mano).

## 5. Frontend — mappa embedded nel dialog edit

- Nuovo componente riusabile `core/components/location-map.component.ts`
  (standalone). Input: `latitude`/`longitude` correnti (per un contatore
  senza propri valori, il chiamante passa quelli ereditati dall'asset, a
  solo scopo di preview — non scrivibili su quel campo). Output:
  `positionSelected(lat, lng)`.
- Mostra un singolo pin (nessuno se posizione assente). Click sulla mappa →
  emette le coordinate; il dialog fa patch dei form control
  `latitude`/`longitude` (arrotondati a 6 decimali).
- Bottone "Cancella posizione manuale" → azzera `latitude`/`longitude` nel
  form: per un asset torna a mostrare (sola preview) l'eventuale
  `geocoded_latitude`/`geocoded_longitude`; per una utility torna a
  ereditare la posizione dell'asset collegato.
- Integrato in `AssetEditDialogComponent` e `UtilityEditDialogComponent`,
  sezione dedicata nel form.

## 6. Error handling

- Nominatim giù/timeout: mai crash del boot o del save. Log warning, il
  campo resta `null` fino al prossimo trigger (update indirizzo o riavvio
  app).
- Nessun retry automatico infinito.

## 7. Testing

- Backend: unit test `GeocodingService` (mock `fetch`: query building,
  skip-if-already-geocoded, gestione errore/no-match); unit test della
  logica di fallback mappa (asset gps/geocoded/null, utility che eredita
  dall'asset). Integration/e2e test su `GET /map/points` con DB seedato
  (pattern esistente nel progetto).
- Frontend: nessun test automatico oltre a quanto già in uso (Karma non
  configurato attivamente nel progetto). Verifica reale tramite `ng build`
  (obbligatoria per catturare errori di template type-checking non colti
  da `tsc --noEmit`, vedi CLAUDE.md) più verifica manuale in browser
  (pagina mappa, dialog edit di asset e utility).
- Migrazione TypeORM generata dentro il container dopo la modifica
  dell'entity `Asset` (comando standard da CLAUDE.md).

## Fuori scope (v1)

- Filtri aggiuntivi oltre aggregato-immobile/tipo-utenza (es. per
  fornitore, stato attivo/inattivo).
- Retry automatico periodico per indirizzi non geocodificabili al primo
  tentativo (serve un riavvio o una modifica dell'indirizzo per ritentare).
- Ricerca testuale/autocomplete indirizzo nel form (l'utente digita i
  singoli campi esistenti, il geocoding li combina in automatico).
