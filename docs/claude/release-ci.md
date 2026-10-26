# Release, CI e GitHub

Dettaglio delle regole riassunte in `CLAUDE.md` (sezione "Git, CI e release").

## GitHub CLI

- Repo: `Comune-di-Montesilvano/UtenzePA`. Verificare con `gh repo view --json nameWithOwner`: un owner sbagliato in `--repo` non dà errore, restituisce liste vuote.
- In Git Bash un endpoint `gh api` con `/` iniziale viene riscritto come path MSYS ("invalid API endpoint"): ometterlo (`gh api orgs/...`).
- `gh pr checks -N --json statusCheckRollup` dà `detailsUrl` con il **job id**; `gh run view <id> --log-failed` vuole il run id (dal segmento `/actions/runs/<RUN_ID>/job/...`), altrimenti 404.
- Verificare un'immagine pubblicata: `gh api orgs/ORG/packages/container/NOME/versions --jq '[.[].metadata.container.tags] | map(select(index("vX.Y.Z")))'` (la prima versione è spesso `buildcache`).

## Branch protection e merge

- `main` protetta: PR obbligatoria, check `backend`, `frontend`, `docker (backend, production)` e `docker (frontend, prod)` richiesti (l'auto-merge aspetta solo i check richiesti: un job nuovo che deve fare da gate va aggiunto qui) con branch aggiornata, no force-push/delete, 0 approvazioni umane (CI come unico gate). Push diretti rifiutati.
- Merge manuale delle PR proprie: `gh pr merge --squash --delete-branch`. `allow_auto_merge` è attivo solo per le PR dependabot (vedi sotto): non usare `--auto` sulle PR di feature.
- Dopo ogni merge le altre PR tornano `BEHIND`: `gh api repos/OWNER/REPO/pulls/N/update-branch -X PUT`, una PR alla volta.
- `gh pr merge` fallisce se lanciato da un worktree diverso da quello con `main` ("'main' is already used by worktree at ..."): eseguirlo dal worktree principale.
- `--delete-branch` con il branch ancora in uso da un altro worktree: errore sul branch locale e il branch remoto **non** viene cancellato. Cancellarlo a mano con `git push origin --delete <branch>`, poi `git checkout --detach origin/main` nel worktree e `git branch -D`.
- `gh pr checks` subito dopo `gh pr create` risponde «no checks reported» per circa 30 s: aspettare, poi `--watch`.
- Mai `git add .`/`git add -A`: `.playwright-mcp/`, `.serena/`, `docker-compose.proxy.yml`, `proxy/` sono scratch locale non tracciato (finiti nei commit più volte, PR #78).

## CI (`tests.yml`)

- Esegue `pnpm run build` su backend e frontend oltre a lint e test: un errore di tipo non preso da `ts-jest` (isolatedModules) può comunque rompere `nest build`.
- Job `docker` (matrice backend/frontend): build di `production`/`prod` con `pull: true` (cache letta dal `buildcache` pubblico, mai scritta), poi Trivy CRITICAL/HIGH con fix, bloccante. Ferma una PR quando esce una CVE nelle dipendenze o l'immagine base non è più aggiornata (nginx 1.28: nessuna immagine da marzo 2026, CVE non chiudibili con `apk upgrade`). Eccezioni in `.trivyignore` alla root, una riga per CVE con commento e `exp:AAAA-MM-GG` (alla scadenza torna a bloccare); lo stesso file vale per `release.yml`.
- CVE in locale prima della PR (Git Bash, `MSYS_NO_PATHCONV=1` per i volumi): `docker run --rm -v //var/run/docker.sock:/var/run/docker.sock -v "$PWD/.trivyignore:/ig" aquasec/trivy:latest image --scanners vuln --severity CRITICAL,HIGH --ignore-unfixed --ignorefile /ig <immagine>`.

## Dockerfile: bug già incontrati (tag v1.0.1 rotto)

- Backend, stage `prod-deps`: `--ignore-scripts` semplice, non `--ignore-scripts=false` (farebbe girare il `prepare` di husky, che fallisce: "husky: not found"). bcrypt non ha bisogno di script (binario precompilato via node-gyp-build).
- Frontend: `pnpm run build` da solo — lo script è già `ng build --configuration production`, ripassare il flag dà "Schema validation failed: Data path must NOT have additional properties".
- Checkout Windows con `core.autocrlf=true`: gli `*.sh` in CRLF rompono lo shebang (`#!/bin/sh\r`, "20-runtime-config.sh: not found") se quel checkout è il contesto del `docker build`. Bloccato da `.gitattributes` (`*.sh text eol=lf`, v1.0.2): estenderlo se ricompare per altri tipi di file.

## Release

- Bump `softwareVersion`/`releaseDate` in `publiccode.yml` dentro la PR (v1.3.0 era stata taggata senza). Minor per feature con migration additiva.
- Dopo il merge: `git tag -a vX.Y.Z -m "..."` + `git push origin vX.Y.Z` → `release.yml` pubblica `vX.Y.Z` e `latest` su GHCR (Trivy solo report).
- Rebuild giornaliero di `main` (`release.yml`, cron 04:30 UTC, dopo il giro dependabot delle 01:00 Europe/Rome, o `workflow_dispatch`): push `latest-YYYYMMDD`, `APP_VERSION` = ultimo tag `v*` (`VCS_REF` = commit), Trivy **bloccante** su CRITICAL/HIGH con fix, e solo se passa `latest` viene ripuntato al nuovo digest (`imagetools create`). Saltato se un tag è uscito nelle ultime 24 ore. I tag `vX.Y.Z` non cambiano mai. `PKG_REFRESH` = data del giorno invalida il layer `apk upgrade` dei Dockerfile (altrimenti congelato dalla cache registry). Nell'immagine backend npm/npx/corepack sono rimossi (CVE delle dipendenze bundled).
- Rebuild fermato da Trivy = di solito CVE reali, `latest` resta sulla build precedente. Il SARIF non le stampa nel log: `docker run --rm aquasec/trivy image --scanners vuln --severity CRITICAL,HIGH --ignore-unfixed ghcr.io/comune-di-montesilvano/utenzepa-<app>:latest-YYYYMMDD`.
- Pulizia GHCR (`ghcr-cleanup.yml`, domenica 03:00 UTC): tiene `vX.Y.Z`/`latest`/`buildcache`, gli ultimi 30 `latest-YYYYMMDD`, i figli degli indici tenuti e le versioni con meno di 6 ore; il resto è cancellato. `workflow_dispatch` parte in dry-run.
- Spostare un tag dopo un fix: `git tag -d vX`, `git push origin :refs/tags/vX`, ricreare e ripushare (rifà partire `release.yml`). Sicuro solo senza consumer esterni noti.
- Migration che si fermano su dati da sistemare: i dati si sistemano solo in locale, quindi in produzione va importato il DB locale *prima* di aggiornare le immagini, altrimenti l'API resta giù al primo avvio (v1.9.0: `InvoiceBudgetChapterFk` fermata da 20 righe orfane; risolto con la stessa DELETE dalla shell del container MySQL, password in `$MYSQL_ROOT_PASSWORD`). Scriverlo nelle note di rilascio.
