# Adattatore Tinn (import contabilità, fase 4) — design

Data: 2026-10-27. Segue `2026-10-25-import-contabilita-design.md` (fasi 1–3, v1.50.0). Roadmap voce 26.

## Perché

La fase 3 ha fatto di UtenzePA un ricevitore della contabilità: tre CSV nel formato neutro (`capitoli`, `impegni`, `liquidazioni`) caricati a mano da Impostazioni → Contabilità, poi un giro idempotente che rende la contabilità la fonte di verità. Caricarli a mano non è l'obiettivo: gli enti con contabilità integrata devono avere **tutto automatico**. Il Comune di Montesilvano usa Tinn (Firebird); Tinn pubblica ogni giorno un backup del database su un server SFTP.

**Successo** (parole dell'utente): ogni notte alle 4 lo scaricamento parte da solo in un container dedicato e la mattina in UtenzePA la contabilità che ci riguarda è aggiornata.

## Obiettivi

- Un container dedicato «Tinn» che ogni notte scarica il backup via SFTP, lo ripristina in un Firebird interno, estrae i tre CSV del formato neutro e li consegna a UtenzePA, che fa il giro della fase 3 senza intervento umano.
- Il container esiste solo dove serve: **una variabile** lo aggiunge allo stack; senza, non viene mai creato.
- Primo giro subito alla prima accensione del container, poi ogni notte; «Esegui ora» manuale (pensato per dopo un errore).
- Errori visibili: in pagina Contabilità e in dashboard se i dati invecchiano.

## Non obiettivi

- Nessun driver Firebird né codice Tinn nel backend (decisione della fase 3, resta).
- Nessuna configurazione SFTP dalla UI: solo variabili d'ambiente (decisione dell'utente).
- Nessun adattatore per altre contabilità. Il container nasce per Montesilvano con le parti specifiche in variabili; si generalizza quando arriva un altro ente Tinn.
- Nessuna modifica al giro della fase 3 (passi, regole, blocchi, anomalie esistenti).

## Anti-obiettivi (fallimento anche se «funziona»)

- Credenziali SFTP nel repo, nell'immagine, nei log o in qualsiasi file oltre alle variabili d'ambiente del server. `restore.sh` del Comune contiene la password in chiaro: **mai copiarlo** né riprodurne i valori.
- Dati della contabilità (backup, DB ripristinato, CSV) che restano su disco dopo l'uso: sono dati personali e pesano (~1,7 GB il `.fbk`, ~4 GB il DB).
- Un errore notturno che cancella o rovina dati già importati: in UtenzePA restano i dati dell'ultimo giro riuscito.
- Il container presente o richiesto negli stack degli enti che non lo vogliono (variabili SFTP obbligatorie per tutti, immagine scaricata comunque).

## Decisioni dell'utente

1. Orario: **ogni notte alle 4**. Primo giro **alla prima configurazione** (prima accensione del container). Manuale **solo per ripartire dopo un errore** (il bottone c'è, la pagina lo evidenzia dopo un errore).
2. Container **dedicato**, attivato da **una variabile**: profilo Docker Compose `tinn`, acceso con `COMPOSE_PROFILES=tinn` nel `.env`. Senza profilo il servizio non viene creato né scaricato.
3. Credenziali e percorso SFTP **solo in variabili d'ambiente**.
4. Consegna a UtenzePA tramite **cartella condivisa** (sotto, «Casella»), approvata.
5. Il backup può essere identico tra un giorno e l'altro (weekend): non serve che il container lo riconosca per i dati, il giro della fase 3 è già idempotente (secondo caricamento identico = nessuna scrittura, verificato sul DB del Comune).

## Come funziona

### Il container `tinn`

Immagine `ghcr.io/comune-di-montesilvano/utenzepa-tinn`, sorgenti in `tinn/` alla radice del repo (Dockerfile + script). Base (scelta mia): l'immagine Firebird ufficiale più recente che ripristina il backup (ODS 12.0, dialect 1: un `gbak` più nuovo legge i backup delle versioni precedenti) e passa il Trivy bloccante della CI. Da verificare per primo, ripristinando il `.fbk` locale; se solo Firebird 3 funziona, Firebird 3 (`jacobalberty/firebird:v3.0`, quello della prova) con le eccezioni Trivy in `.trivyignore`, ciascuna con motivo e scadenza. Contiene anche un client SFTP non interattivo, `unzip` e il programma di estrazione.

Giro (un solo giro alla volta):

1. **Scarica** `TINN_SFTP_PATH` (oggi lo zip `DBEUROCF_MONTESILVANO.zip`) in una cartella di lavoro temporanea nel container (volume `tinn_work`, non condiviso).
2. Se lo zip ha lo stesso SHA-256 dell'**ultimo backup caricato con successo da UtenzePA** (`loaded_sha256` in `settings`, sotto), salta ripristino ed estrazione: scrive solo lo stato («backup invariato») e chiude. Conta il caricamento in UtenzePA, non il giro del container: se la notte prima la consegna non è stata caricata (errore, import spento), lo stesso backup si ripristina e si riconsegna. «Esegui ora» non salta mai. Risparmia minuti di ripristino nei weekend; non cambia i dati.
3. **Decomprime** e **ripristina** con `gbak -c -p 16384` in un database nuovo (sostituisce il precedente), poi cancella zip e `.fbk`.
4. **Estrae** i tre CSV dall'anno di partenza (sotto, «Anno di partenza»), con le query già verificate (sotto, «Query»).
5. **Consegna** i CSV nella casella (sotto) e cancella il database ripristinato.
6. Scrive lo **stato** del giro.

Pianificazione dentro il container (cron interno con `TINN_CRON`, default `0 4 * * *`, fuso `TZ=Europe/Rome`). All'avvio, se non esiste uno stato di giro riuscito, parte subito.

Ogni passo che fallisce chiude il giro con errore, cancella i file temporanei, scrive lo stato con il passo e il motivo; nessun CSV parziale arriva mai nella casella. Il giro successivo (notte dopo o «Esegui ora») riprova da capo.

### Variabili

Nel servizio `tinn` del `docker-compose.yml`, obbligatorie con `${VAR:?}` (lo sono solo se il profilo è attivo):

| Variabile | Default | Note |
|---|---|---|
| `TINN_SFTP_HOST` | — | oggi `sftp.tinnvision.cloud` |
| `TINN_SFTP_PORT` | `22` | |
| `TINN_SFTP_USER` | — | |
| `TINN_SFTP_PASSWORD` | — | secret; mai nei log |
| `TINN_SFTP_PATH` | — | percorso dello zip sul server |
| `TINN_DB_FILE` | — | nome del `.fbk` dentro lo zip (oggi `DBEUROCF_MONTESILVANO.fbk`) |
| `TINN_CRON` | `0 4 * * *` | |

Documentate in `.env.example` (commentate, sotto `COMPOSE_PROFILES`), nella guida di installazione e in `docs/claude/`. Nessun valore reale nel repo.

### Casella (cartella condivisa)

Volume named `accounting_inbox`, montato in `tinn` e in `api`. Contiene solo file piccoli e transitori:

- `capitoli.csv`, `impegni.csv`, `liquidazioni.csv`: scritti con nomi provvisori e rinominati alla fine; per ultimo il file **`ready`** (JSON: data e ora dell'estrazione, SHA-256 dello zip, righe per file). UtenzePA considera i CSV solo se c'è `ready`.
- **`status`** (JSON, scritto dal container): esito dell'ultimo giro (`ok` / `unchanged` / `error`), passo e messaggio di errore in italiano semplice, inizio e fine, data del backup, prossimo giro previsto. Mai credenziali.
- **`request`**: creato da UtenzePA per «Esegui ora»; il container lo vede (controllo ogni minuto), lo cancella e parte. Ignorato se un giro è in corso.
- **`settings`** (JSON, scritto da UtenzePA): anno di partenza attuale (sotto) e `loaded_sha256` + data dell'ultimo backup caricato con successo.

Lato UtenzePA (backend, modulo `accounting-import`):

- Un job **ogni 5 minuti**: se l'import è acceso e la casella ha un `ready` più recente dell'ultimo consumato, carica i tre file con lo stesso percorso del caricamento manuale (stessi controlli, stesse righe scartate, stesso giro dei passi e `reconcileAll`). Riuscito: **cancella** CSV e `ready`, scrive `loaded_sha256` in `settings` e la data in una colonna nuova `last_success_at` di `accounting_import_state` (migration: oggi `last_run_at` cambia anche sugli errori). Fallito: i file restano, quel `ready` è segnato come fallito e non si riprova da solo ogni 5 minuti (l'errore è deterministico); si riparte con la consegna della notte dopo o con «Esegui ora». Se un giro è già in corso aspetta il controllo successivo.
- Uno `status` «backup invariato» con lo stesso SHA-256 di `loaded_sha256` conta come conferma: aggiorna `last_success_at` (i dati in UtenzePA corrispondono all'ultimo backup). Import spento = i file restano nella casella finché non si accende (o arriva il giro dopo che li sostituisce).
- Il caricamento manuale dei CSV dalla pagina resta com'è (riserva e altri enti).
- Lo stato del container si legge da `status` e si espone nella risposta di `GET /accounting-import/status` (solo Admin), insieme all'esito del caricamento.
- Variabile `ACCOUNTING_INBOX_DIR` (default il punto di montaggio); se la cartella non esiste o non c'è `status`, la pagina non mostra la parte del container.

### Anno di partenza

Resta nella pagina Contabilità (fase 3, nel DB). UtenzePA lo scrive in `settings` a ogni salvataggio e all'avvio; il container lo legge prima di estrarre (manca il file = 2023, come nel primo caricamento). Così c'è una sola fonte e il container non estrae anni che UtenzePA ignorerebbe.

### Pagina Contabilità

Con il container presente (c'è `status`), una sezione «Scaricamento automatico» sopra il caricamento manuale:

- Ultimo scaricamento: data e ora, esito in parole («Completato», «Backup invariato, nessuna modifica», «Errore: server SFTP non raggiungibile»), data del backup.
- Prossimo giro previsto.
- Bottone **«Esegui ora»** (solo Admin): sempre presente; dopo un errore è evidenziato (colore primario, accanto al messaggio). Mentre il container lavora: «In corso…» e bottone disabilitato.
- L'esito del caricamento in UtenzePA resta mostrato come oggi (righe caricate, scartate, risultato dei passi).

### Segnalazione in dashboard

Nuova anomalia `accounting_import_stale`: import acceso, container presente e `last_success_at` più vecchio di **2 giorni** (il weekend con backup invariato e già caricato aggiorna `last_success_at`, quindi non suona). Testo: «Contabilità non aggiornata da N giorni». Un clic porta alla pagina Contabilità.

### Query (dalla bozza verificata sul DB del Comune)

Le query e le conversioni sono quelle della prova del 2026-10-26 (sezione «Verificato sul DB del Comune» della spec della fase 3). La bozza usata per la prova (`tinn_export.py`, solo nomi di tabelle e colonne, nessun dato del Comune) entra in `tinn/` come punto di partenza. Dove la bozza e la spec della fase 3 divergono vince la bozza: ha prodotto i file caricati senza scarti. In particolare le liquidazioni annullate **si esportano** con `cancelled = 1` (le scarta UtenzePA), non si filtrano.

- **Capitoli** `GFBIPRN1` (`TIPO='S'`, `ESERCIZIO=ANNO`, `ESERCIZIO >= anno di partenza`): iniziale = `PREV_COMP_RES`, assestato = iniziale + somma `GFVASTN1.IMPORTO` (stessi esercizio, anno, `TIPO='S'`, capitolo, articolo), `spent` vuoto (lo calcola UtenzePA dalle liquidazioni).
- **Impegni** `GFIMDEN1` (`SIGLA=1`, `ESERCIZIO <= ANNO`, `ANNO >= anno di partenza`) con `GFANCON1` sul `CREDITORE`: per ogni impegno (`ANNO_CREA/NUMERAZIONE/PROGRESSIVO`) e annualità `ANNO` la riga con l'`ESERCIZIO` più alto; importo = `IMPORTO + V_VAR_P − V_VAR_N`; `cancelled` = `ANNULLATO='A'`; fornitore = P.IVA, altrimenti codice fiscale.
- **Liquidazioni** `GFLIQUN1` (`IM_SIGLA=1`, `IM_ESERCIZIO >= anno di partenza`) con `GFPNCGN1` (`FA_ESERCIZIO/FA_NUMERO`) e `GFANCON1` sull'`ANAGRAFICA` **della fattura**: chiave = `ESERCIZIO-ANNO_CREA-SIGLA-NUMERAZIONE-PROGRESSIVO`; `NUMERO_DOCUMENTO`, `DOC_DATA`, `TOTALE_DOCUMENTO`, `FE_ID_SDI_S`, CIG della fattura altrimenti della liquidazione.
- Testi: il DB dichiara charset `NONE` ma i byte sono WIN1252 → UTF-8; a capo nei testi sostituiti da spazi; importi al centesimo con punto decimale; date ISO.

Con l'estrazione della prova: 24.874 / 12.755 / 40.644 righe, nessuna scartata da UtenzePA. Il container deve riprodurre gli stessi tre file a parità di backup (prova di accettazione).

### Rilascio e CI

- Nuova immagine nella matrice di `release.yml` e nel job `docker` di `tests.yml` (build + Trivy come le altre), tag come backend e frontend.
- Servizio `tinn` in `docker-compose.yml` con `profiles: ["tinn"]`, `restart: unless-stopped`, volumi `tinn_work` (suo) e `accounting_inbox` (condiviso con `api`); nessuna porta esposta. In `docker-compose.override.yml` build locale del sorgente.
- Nessun test della CI raggiunge l'SFTP. L'estrazione si prova in CI su un piccolo database Firebird di prova creato al volo con dati finti e le stesse tabelle/colonne usate dalle query (mai dati del Comune nel repo). La DDL di quelle tabelle (solo struttura: tipi delle colonne, dialect 1 con date TIMESTAMP e numeri DOUBLE) si ricava dal DB ripristinato nel container locale `tinn-comune`, che è ancora disponibile.
- **Prova di accettazione** (locale, fuori dal repo): il container, dato il `.fbk` del 22/10/2026 presente nei Download, produce gli stessi tre file della bozza sullo stesso backup (stesso numero di righe, 24.874 / 12.755 / 40.644, e stesso contenuto). I file di riferimento si rigenerano con la bozza; né backup né CSV entrano nel repo.

### Guida e documentazione

- Guida operatori: sezione «Collegare la contabilità» aggiornata (scaricamento automatico, «Esegui ora», cosa fare se è in errore, segnalazione); data in testa.
- Installazione (README o `docs/`): come accendere il profilo, variabili, accesso SFTP da aprire sul firewall (porta 22 verso il server Tinn), spazio disco (~6 GB temporanei durante il giro).
- `CLAUDE.md` e roadmap: fase 4.

## Lasciato a chi costruisce

- Linguaggio del programma di estrazione e del cron nel container (la bozza è in Python con `isql`; va bene anche un driver Firebird Python dentro il container).
- Client SFTP (`lftp`, `sshpass`+`sftp`, libreria Python) purché la password non compaia nella riga di comando visibile in `ps` né nei log.
- Verifica della chiave host SFTP: accettare e fissare la chiave al primo collegamento (salvata in `tinn_work`) è accettabile; meglio una variabile facoltativa `TINN_SFTP_HOST_KEY`.
- Formato esatto di `status`, `ready`, `settings` e dei messaggi, purché in italiano semplice per l'utente.
- Come il backend legge la casella (servizio nuovo nel modulo `accounting-import`, cron come gli altri job).

## Rischi e verifiche

- **SFTP non raggiungibile dalla rete di sviluppo**: lo scaricamento vero si prova solo sul server di produzione (firewall da aprire col CED). In sviluppo si prova il giro con una variabile che salta lo scaricamento e usa uno zip già presente in `tinn_work` (il backup locale nei Download, mai nel repo).
- **Spazio disco**: zip + `.fbk` + DB ~6 GB durante il giro; tutto cancellato alla fine anche in caso di errore.
- **Tempo**: ripristino ~qualche minuto + estrazione ~1 minuto + giro UtenzePA ~1 minuto; alle 4 nessun conflitto con il ricalcolo impegni (3:45) e il backup di UtenzePA.
