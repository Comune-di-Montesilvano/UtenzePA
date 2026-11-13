# Contribuire a UtenzePA

Issue e pull request sono benvenute. Le vulnerabilità di sicurezza **non** vanno aperte come issue pubbliche: vedi [SECURITY.md](SECURITY.md).

## Segnalare un bug o proporre una funzionalità

Apri una [issue](https://github.com/Comune-di-Montesilvano/UtenzePA/issues) indicando versione (tag immagine o `/health`), passi per riprodurre, comportamento atteso e osservato. Mai dati reali dell'ente (nomi, codici fiscali, POD/PDR, importi di fatture) nelle issue o negli allegati: usare dati fittizi (`ROSSI MARIO`, `RSSMRA80A01H501U`, `ACME SRL`).

## Pull request

Tutte le modifiche a `main` passano da pull request, con merge tramite merge queue solo a check verdi (lint, test, migration, build e scansione delle immagini, e2e, controlli di sicurezza delle dipendenze).

Prima di aprire una PR:

1. Backend (nel container `api`): `pnpm run lint:ci`, `pnpm run type-check`, `pnpm exec jest <spec toccati> --maxWorkers=2` (la suite intera la esegue la CI).
2. Frontend: `pnpm run lint`, `pnpm exec ng test --watch=false`, `pnpm run build` (controlla anche le ancore della guida).
3. Migration nuove: generate e verificate come in `docs/claude/backend.md` (`schema:log` pulito sulle tabelle toccate).
4. Modifiche visibili all'utente: guida `frontend/public/guida/guida.md` aggiornata nella stessa PR.
5. Leggi `CLAUDE.md` e il file pertinente in `docs/claude/` per i pattern e i gotcha del progetto.

## Test automatici (policy)

**Ogni nuova funzionalità e ogni bugfix includono test automatici** che ne coprono il comportamento: Jest per il backend, Vitest per il frontend, pytest per il container `tinn`, Playwright (`e2e/`) per i percorsi principali. Un bugfix aggiunge un test di regressione che fallisce senza la correzione. Una PR senza test va motivata nella descrizione (es. sola documentazione o configurazione).

## Stile del codice

- TypeScript strict, ESLint senza errori (`lint:ci` in CI), Prettier sul backend.
- Commenti, messaggi utente e guida in italiano; commit in formato [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `ci:`…), controllato da commitlint.
- Nessun segreto o dato reale dell'ente nel codice, nei test, nelle fixture o nei commit.

## Licenza

Contribuendo accetti che il tuo contributo sia distribuito sotto [EUPL-1.2](LICENSE), la licenza del progetto.
