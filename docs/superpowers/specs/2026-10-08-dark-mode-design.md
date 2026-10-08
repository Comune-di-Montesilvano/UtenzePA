# Dark mode (roadmap voce 15)

Data: 2026-10-08. Stato: da approvare. Rilascio: v1.17.0 (solo frontend, nessuna migration).

## Obiettivo

Il gestionale segue il tema chiaro/scuro del sistema operativo, e ogni utente può forzare Chiaro o Scuro dal proprio browser. Il tema scuro mantiene l'identità sobria e monocromatica di quello chiaro.

Criteri di riuscita:

- con Windows in tema scuro e preferenza "Sistema", l'app si apre scura senza lampo bianco;
- la scelta Chiaro / Scuro / Sistema resta tra una sessione e l'altra sullo stesso browser;
- nessun testo sotto il contrasto WCAG AA (4,5:1 normale, 3:1 grande) in dashboard, elenchi, schede, mappa, login, consumi;
- nessun colore esadecimale fisso residuo per superfici, testi, bordi e badge (restano solo i colori "dato", vedi sotto).

## Decisioni prese

| Tema | Scelta |
|---|---|
| Come si sceglie il tema | Automatico (`prefers-color-scheme`) + selettore Chiaro / Scuro / Sistema, salvato in `localStorage` del browser. Niente preferenza sul profilo utente (backend) |
| Mappe | Tessere (OSM, satellite) invariate; si scuriscono solo controlli, popup, legenda e pannello filtri |
| Colore primario in scuro | Specchio monocromatico: primario quasi bianco `#ececf0` con testo `#0b0b12`, superfici antracite (mockup "A", brainstorming 2026-10-08) |
| Meccanismo | CSS `light-dark()` + proprietà `color-scheme` su `<html>`; Material M3 con `theme-type: color-scheme` |
| Posizione del selettore | Footer della sidebar, sopra "Esci" |

## Meccanismo

`frontend/src/styles/material-theme.scss`:

- `theme-type: light` → `theme-type: color-scheme`: un solo `mat.theme` emette i ruoli `--mat-sys-*` come `light-dark(chiaro, scuro)`;
- `html { color-scheme: light dark; }` (default = sistema); `html.theme-light { color-scheme: light; }`, `html.theme-dark { color-scheme: dark; }`;
- gli override puntuali diventano `light-dark()`: `--mat-sys-primary: light-dark(#030213, #ececf0)`, `--mat-sys-on-primary: light-dark(#ffffff, #0b0b12)`, `--mat-sys-secondary` / `on-secondary` invertiti allo stesso modo, `--mat-sys-outline: light-dark(#d4d4d4, #3f3f46)`;
- superfici scure (se i ruoli generati dalla palette non coincidono già): sfondo `#121212`, superficie `#1c1c1e`, superficie alta `#26262a`.

`frontend/src/app/core/services/theme.service.ts` (nuovo):

- `preference = signal<'light' | 'dark' | 'system'>`, letta all'avvio da `localStorage['utenzepa-theme']` (valore assente o non valido = `system`);
- `set(pref)`: salva, poi su `document.documentElement` toglie `theme-light`/`theme-dark` e aggiunge quella giusta (nessuna classe per `system`);
- ogni accesso a `localStorage` in `try/catch`: se fallisce, vale `system` e l'app funziona lo stesso.

`frontend/src/index.html`: script inline nel `<head>`, prima di `config.js`, che legge la stessa chiave e mette la classe su `<html>` prima del bootstrap (niente lampo bianco). Stessa logica del service, in `try/catch`.

Sidebar (`comp/sidebar/`): voce "Tema" nel footer, sopra "Esci", con `mat-menu` di tre voci (icone `light_mode`, `dark_mode`, `contrast`; spunta sulla preferenza attiva). Icona della voce = icona del tema effettivo; con sidebar compressa resta solo l'icona, con tooltip.

## Token

In `frontend/src/styles.scss`, blocco `:root` delle schede:

- token esistenti trasformati in `light-dark()`:

| Token | Chiaro (invariato) | Scuro |
|---|---|---|
| `--tone-ok-bg` / `-fg` | `#dcfce7` / `#166534` | `#14361f` / `#86efac` |
| `--tone-warn-bg` / `-fg` | `#fef3c7` / `#92400e` | `#3d2c0b` / `#fcd34d` |
| `--tone-danger-bg` / `-fg` | `#fee2e2` / `#991b1b` | `#3f1515` / `#fca5a5` |
| `--tone-off-bg` / `-fg` | `#f3f4f6` / `#4b5563` | `#2a2a2e` / `#b4b4bb` |
| `--tone-info-bg` / `-fg` | `#dbeafe` / `#1e40af` | `#172554` / `#93c5fd` |
| `--entity-asset` | `#2563eb` | `#60a5fa` |
| `--entity-utility` | `#0891b2` | `#22d3ee` |
| `--entity-plant` | `#ea580c` | `#fb923c` |
| `--entity-supply-contract` | `#7c3aed` | `#a78bfa` |
| `--entity-grant` | `#0d9488` | `#2dd4bf` |
| `--entity-party` | `#be185d` | `#f472b6` |
| `--entity-chapter` | `#4d7c0f` | `#a3e635` |
| `--sheet-border` | `#e5e7eb` | `#34343a` |
| `--sheet-muted` | `#6b7280` | `#9a9aa3` |

- token di base nuovi, per i colori fissi che non hanno già un ruolo Material: `--app-bg`, `--app-surface`, `--app-surface-2`, `--app-text`, `--app-muted`, `--app-border`. Dove coincidono con un ruolo `--mat-sys-*` (es. `--mat-sys-surface`, `--mat-sys-on-surface`) si usa direttamente il ruolo Material, il token nuovo ne è un alias.

Uno stato di badge (es. "Disputato" dei contratti immobiliari, `#fde68a`/`#78350f`) che non corrisponde a un tono esistente diventa un token dedicato con la sua variante scura.

## Pulizia dei colori fissi

- `styles.scss` (~56 occorrenze) e i 44 file sotto `src/app` con esadecimali o `rgb()`/`rgba()`: superfici, testi, bordi, hover e ombre passano ai token.
- Badge calcolati in TS (`pages/plants/plant.model.ts`, `pages/utilizer-grant/real-estate-contract.model.ts` e simili): restituiscono `var(--tone-…)` invece dell'esadecimale; i template li applicano già via `[style]`, quindi `var()` funziona senza altre modifiche.
- Restano fissi i colori "dato": tipo utenza (`hard-type.enum.ts`), pin e cluster della mappa, serie dei grafici consumi. Già medio-saturi: si verifica solo il contrasto su fondo scuro; se uno non regge, variante `light-dark()` mirata.
- Residui PrimeNG `--p-*` in `styles.scss`: rimossi se non più usati da nessun selettore vivo, altrimenti sostituiti con i token.
- Ombre (`rgba(0,0,0,…)`): invariate, su scuro pesano poco ma non disturbano.

## Casi particolari

- **Mappa** (`pages/map/`, `core/components/location-map.component`): tessere invariate; popup Leaflet, controlli zoom/layer, legenda e pannello filtri sui token (regole globali in `styles.scss`, come già fatto per `L.divIcon`).
- **Grafici consumi** (SVG a mano in `consumption-chart.component.ts`, `utility-consumptions-tab.component.ts`): assi, griglia, etichette e tooltip sui token; serie invariate.
- **Login e setup**: seguono il tema (preferenza solo da `localStorage` o sistema, nessun utente ancora noto).
- **Toast, dialog di conferma, `.mat-action-danger`/`.mat-action-success`**: verificati in scuro; il rosso e il verde delle azioni restano, con eventuale variante più chiara se il contrasto non basta.
- **Stampa**: nessun intervento (non esiste una stampa dedicata).

## Verifica

- `pnpm run build` nel container frontend.
- Ricerca residui: `grep` di esadecimali e `rgb(` sotto `src/app` e `styles.scss`; ogni residuo è un colore "dato" motivato.
- Playwright dall'host, tema forzato con `emulateMedia({colorScheme})` e poi col selettore: dashboard, elenco utenze, scheda utenza (riepilogo, consumi), scheda impianto, contratti immobiliari, mappa, login. Screenshot in `.playwright-mcp/`.
- Contrasto: controllo a campione dei testi su badge, muted e link in scuro (WCAG AA).
- Preferenza: Scuro → ricarica → resta scuro senza lampo; Sistema → segue il cambio del tema di Windows senza ricaricare.

## Fuori perimetro

- Preferenza salvata sul profilo utente.
- Tessere della mappa scure.
- Colori del tema configurabili dal branding.
- Stile di stampa.
