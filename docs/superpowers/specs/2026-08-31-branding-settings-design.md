# Branding ente — design

Data: 2026-08-31

## Problema

Il nome/tipo ente ("Comune di Montesilvano"), le coordinate mappa di default e il vecchio nome applicativo ("GUC"/"Gestione Utenze Comunali", pre-rename a UtenzePA) sono hardcoded in più punti frontend e backend. Il gestionale è sviluppato da terzi ma pensato per essere riutilizzabile da altri enti — questi valori vanno resi configurabili da UI (pagina Impostazioni), senza richiedere modifiche al codice o redeploy per un nuovo ente.

## Scope

Configurabile da UI (branding per-tenant, editabile da Admin):
- Nome ente (testo libero, es. "Comune di Montesilvano")
- Tipo ente (testo libero, es. "Comune") — metadato informativo, non concatenato automaticamente da nessuna parte
- Coordinate mappa di default (lat/lng — centro iniziale mappa geolocalizzazione e mini-mappa dialog)
- Logo (immagine)
- Favicon (immagine)

Fisso, NON editabile (identità dell'applicativo, uguale per ogni installazione):
- Nome applicativo "UtenzePA" — sostituisce ogni occorrenza residua di "GUC"/"Gestione Utenze Comunali"

Fuori scope (tecnico, non user-facing, resta hardcoded):
- `geocoding.service.ts` `USER_AGENT` (header HTTP verso Nominatim)
- `sidebar.component.ts` `repoUrl` (link GitHub del tool, non del comune)

## Punti da sostituire

| File | Testo attuale | Sostituzione |
|---|---|---|
| `frontend/src/app/layout/main-layout.component.html` | "Comune di Montesilvano" | `entity_name` dinamico |
| `frontend/src/app/pages/login/login.component.html` | "Gestione Utenze Comunali" / "Comune di Montesilvano" | "UtenzePA" (fisso) / `entity_name` dinamico |
| `frontend/src/index.html` | `<title>GUC Montesilvano</title>` | `document.title` dinamico: `{entity_name} · UtenzePA`, fallback statico "UtenzePA" prima che il JS carichi il branding |
| `frontend/src/index.html` | `favicon.ico` statico | `link[rel=icon].href` dinamico (data URI da branding), fallback al file statico |
| `backend/src/apis/auth/auth.service.ts` | "Reset password OTP Gestione Utenze Comunali - Comune di Montesilvano" | "Reset password OTP UtenzePA - {entity_name}" |
| `backend/src/apis/setup/setup.service.ts` | "Attivazione account amministratore - Gestione Utenze Comunali" | "Attivazione account amministratore - UtenzePA" |
| `backend/src/core/email/email.service.ts` | mittente "Comune di Montesilvano <email>" | mittente "{entity_name} <email>" |
| `frontend/src/app/pages/map/map.component.ts` | `[42.5083, 14.15]` hardcoded | `default_latitude`/`default_longitude` da branding |
| `frontend/src/app/core/components/location-map.component.ts` | `DEFAULT_CENTER = [42.5083, 14.15]` | idem |

## Data model

Nuova tabella `app_settings`, riga singola (id fisso = 1, no CRUD multi-riga):

```
id                  INT PK (sempre 1)
entity_name         VARCHAR(255) NOT NULL DEFAULT 'Comune di Montesilvano'
entity_type         VARCHAR(100) NOT NULL DEFAULT 'Comune'
default_latitude    VARCHAR(20)  NOT NULL DEFAULT '42.5083'
default_longitude   VARCHAR(20)  NOT NULL DEFAULT '14.15'
logo                LONGTEXT     NULL   -- data URI base64, es. "data:image/png;base64,...."
logo_mime           VARCHAR(50)  NULL
favicon             LONGTEXT     NULL
favicon_mime         VARCHAR(50)  NULL
update_date         TIMESTAMP
updated_by_user_id  INT NULL (FK system_users)
```

Migration TypeORM genera la tabella e fa il seed della riga id=1 con i valori attuali (default sopra) — upgrade non-breaking, nessuna azione manuale richiesta.

Cap upload: 2MB per immagine (validazione lato DTO). Mime whitelist: `image/png`, `image/jpeg`, `image/svg+xml`, `image/x-icon` (favicon).

**Perf**: logo/favicon in DB invece che su disco — nessun problema di performance atteso (fetch una sola volta per sessione via `APP_INITIALIZER`, non un path hot). Scelto rispetto al disco per coerenza col flusso di restore backup già esistente (un file su disco si disallineerebbe da un restore SQL, stessa classe di bug già vista con le migration). Accorgimento: le letture di `AppSettings` che servono solo a testo (es. oggetto email in `auth.service.ts`) devono fare `select` esplicito escludendo le colonne blob (`logo`, `favicon`), per non trascinare l'immagine ad ogni query che non ne ha bisogno.

## API

`GET /api/v1/settings/branding` — **pubblico, nessuna auth** (serve alla login page e al title/favicon prima del login). Ritorna tutti i campi (incluse le immagini come data URI, se presenti).

`PATCH /api/v1/settings/branding` — solo ruolo `Admin` (`@Roles('Admin')` + `JwtAuthGuard`/`RolesGuard` come gli altri endpoint di scrittura). Body JSON, tutti i campi opzionali (patch parziale): `entity_name`, `entity_type`, `default_latitude`, `default_longitude`, `logo` (data URI o `null` per rimuovere), `favicon` (idem). Validazione: dimensione, mime, formato data URI.

Nuovo modulo `backend/src/apis/settings/` (`SettingsController`, `SettingsService`, `AppSettings` entity, DTO) — pattern identico agli altri moduli di dominio già presenti.

## Frontend

`BrandingService` (in `frontend/src/app/services/`) — stato corrente come `BehaviorSubject`/signal, fetch al bootstrap tramite `APP_INITIALIZER` (deve completare **prima** del render dell'app: login page e title/favicon devono essere corretti da subito, niente flash del vecchio branding).

Consumato da:
- `main-layout.component.html`, `login.component.html` — testo dinamico
- `main.ts`/`app.ts` — `document.title` + `link[rel=icon].href`
- `map.component.ts`, `location-map.component.ts` — centro mappa default

Nuova pagina `Impostazioni > Branding` (voce aggiunta al submenu "Impostazioni" già esistente in sidebar, stesso pattern delle altre pagine di dominio: `Aggregati Utenze`, `Tipologie uso contatore`, ecc.). Form reattivo:
- `entity_name`, `entity_type` — input testo
- coordinate mappa default — riuso diretto di `LocationMapComponent` (stesso componente già usato nei dialog asset/utility) per scegliere il punto cliccando sulla mappa
- logo/favicon — `<input type="file">` → `FileReader` → data URI, preview immagine corrente, pulsante rimuovi

Solo `Admin` vede/modifica la pagina (readonly per gli altri ruoli — stesso pattern di `AssetEditDialogComponent`, `this.form.disable()` se ruolo non idoneo).

## Testing

- Backend: unit test `SettingsService` (get/update, validazione dimensione/mime), unit test `SettingsController` (guard Admin su PATCH, GET pubblico).
- Frontend: verifica manuale via `ng build` reale (template type-checking, vedi nota CLAUDE.md) + giro end-to-end in dev (cambio branding da UI, verifica propagazione su login/header/tab title/mappa).
- Migration: verificata con restart pulito del container `api` in dev (stesso check già fatto per `InitialSchema`).

## Non-goal

- Multi-tenant reale (più enti nello stesso deployment) — resta un singleton, un solo ente per installazione, coerente con l'architettura attuale (un DB per comune).
- Storico/versioning del branding (chi ha cambiato cosa e quando) — solo `update_date`/`updated_by_user_id`, nessun audit log dedicato.
