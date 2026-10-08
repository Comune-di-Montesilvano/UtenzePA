# Docker, pnpm e Windows: note operative

Dettaglio delle regole riassunte in `CLAUDE.md` (sezione "Docker e Windows").

## Stabilità della macchina

- **Docker Desktop/WSL2 instabile sotto carico**: `pnpm run test:unit` (suite intera) può far crashare il daemon (500 "Internal Server Error" su `docker ps`/`docker exec`, a volte anche subito dopo un riavvio pulito). Causa: risorse WSL2, non il codice. Non ritentare a raffica la suite intera: girare solo i file jest rilevanti (`pnpm exec jest <path> --maxWorkers=2`) e usare la CI (`gh pr checks <N> --watch`) come gate.
- Un `docker exec` in background può riportare `exit code 0` anche quando l'output reale è un 500 del daemon: controllare sempre il contenuto del file di output.
- Il 500 può persistere 20+ minuti senza auto-recovery (anche `docker ps` nudo). Dopo 2-3 tentativi a distanza di minuti: smettere e chiedere un riavvio manuale di Docker Desktop.
- Osservato anche il crash dell'intero PC Windows dopo comandi `docker exec`/build/test in rapida successione (più agenti paralleli con `pnpm run build`/`jest`/`docker restart`). Comandi Docker **uno alla volta**, mai in parallelo/background multipli, soprattutto con subagent. Dopo un crash del PC chiedere conferma che la macchina sia stabile prima di riprendere.

## Container `api` di sviluppo

- **Crash-loop su `pnpm run start:dev`** (`[ERR_SQLITE_ERROR] attempt to write a readonly database` a ogni riavvio): l'immagine dev ha `HOME=/root` (build-time), ma l'override gira con `user: "1000:1000"`, che non può scrivere in `/root`; pnpm non apre lo store SQLite in `$HOME/.local/share/pnpm/store` e il dep-check prima di `start:dev` fallisce. Fix: `HOME=/usr/src/app` nelle `environment:` del servizio `api` in `docker-compose.override.yml`, poi `docker compose up -d api` (un `docker restart` non basta, la env è fissata alla creazione). Effetto collaterale: cache in `backend/.cache/`, `backend/.local/` (ignorate in `.gitignore` di root).
- `docker exec -u root utenzepa-api-1 pnpm ...` lascia `node_modules`/`.pnpm-store` root-owned e rompe il watch (gira come 1000:1000): sempre `chown -R 1000:1000 node_modules .pnpm-store` dopo, poi `docker restart utenzepa-api-1` se il watch era già andato in errore.
- **Un `docker exec` scaduto lato client non uccide il processo lato server**: un `pnpm add` ritentato lascia vivo il precedente; più retry impilati vanno in deadlock sullo store pnpm (nessun errore, visibile solo con `docker exec <container> ps aux`). Prima di ritentare un comando pnpm: `ps aux` nel container; se ce n'è uno in corso aspettarlo (5-10 minuti sono normali per ~1200 pacchetti su bind-mount Windows). Se davvero bloccato: `docker exec -u root <container> kill -9 <pid...>` sui pnpm extra, mai il PID 1 (si riavvia da solo via restart policy, atteso).
- Spostare/cancellare un `.ts` sotto `nest start --watch` non sempre ripulisce `dist/`: il `.js` vecchio può sopravvivere ed essere eseguito (crash-loop, "file not found" fantasma). Fix: `docker exec <container> rm -rf dist tsconfig.build.tsbuildinfo` poi `docker restart`.
- Gli script `docker:dev*` di `backend/package.json` referenziano `docker-compose-development.yml`, che non esiste: non funzionano.

## Install pnpm e node_modules

- Versioni: usare sempre Docker per comandi che richiedono versioni specifiche (Node ≥24, pnpm pinnato). `docker exec` sul container `api` garantisce le versioni giuste.
- Container dev non attivi (es. altro progetto sulla macchina), `pnpm install` una tantum in un worktree: `MSYS_NO_PATHCONV=1 docker run --rm -v "$(pwd):/app" -w //app node:24 sh -c "corepack enable && pnpm install ..."` (in Git Bash servono `MSYS_NO_PATHCONV=1` e `-w //app` con doppio slash, altrimenti il path viene riscritto e il mount fallisce). Sicuro, ma un reinstall completo con bind-mount è lento (~11 minuti osservati, I/O-bound: `docker stats` mostra CPU bassa e centinaia di MB di block I/O, non è bloccato).
- **`node_modules` sempre su volume Docker named**, mai bind-mount su Windows (10+ minuti invece di ~50s). Pattern: `-v <nome>-node-modules:/app/node_modules` e solo il sorgente bind-mountato.
- `npm install` con bind-mount diretto su Docker Desktop Windows può corrompere `node_modules` in silenzio (`package.json` mancanti nei pacchetti, symlink `.bin` non creati, npm riporta successo). Workaround: `docker run -d -v "$(pwd -W)":/usr/src/app -v <nome>-node-modules:/usr/src/app/node_modules -w /usr/src/app node:24-alpine tail -f /dev/null`, poi install dentro il container. In Git Bash: `MSYS_NO_PATHCONV=1` + `$(pwd -W)`.
- Reinstall completo in container **effimero** (`docker run --rm`, store non persistito) lento per due motivi: 1) bind-mount di `node_modules` (sopra); 2) **ogni** comando pnpm (anche `pnpm exec jest`) ricontrolla l'hash dell'intero `package.json` contro il lockfile e rilancia un relink completo se cambia qualsiasi campo, anche solo `"jest"`. Workaround verificato: container persistente (`docker run -d ... tail -f /dev/null` + `docker exec`) con volume named per `node_modules`; il primo install serve comunque (~5-7 minuti a store freddo), le iterazioni dopo sono rapide.

## Worktree

- `docker-compose.yml` ha `name: utenzepa` fisso: un solo stack dev condiviso tra tutti i worktree. Passando a un altro worktree i container restano montati sulla cartella di prima finché non si rilancia `docker compose up -d` dal nuovo worktree (dopo aver copiato `.env`).
- `git worktree remove` con container ancora attivi sul bind-mount fallisce con "Permission denied" sulla cartella, ma rimuove comunque la registrazione git: non bloccante, cleanup fisico rimandabile.
- Lavoro lungo in un worktree può lasciare `main` del worktree principale divergente da `origin/main` con contenuto identico ma hash diversi (`git pull`: "Merge with strategy ort failed"). Se `git diff origin/main main --stat` è vuoto, `git reset --hard origin/main` è sicuro.

## Shell e altri strumenti

- Alcuni sorgenti hanno fine riga CRLF (es. `backend/src/app.module.ts`): `sed` con `;$` non matcha. Per modifiche via script usare Python preservando `\r\n` e ricontrollare doppioni.
- Generare SQL con apostrofi/virgolette da un heredoc Python dentro Bash è inaffidabile (escaping perso in silenzio in un caso reale). Scrivere uno script `.py` vero con il tool Write.
- `curl http://localhost:3010/...` dal Bash tool torna exit 52 (empty reply) per la sandbox: serve `dangerouslyDisableSandbox`, non è l'API giù.
- `child_process.execFile`/`exec` asincroni non supportano `input` per lo stdin (solo le varianti `*Sync`): per pipare dati (es. `mysql < dump.sql`) serve `spawn` con scrittura su `child.stdin` (PR #36).
- `stat.birthtime` non affidabile su overlay2/tmpfs nei container (identico per file scritti a pochi ms di distanza): mettere il timestamp nel nome file o in un campo DB.
