# Release, CI e GitHub

Dettaglio delle regole riassunte in `CLAUDE.md` (sezione "Git, CI e release").

## GitHub CLI

- Repo: `Comune-di-Montesilvano/UtenzePA`. Verificare con `gh repo view --json nameWithOwner`: un owner sbagliato in `--repo` non dà errore, restituisce liste vuote.
- In Git Bash un endpoint `gh api` con `/` iniziale viene riscritto come path MSYS ("invalid API endpoint"): ometterlo (`gh api orgs/...`).
- `gh pr checks -N --json statusCheckRollup` dà `detailsUrl` con il **job id**; `gh run view <id> --log-failed` vuole il run id (dal segmento `/actions/runs/<RUN_ID>/job/...`), altrimenti 404.
- Verificare un'immagine pubblicata: `gh api orgs/ORG/packages/container/NOME/versions --jq '[.[].metadata.container.tags] | map(select(index("vX.Y.Z")))'` (la prima versione è spesso `buildcache`).

## Branch protection e merge

- `main` protetta: PR obbligatoria, check `backend` + `frontend` richiesti con branch aggiornata, no force-push/delete, 0 approvazioni umane (CI come unico gate). Push diretti rifiutati.
- `gh pr merge --auto` fallisce sempre ("Auto merge is not allowed"). Merge manuale: `gh pr merge --squash --delete-branch`.
- Dopo ogni merge le altre PR tornano `BEHIND`: `gh api repos/OWNER/REPO/pulls/N/update-branch -X PUT`, una PR alla volta.
- `gh pr merge` fallisce se lanciato da un worktree diverso da quello con `main` ("'main' is already used by worktree at ..."): eseguirlo dal worktree principale.
- Mai `git add .`/`git add -A`: `.playwright-mcp/`, `.serena/`, `docker-compose.proxy.yml`, `proxy/` sono scratch locale non tracciato (finiti nei commit più volte, PR #78).

## CI (`tests.yml`)

- Esegue `pnpm run build` su backend e frontend oltre a lint e test: un errore di tipo non preso da `ts-jest` (isolatedModules) può comunque rompere `nest build`.
- Non builda mai immagini Docker: un `docker build --target production`/`--target prod` rotto si scopre solo al primo tag (`release.yml`). Dopo modifiche ai Dockerfile testare `docker build --target <stage> .` prima di taggare.

## Dockerfile: bug già incontrati (tag v1.0.1 rotto)

- Backend, stage `prod-deps`: `--ignore-scripts` semplice, non `--ignore-scripts=false` (farebbe girare il `prepare` di husky, che fallisce: "husky: not found"). bcrypt non ha bisogno di script (binario precompilato via node-gyp-build).
- Frontend: `pnpm run build` da solo — lo script è già `ng build --configuration production`, ripassare il flag dà "Schema validation failed: Data path must NOT have additional properties".
- Checkout Windows con `core.autocrlf=true`: gli `*.sh` in CRLF rompono lo shebang (`#!/bin/sh\r`, "20-runtime-config.sh: not found") se quel checkout è il contesto del `docker build`. Bloccato da `.gitattributes` (`*.sh text eol=lf`, v1.0.2): estenderlo se ricompare per altri tipi di file.

## Release

- Bump `softwareVersion`/`releaseDate` in `publiccode.yml` dentro la PR (v1.3.0 era stata taggata senza). Minor per feature con migration additiva.
- Dopo il merge: `git tag -a vX.Y.Z -m "..."` + `git push origin vX.Y.Z` → `release.yml` pubblica `vX.Y.Z` e `latest` su GHCR.
- Spostare un tag dopo un fix: `git tag -d vX`, `git push origin :refs/tags/vX`, ricreare e ripushare (rifà partire `release.yml`). Sicuro solo senza consumer esterni noti.
- Migration che si fermano su dati da sistemare: i dati si sistemano solo in locale, quindi in produzione va importato il DB locale *prima* di aggiornare le immagini, altrimenti l'API resta giù al primo avvio (v1.9.0: `InvoiceBudgetChapterFk` fermata da 20 righe orfane; risolto con la stessa DELETE dalla shell del container MySQL, password in `$MYSQL_ROOT_PASSWORD`). Scriverlo nelle note di rilascio.
