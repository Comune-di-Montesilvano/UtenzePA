# Adattatore Tinn

Container facoltativo dell'import della contabilità (fase 4, roadmap voce 26). Ogni notte scarica via SFTP il backup del database Tinn, lo ripristina con Firebird, estrae `capitoli.csv`, `impegni.csv` e `liquidazioni.csv` nel formato neutro e li consegna a UtenzePA nella cartella condivisa `accounting_inbox`. UtenzePA li carica da solo (Impostazioni → Contabilità).

Design: `docs/superpowers/specs/2026-10-27-adattatore-tinn-design.md`.

## Accensione

Il servizio `tinn` di `docker-compose.yml` ha il profilo `tinn`: senza `COMPOSE_PROFILES=tinn` nel `.env` non viene creato. Con il profilo servono le variabili (se ne manca una il container lo scrive nella pagina Contabilità e resta fermo):

| Variabile | Default | |
|---|---|---|
| `TINN_SFTP_HOST` | — | server SFTP di Tinn |
| `TINN_SFTP_PORT` | `22` | |
| `TINN_SFTP_USER` | — | |
| `TINN_SFTP_PASSWORD` | — | segreta, mai nei log |
| `TINN_SFTP_PATH` | — | percorso dello zip sul server |
| `TINN_DB_FILE` | — | nome del `.fbk` dentro lo zip |
| `TINN_SFTP_HOST_KEY` | — | facoltativa: chiave host attesa (`ssh-ed25519 AAAA…`); senza, quella vista al primo collegamento |
| `TINN_CRON` | `0 4 * * *` | orario del giro (fuso `Europe/Rome`) |

Il firewall deve permettere la connessione in uscita verso il server SFTP. Durante il giro servono circa 6 GB liberi nel volume `tinn_work`; alla fine resta vuoto.

## Prova in locale

`TINN_LOCAL_ZIP` (solo sviluppo) fa copiare uno zip locale invece di scaricarlo. Test: `docker build --target test -t utenzepa-tinn:test tinn && docker run --rm utenzepa-tinn:test`.
