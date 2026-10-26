# Dipendenze, dependabot e bump

Dettaglio delle regole riassunte in `CLAUDE.md` (sezione "Dipendenze").

## pnpm

- Pinnato via `packageManager` (backend e frontend indipendenti, nessun workspace multi-progetto).
- Script di build nativi solo se in `allowBuilds` di `pnpm-workspace.yaml` (pnpm@11 ignora il campo `"pnpm"` di `package.json`): `bcrypt` `true`, `playwright` `false` (evita ~300MB di Chromium a ogni install).
- `ENV CI=true` nel Dockerfile backend: senza, `pnpm run build` non interattivo abortisce con `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`.
- Un bump (anche indiretto, es. jest/ts-jest) può portare una dipendenza transitiva con build script nativo mai vista: `pnpm install --frozen-lockfile` fallisce in CI con `ERR_PNPM_IGNORED_BUILDS` anche se in locale è solo un warning. Aggiungerla ad `allowBuilds` (`true` se serve davvero, `false` se no — es. `@parcel/watcher`, usato solo da `jest --watch`).

## Dependabot

- Giro giornaliero alle 01:00 Europe/Rome, nessun cooldown (gli advisory passano comunque dai security updates). Per ecosistema (backend, frontend, docker, github-actions) minor e patch in un unico gruppo `*-minor-patch`; le famiglie `@angular/*` e `@sentry/*` hanno un gruppo proprio per ogni tipo di bump, dichiarato prima (un pacchetto va nel primo gruppo che lo comprende). Node del backend è nell'ARG `NODE_VERSION` = sola major (tag mobile `24-alpine`, frontend `node:24`), che dependabot non segue: le patch arrivano dal rebuild giornaliero con `pull: true`, la major si cambia a mano (anche `engines`/`volta` e `node-version` di `tests.yml`). nginx su ramo stable con tag di minor (`1.30-alpine`): la 1.28 non riceveva più immagini da marzo 2026 e le sue CVE non si chiudono con `apk upgrade` (nginx viene dal repo nginx.org, rimosso nell'immagine); al nuovo stable (numero pari) dependabot propone il bump come minor.
- Auto-merge (`dependabot-automerge.yml`, pattern di comunicaPA): minor/patch → `gh pr merge --auto --squash` appena `backend` + `frontend` sono verdi. Major (anche le PR di gruppo con almeno un bump major) → PR lasciata aperta, manuale. Job `update-behind` (push su main + cron ogni 6 ore): aggiorna una sola PR dependabot `BEHIND` con auto-merge attivo, il merge successivo rilancia il giro.
- Refresh notturno dei lockfile (`lockfile-refresh.yml`, 02:00 UTC): dependabot non tocca le transitive, quindi `pnpm update --lockfile-only` su backend e frontend e, se cambia qualcosa, PR `deps/lockfile-refresh` (ricreata da main ogni notte) in auto-merge. Una transitiva che non sale da sola (versione fissata esatta da chi la usa, es. `multer` 2.4.0 in `@nestjs/platform-express`, o `follow-redirects` rimasto a 1.16.0) va negli `overrides` di `pnpm-workspace.yaml` con il commento della CVE; toglierlo quando il pacchetto padre si allinea.
- Token GitHub App `comune-montesilvano-bot`, secret `BOT_CLIENT_ID`/`BOT_PRIVATE_KEY` sia come **Actions** sia come **Dependabot** secret (sul trigger `pull_request` di dependabot si vedono solo i secret Dependabot). Con `GITHUB_TOKEN` merge e update-branch non fanno partire `tests.yml` e le PR restano bloccate. Prerequisito del repo: `allow_auto_merge` attivo.
- `@angular/*` e `@sentry/*` raggruppati in un'unica PR ciascuno (`.github/dependabot.yml`): un bump isolato rompe il peer dependency resolution (PR #4/#7/#8 Angular, #11/#16 Sentry). `@angular/animations` è dichiarata esplicita (serve a `provideAnimationsAsync()`) e va tenuta nel gruppo: richiede match esatto con `@angular/core`.
- CI rossa su una PR dependabot non è sempre lockfile drift risolvibile con `@dependabot rebase`: a volte serve bumpare a mano il pacchetto compagno nello stesso branch. Casi visti:
  - `jasmine-core` major → anche `karma-jasmine-html-reporter`;
  - `eslint` major → anche `@typescript-eslint/eslint-plugin` + `parser` + `typescript-eslint`; eslint 10 richiede `@eslint/js` come devDependency esplicita (import diretto in `eslint.config.mjs`);
  - `typescript` a una major non supportata da `@angular/build` (peer `>=6.0 <6.1`): non risolvibile, chiudere la PR finché Angular non aggiorna il peer.
- Se il branch è stato toccato da altri (es. `update-branch`), `@dependabot rebase` fallisce ("edited by someone other than Dependabot"): usare `@dependabot recreate`.
- Merge sequenziale di più PR sullo stesso lockfile: conflitti a cascata, riaggiornarle una alla volta dopo ogni merge.
- Aggiungere un fix sopra un bump dependabot senza ricreare la PR: branch locale da `origin/<branch-dependabot>`, commit, `git push origin <branch-locale>:<branch-dependabot>` (la CI riparte da sola).

## Pacchetti ESM-only e jest

- Un pacchetto solo ESM (`"type": "module"`, senza build CJS — es. `@nestjs/schedule@12`) rompe jest/ts-jest se importato staticamente in un file coperto da spec ("SyntaxError: Unexpected token export"), anche se a runtime Node lo carica. Fix nel codice, non nel tooling: unico import statico nel `.module.ts` (mai caricato dagli spec, escluso da `collectCoverageFrom`) e registrazione via API imperativa. Per i cron: "Dynamic schedule module" (`SchedulerRegistry.addCronJob()` in `onModuleInit()`), vedi `cronjobs.module.ts`/`backup.module.ts`.
- `@nestjs/passport@12` (PR #87): il fix sopra non si applica (`AuthGuard`/`PassportStrategy` usati ovunque). Fix in config jest limitato al pacchetto: `transformIgnorePatterns` con whitelist sul path dello store pnpm (`/node_modules/\.pnpm/(?!@nestjs\+passport@)` — non basta `/node_modules/@nestjs/passport/`, pnpm risolve via `.pnpm/<nome>+<versione>@.../node_modules/<nome>`) + entry `transform` dedicata `["ts-jest", {"tsconfig": {"allowJs": true}}]` per quel path prima del pattern `.(t|j)s$`. Verificato.
- `@nestjs/jwt@12` (ESM + default import di `jsonwebtoken` CJS, PR #89 e #105): l'override `tsconfig` per-pattern di ts-jest non ha effetto (provato più volte, anche a cache azzerata; probabile caching del `ConfigSet` di ts-jest 29) ed `esModuleInterop: true` globale rompe la build (`cookie-parser`/`compression`/`csv-parser`). Adottato: `testPathIgnorePatterns` su `apis/auth/auth.service.spec.ts` e `apis/backup/backup.controller.spec.ts`, gap di coverage documentato. Prossimo tentativo mai fatto: `moduleNameMapper` verso uno shim che fa `require('jsonwebtoken')`. Non ripartire dall'override per-pattern.

- `pdfjs-dist` (v1.38.0, testo del PDF delle fatture): solo ESM, caricato in `invoice-import/sdi/pdf-text.ts` con `new Function('s', 'return import(s)')` (TypeScript in commonjs trasformerebbe `import()` in `require`) e percorso da `require.resolve`; mai importato staticamente, quindi jest non lo carica (spec con `jest.mock('./sdi/pdf-text')` o XML senza PDF). La dipendenza opzionale `@napi-rs/canvas` (~80 MB nativi, solo rendering) è esclusa con `ignoredOptionalDependencies` in `pnpm-workspace.yaml`: al primo PDF il log mostra «Cannot load "@napi-rs/canvas"» e «Cannot polyfill DOMMatrix/Path2D», innocui per l'estrazione del testo.

## Blocchi noti

- **NestJS 11→12 bloccato**: `@nestjs/typeorm` non ha una release compatibile (ultima 11.0.3, peer `@nestjs/common ^10||^11`). Valutato e scartato: cablaggio manuale o cambio ORM. Riprovare quando esce una 12.x (dependabot la segnala).

## Angular 22

Migrazione 20→22 con `ng update` una major alla volta (prima `@angular/cli` + `core`, poi `material` + `cdk`) dentro il container `frontend` (Node 24), con `--allow-dirty` e poi `chown -R 1000:1000 node_modules package.json` (il comando gira come root). Tutti i componenti hanno `ChangeDetectionStrategy.Eager` esplicito (comportamento pre-v22; la nuova change detection di default non è testata).
