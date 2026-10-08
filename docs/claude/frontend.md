# Frontend: insidie note

Dettaglio delle regole riassunte in `CLAUDE.md` (sezione "Frontend"). Quasi tutte trovate solo con test reali nel browser, non leggendo il codice.

## Angular Material

- **`MatDialog` oltre 560px**: `width` da solo non basta, il `max-width:560px` di MDC lo clampa in silenzio. Passare anche `maxWidth` (vedi `AbstractDataTableComponent.editDialogWidth()`). Stesso bug era in `AbstractSearchComponent.openFilterDialog()` (`core/components/abstract-search.component.ts`), l'unico punto che apre tutti i dialog filtro.
- `<h2 mat-dialog-title style="display:flex; justify-content:space-between">`: MDC inietta un `::before` invisibile come primo flex item, che `space-between` conta. Usare `justify-content:flex-start` + `margin-left:auto` sull'ultimo elemento.
- Mai stile inline (es. `display:flex`) sull'host `<mat-option>`: rompe il layout MDC (checkmark disallineato, testo che sparisce). Avvolgere il contenuto in uno `<span>` (vedi `FilterableSelectComponent`).
- `mat-label` di un campo con `Validators.required`: niente `*` manuale (Material lo aggiunge, risultato "**"). Il `*` resta solo su `app-filterable-select`, che non lo aggiunge.

## Forms

- `FormControl.setValue(v, {emitEvent:false})` non garantisce che nessun subscriber di `valueChanges` riceva un'emissione (visto in `FilterableSelectComponent`). In un `ControlValueAccessor` custom, gating della logica "input libero" dietro un flag di interazione reale (keydown/paste).
- `ngModel` dentro un figlio di `<form [formGroup]>`: `[ngModelOptions]="{standalone: true}"`, altrimenti warning NG01354.
- Tab di un dialog che modifica lato server l'entity del dialog stesso (es. tab Consumi che aggiorna matricola/stima): riallineare il form (solo i controlli `pristine`), altrimenti "Salva" riporta il DB ai valori vecchi.

## Layout flex

- Flex item con `padding` e altezza da `flex:1` senza `box-sizing:border-box`: il padding si somma all'altezza, contenuto in fondo tagliato in silenzio.
- Un figlio flex non si restringe sotto la content-size senza `min-height:0` (default `min-height:auto`): va messo a **ogni** livello della catena (serviva su 4 livelli annidati: `.body`, `.content`, `.sidebar`, `:host` del componente sidebar).
- Componente standalone figlio diretto di un flex container: serve `:host { display:flex; ... }` (il custom element è `inline`). `height:100%` attraverso un elemento stretched può risolversi male su Chromium (`getComputedStyle` e `getBoundingClientRect()` non concordavano).

## Leaflet (mappa)

- Modificare `angular.json` (es. `architect.build.options.styles`) con `ng serve` attivo non basta: va riavviato (`docker restart utenzepa-frontend-1`). Visto con `leaflet.css`/`MarkerCluster.css`: `.leaflet-container` senza regole, pannelli che uscivano dal contenitore.
- `leaflet.markercluster` (UMD) cerca `L` su `window`; un `import` statico viene hoistato prima di `window.L = L` e l'estensione fallisce ("`L.markerClusterGroup is not a function`"). Fix: `await import('leaflet.markercluster')` dentro `ngAfterViewInit`, dopo aver assegnato `window.L`.
- `L.map(id)` in un container con dimensioni non ancora definitive (sidebar che si popola via HTTP): tile disallineati. Un `setTimeout(() => map.invalidateSize(), 0)` non basta; usare `ResizeObserver` sul container che chiama `invalidateSize()`, più un doppio `requestAnimationFrame` per il primo giro.
- Icone `L.divIcon({html})` finiscono nel DOM via `innerHTML`, senza attributo di scoping: il CSS del componente non le prende mai. Va in `frontend/src/styles.scss` (visto due volte, PR #77).

## Bootstrap e servizi

- `provideAppInitializer` con `await` su HTTP (config/branding) deve avere `try/catch` con fallback: se rigetta, Angular aborta il bootstrap e mostra una pagina bianca. Il fallimento di deploy più comune è proprio backend giù o `CORS_ORIGIN` errato.
- Un service che **non** estende `AbstractService` deve allegare a mano `Authorization: Bearer <token>`: nessun interceptor lo aggiunge (quello esistente gestisce solo il logout su 401). Bug reale: `BrandingService.update()` sempre 401, sopravvissuto a più review.
- `reflect-metadata` sta nei `polyfills` di `angular.json`, non solo in `main.ts`: gli `import()` dinamici (es. `EntityNavigatorService`) cambiano l'ordine dei chunk e i decorator `@Type` di class-transformer giravano prima del polyfill (`Reflect.getMetadata is not a function`, pagina bianca al login).
- Tipi usati in proprietà decorate (`@Input() info: StatusInfo`): `import type` (TS1272 con `isolatedModules` + `emitDecoratorMetadata`).
- Template type-checking sfugge a `tsc --noEmit`: solo `ng build`/`ng serve` lo cattura.

## Coordinate e date

- Lat/lng da fonti Access/Excel hanno la virgola decimale: `parseFloat` tronca in silenzio (`"42,51..."` → `42`). Usare sempre `CoordinateHelper.parseCoordinate()` (`core/helpers/coordinate.helper.ts`).
- Date (`'AAAA-MM-GG'`, convenzione unica dal 2026-10-05): il frontend invia il giorno locale, il backend lo salva così com'è. Nei form leggerle come giorno locale (`new Date(y, m - 1, d)`, mai `new Date(v)` = mezzanotte UTC; per "oggi" `setHours(0, 0, 0, 0)`); in invio mai `toISOString()` (giorno prima): `@DateOnly()` (`core/helpers/date.helper.ts`, vale anche per gli array `_range` dei filtri) o `toIsoDate`. Backend: `@DateOnly()` nei DTO (`common/decorators/date-only.decorator.ts`), `DateHelper.dateOnly` nei filtri, mai passare da `Date`. Prima esistevano `NormalizeDate` (+1 giorno a ogni Salva) e `slice(0, 10)` sull'ISO (fatture salvate il giorno prima): trovati solo salvando due volte la stessa scheda.
