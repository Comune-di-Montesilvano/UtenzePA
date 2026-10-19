# Import automatico delle fatture dalla PEC SDI (roadmap voce 6) — design

Data: 2026-10-19

## Perché

Le fatture delle utenze arrivano al Comune dallo SDI su una casella PEC dedicata. Oggi in UtenzePA ci sono solo fatture caricate una tantum (ACA, registro della contabilità del 2026-10-16) per ricostruire i pregressi: non esiste un flusso manuale da sostituire, l'import è la prima alimentazione vera.

Cosa serve all'ufficio:

1. **spesa per utenza** affidabile;
2. **consumi reali** dalle fatture;
3. **catena contratto → CIG → utenza** coerente: ogni fattura agganciata a contratto e utenza giusti, le incoerenze visibili.

Decide l'ufficio, mai l'import: le anagrafiche (fornitori, contratti, CIG, utenze, impegni) non vengono mai modificate automaticamente. Ogni differenza è una segnalazione; l'utente contesta al fornitore o crea il contratto nuovo.

## Obiettivi

- Lettura della casella PEC SDI **ogni 15 minuti**, sola lettura, incrementale.
- **Stato della fattura** dalle notifiche SDI: ricevuta, accettata, rifiutata, decorsi i termini, esito scartato.
- **Pattern per fornitore**: l'utente mappa una volta i campi dell'XML, l'import estrae da solo le fatture con la stessa struttura.
- Fattura nuova → creata; fattura già presente → **arricchita tenendo l'id**.
- Righe per utenza, consumo del periodo nel tab Consumi, spesa subito.
- **Rifiutata = nessun effetto**: fuori dalla spesa, consumi tolti, resta visibile nell'elenco come rifiutata.
- XML e PDF **consultabili a video** dalla scheda fattura e nell'editor dei pattern, letti al momento dalla casella.
- Segnalazioni in dashboard: pattern sconosciuti e differenze con l'anagrafica.

## Non obiettivi

- Fatture che non sono di utenze (Poste, servizi, noleggi). **Locazioni passive** (EGAM, IMALAI) possibile estensione futura: non si costruiscono, il modello non deve impedirle.
- Fornitori non in anagrafica o senza P.IVA: solo contati.
- Invio di esiti allo SDI: accettare/rifiutare resta alla ragioneria dal gestionale contabile.
- Numero di protocollo: nessun web service del protocollo; resta quello eventualmente già importato dal registro della contabilità (`invoices.protocol_number`).
- Lettura del **PDF** (contatore, tipo lettura stimata/reale): i pattern lavorano solo sull'XML. Il PDF si guarda, non si analizza.
- Conservazione di XML e PDF in UtenzePA: quando il server PEC cancella il messaggio (oggi dopo circa 3 mesi), sparisce anche da noi. Per rintracciare una fattura vecchia c'è il protocollo.
- Fatture attive del Comune (passano dalla stessa casella): ignorate.

## Anti-obiettivi

- Anagrafiche modificate dall'import, anche "a fin di bene".
- Una fattura rifiutata che lascia tracce nella spesa o nei consumi.
- Un editor dei pattern che richiede di conoscere XPath: l'utente sceglie da select con valori veri.

## Dati di partenza (analisi della casella, 2026-10-19)

Casella Legalmail `mbox.cert.legalmail.it:993` (IMAPS), una sola cartella con messaggi (INBOX), 3.770 messaggi dal 26/07/2026: il server conserva circa 3 mesi.

| Contenuto | N. |
|---|---|
| Fatture ricevute (`IT…_xxxxx.xml` / `.xml.p7m`) | 1.343 (671 da fornitori in anagrafica con P.IVA) |
| Metadati `MT` | 1.322 |
| Esiti committente `EC`, nelle ricevute di consegna PEC dei messaggi che il gestionale contabile spedisce da questa casella | 973 (EC01 906, EC02 67) |
| Decorrenza termini `DT` | 362 |
| Scarto esito `SE` | 10 |
| Ricevute PEC di accettazione | 1.000 |
| `RC`/`MC` (fatture attive del Comune) | 21 |
| Altro (newsletter, corsi) | 56 |

- **Firmate**: la maggioranza è `.xml.p7m` (CMS/DER, a volte base64).
- **Nome file** = id del *trasmittente*, non del fornitore (es. ACA trasmessa da un intermediario): il fornitore si legge solo da `CedentePrestatore` nell'XML.
- **Dove sta l'utenza**: A2A, Dolomiti, Magis, Hera su ogni riga in `AltriDatiGestionali` (`TipoDato` = POD/PDR/«Pod/Pdr»); ACA in testata (`DatiContratto/IdDocumento` = codice servizio = `utilities.utility_id`); Tiscali, Engie solo numero di contratto.
- **Consumo**: ACA in `DettaglioLinee/Quantita` (Mc); A2A solo nel testo di `Causale` («kWh 542»); gas da verificare.
- **Importi di riga** senza IVA (`PrezzoTotale` + `AliquotaIVA`); le nostre righe sono IVA inclusa. Split payment: costo per l'ente IVA inclusa.
- **Già presenti**: 502 delle 671 fatture in anagrafica hanno stesso fornitore, numero, data e totale di una fattura nel DB locale.
- «Magis Energia» ha la P.IVA registrata su AGSM AIM Energia (id 51): cambio di ragione sociale da verificare in anagrafica, non nell'import.

Gotcha già raccolti in roadmap voce 6 (A2A, ACA, split payment, impegni, consumi `INVOICE`) valgono tutti.

## Flusso

```
IMAP (ogni 15 min, UID nuovi) → messaggio classificato
  ├─ fattura → P.IVA cedente in anagrafica? ── no → contata, scartata
  │                                          └ sì → pattern riconosce la struttura?
  │                                                   ├ no → "in attesa di pattern"
  │                                                   └ sì → estrazione → fattura creata/arricchita
  │                                                                     → righe, consumi, segnalazioni
  ├─ EC / DT / SE (anche dentro le ricevute di consegna) → stato della fattura (IdentificativoSdI)
  └─ resto → ignorato
```

### 1. Acquisizione

- IMAP in sola lettura (`EXAMINE`, `BODY.PEEK`): l'import non cambia flag, non sposta, non cancella.
- Incrementale per `UIDVALIDITY` + ultimo UID letto. Se cambia `UIDVALIDITY` si rilegge tutto e si deduplica per `IdentificativoSdI` / `Message-ID`.
- Registro dei messaggi SDI in UtenzePA (solo metadati: UID, Message-ID, data, tipo, nome file, `IdentificativoSdI`, fattura collegata): serve per lo stato, per il conteggio dei fornitori esclusi e per ritrovare il messaggio quando si vuole vedere XML/PDF. Nessun file salvato.
- Estrazione dell'XML dalle `.p7m` senza verificare la firma (lo SDI l'ha già verificata).
- Prima esecuzione in produzione: elabora tutta la casella (circa 3 mesi).
- Configurazione da variabili d'ambiente (`PEC_IMAP_HOST`, `PEC_IMAP_PORT`, `PEC_IMAP_TLS`, `PEC_IMAP_USER`, `PEC_IMAP_PASSWORD`; Infisical come gli altri segreti). Senza configurazione l'import è spento, il resto dell'app funziona.
- **Interruttore del motore di import** (richiesta dell'utente): serve a evitare guai durante export/import del DB tra ambienti. *Scelta di Claude:* interruttore Admin in «Backup e manutenzione» (acceso/spento, salvato nel DB, quindi un DB importato porta con sé il suo stato: va spento prima dell'export e riacceso dopo), più una variabile d'ambiente che lo forza spento (es. in dev). Durante il ripristino di un backup il motore è comunque fermo (`common/maintenance`). Spento = nessun collegamento IMAP; riacceso riprende dall'ultimo UID letto.

### Fonte dei dati

Il caricamento dal DB locale in produzione (export + import) è servito solo per lo storico ricostruito da fonti eterogenee. **Con questa feature la produzione diventa autonoma per le fatture**: l'import gira in produzione, e gli export dal locale non devono più sovrascriverla.
- **Prerequisito infrastrutturale**: dal server di produzione deve essere aperta la porta TCP 993 in uscita verso `mbox.cert.legalmail.it` (dal PC di sviluppo è stata necessaria una regola sul firewall dell'ente). Da scrivere nelle note di rilascio.

### Perimetro dei fornitori

*Scelta di Claude:* «in anagrafica con P.IVA» = soggetto terzo non cancellato con P.IVA e ruolo **fornitore** (almeno un contratto di fornitura). Locatori e conduttori restano fuori finché non si fanno le locazioni. Per le fatture di un fornitore che non sono di utenze (es. servizi) l'editor ha l'azione **«Ignora questa struttura»**: crea un pattern «ignorato», le fatture simili presenti e future escono dalla segnalazione e restano solo contate nel registro.

### 2. Pattern

Un pattern appartiene a **un fornitore** e a **una struttura XML**. Una fattura dello stesso fornitore con l'utenza (o un altro campo mappato) in un punto diverso è un altro pattern.

Contenuto: per ogni campo UtenzePA, la regola che lo estrae.

| Livello | Campi |
|---|---|
| Testata | P.IVA fornitore, ragione sociale, numero, data, tipo documento, totale, imponibile, CIG, riferimento contratto |
| Riga | utenza (POD/PDR/codice servizio), periodo da/a, importo, descrizione, consumo, unità, contatore |

Tipi di regola:

- **campo XML** (percorso), anche con condizione sul fratello (es. `AltriDatiGestionali` con `TipoDato` = POD → `RiferimentoTesto`);
- **numero dopo una parola** in un testo libero (es. `Causale`, «kWh»);
- **calcolo** dell'importo riga IVA inclusa (`PrezzoTotale × (1 + AliquotaIVA/100)`);
- **dalla testata** per un campo di riga (es. utenza ACA in testata → vale per tutte le righe);
- **filtro sulle righe** per il consumo: solo le righe la cui descrizione contiene una parola (es. ACA ripete gli stessi Mc su «Tariffa», «Imposta fogne», «Imposta depurazione»: il consumo si prende solo da «Tariffa»);
- **non presente**.

Abbinamento dell'utenza (*scelta di Claude*): il valore estratto si cerca, nell'ordine, in `utility_id` (POD/PDR/codice servizio) e in `utility_code` (codice cliente fornitore); per i fornitori con solo il numero di contratto (Tiscali, Engie) il pattern può dire «utenza dal riferimento contratto», che vale se a quel riferimento corrisponde una sola utenza del fornitore. Altrimenti «utenza sconosciuta».

"Stessa struttura" (scelta del builder, proposta): stesso fornitore e presenza di tutti i percorsi usati dalla mappatura. Quando più pattern dello stesso fornitore riconoscono una fattura vince il più specifico; se ambiguo, la fattura va in attesa.

Salvare un pattern rielabora le fatture in attesa che riconosce. Modificare un pattern rielabora le fatture già estratte con quel pattern **solo se il messaggio è ancora sulla casella**; le altre restano come sono.

### 3. Editor dei pattern

Si apre dalla segnalazione «pattern sconosciuti» (raggruppate per fornitore e struttura).

- **Form a sinistra, XML a destra**, link per aprire il **PDF** a video (letto dalla casella).
- Ogni campo è una select con i campi XML della fattura, **ordinati per plausibilità**: prima quelli col formato del campo (P.IVA = 11 cifre, date, importi, POD `IT…E…`, PDR 14 cifre…), **in fondo i dati del Comune** (blocco `CessionarioCommittente`: non serve un parametro), poi il resto. Ogni opzione mostra etichetta (percorso leggibile) e valore.
- Accanto al valore un **badge** di riscontro con l'anagrafica: verde *riconosciuto/coerente* (es. «P.IVA → A2A ENERGIA SPA (46)», «POD → utenza 812», «fattura già presente: verrà arricchita»), giallo *differenza* (es. CIG diverso da quello del contratto dell'utenza), grigio *non mappato*.
- Barra in alto: **numero di fatture simili**, frecce per **sfogliarle** con la mappatura applicata (servono a sciogliere i campi ambigui: due campi uguali sulla prima fattura e diversi su un'altra), conteggio di quante la reggono.
- Bozza di riferimento: `.superpowers/brainstorm/…/pattern-editor-v2.html` (non versionata; sostanza descritta qui).
- Permessi: Admin e Operatore (come la modifica delle fatture); Lettore vede.

### 3b. Pagina «Import fatture» (Impostazioni)

Voce propria in Impostazioni (`/invoice-import`), non più tab di Backup e manutenzione:
- **Motore**: stato (configurato, spento dal server, acceso/spento, in corso), interruttore ed «Esegui ora» (solo Admin), ultimo giro e ultimo giro riuscito, ultimo errore, conteggi dei file per esito, ultimi messaggi in errore.
- **Pattern**: strutture da mappare (fornitore, n. fatture, «Mappa» → editor) e pattern esistenti (fornitore, nome, fatture estratte, modifica, elimina; ignorati a parte, ripristinabili).
- Segnalazioni della dashboard (motore fermo, strutture da mappare) portano qui.

### 4. Applicazione alla fattura

- **Abbinamento** a una fattura esistente: stesso fornitore + numero + data (non cancellata). Trovata → **arricchita, stesso id**: righe sostituite da quelle dell'XML, testata completata (totale, imponibile, contratto se vuoto), aggiunti `IdentificativoSdI` e riferimento al messaggio. Non trovata → creata.
- **Fornitore**: dalla P.IVA. Se la ragione sociale nell'XML è diversa da quella in anagrafica: segnalazione, nessuna modifica.
- **Utenza della riga**: POD/PDR (PDR normalizzato a 14 cifre) o codice servizio → `utilities.utility_id`. Non trovata → riga senza utenza + segnalazione «utenza sconosciuta».
- **Contratto e CIG** (*scelta di Claude* sui dettagli): per ogni riga, contratto dell'utenza in corso alla **fine del periodo della riga** (data fattura se la riga non ha periodo); il CIG dell'XML si confronta con `cig_contract` di quel contratto, differenza → segnalazione. `contratto_id_fk` di testata = il contratto comune a tutte le righe; righe con contratti diversi → testata vuota + segnalazione.
- **Impegno della riga**: contratto + capitolo dell'utenza + esercizio, se esiste; altrimenti nessuno + segnalazione. L'import non crea impegni (le anagrafiche non si toccano).
- Righe senza utenza nell'XML (es. «Indennizzo» A2A) in una fattura con una sola utenza: ereditano quella utenza.
- Note di credito (`TD04`): importi negativi, stesse regole.
- **Correzioni a mano** (*scelta di Claude*): una fattura importata modificata a mano dall'utente non viene più rielaborata dalle modifiche del pattern (lo stato SDI continua ad aggiornarsi).
- **Consumo**: **una rilevazione per utenza e periodo** (*scelta di Claude*), dal consumo estratto (testata o righe filtrate); le righe della fattura con quell'utenza e quel periodo puntano alla stessa rilevazione `PERIOD` con `source = INVOICE` nel tab Consumi (nuovo collegamento riga → rilevazione, N righe → 1). Rilevazioni `INVOICE` già presenti sulla stessa utenza e periodo e non collegate (es. le 155 del registro della contabilità) vengono **adottate**, non duplicate. Segue la riga: rielaborazione la sostituisce, rifiuto la toglie. Se il periodo è già coperto da un'altra rilevazione: non duplica, segnala. Dopo ogni inserimento/rimozione, ricalcolo dei valori salvati sull'utenza (`ConsumptionRecalcService`). Il flag «stimata» (voce 23, `is_estimated`) resta falso: dall'XML non si sa.

### 5. Stato della fattura

Dalle notifiche SDI, per `IdentificativoSdI`:

| Notifica | Stato |
|---|---|
| fattura ricevuta | Ricevuta |
| EC01 (nella ricevuta di consegna dell'esito inviato) | Accettata |
| EC02 | **Rifiutata** |
| DT | Decorsi i termini |
| SE (esito scartato dallo SDI) | torna allo stato precedente l'esito, con avviso |

- Ricevuta, Accettata, Decorsi i termini: **contano subito** (spesa e consumi dal momento dell'import).
- **Rifiutata**: fuori da spesa per utenza/immobile/capitolo, dagli importi di `apis/spending/` (anche `chapter-year.ts`, budget-check), dalle anomalie sulle fatture e dai «costi del mese»; rilevazioni collegate tolte e ricalcolo dell'utenza. Resta nell'elenco fatture con stato «Rifiutata», XML e PDF consultabili finché sono sulla casella.
- Lo stato vale per **ogni fattura collegata a un messaggio SDI**, anche pregressa arricchita: un EC02 su una fattura del registro la toglie dalla spesa come le altre. Le fatture senza messaggio SDI (pregressi non arricchiti) non hanno stato: contano come oggi.
- Stato mostrato in elenco (colonna + filtro) e nella scheda (badge).

### 6. Segnalazioni

In dashboard e nelle segnalazioni dell'elenco fatture (meccanismo `GET /anomalies` esistente):

- **pattern sconosciuti** (fatture in attesa, per fornitore/struttura);
- utenza sconosciuta (POD/PDR/codice non in anagrafica);
- CIG diverso dal contratto dell'utenza;
- ragione sociale diversa dall'anagrafica;
- impegno mancante;
- periodo di consumo già coperto;
- esito scartato dallo SDI;
- import fermo (ultimo collegamento riuscito oltre una soglia, es. 2 ore): senza, la casella cancella e si perde tutto in silenzio.

### 7. Consultazione XML e PDF

Dalla scheda fattura (e nell'editor): «Vedi XML» e «Vedi PDF» leggono il messaggio dalla casella in quel momento (dal registro dei messaggi) e lo mostrano a video, senza download. Messaggio non più sulla casella → «Non più disponibile sulla PEC: cercare la fattura nel protocollo».

## Punti aperti (da decidere con l'utente durante lo sviluppo)

- **Arricchimento delle fatture già presenti** (502 dal registro della contabilità e ACA): orientamento dell'utente «sì, più informazioni sono meglio», cioè righe dell'XML al posto di quelle del registro; decisione finale in fase di finalizzazione. Il caso è un'eccezione legata allo storico: il modello non deve dipenderne.
- **Consumo ACA ripetuto su più righe** (stessi Mc su «Tariffa», «Imposta fogne», «Imposta depurazione»): il filtro sulle righe descritto sopra è una proposta; si approfondisce quando si fa il pattern ACA, se il riconoscimento trova difficoltà.
- **Utenze senza POD** (Tiscali, Engie: solo numero di contratto): l'abbinamento via `utility_code`/riferimento contratto descritto sopra è una proposta; si decide alla fine.

## Guida

Nuove sezioni: cos'è l'import da PEC, stati della fattura, cosa fare con un pattern sconosciuto (editor passo passo), significato delle segnalazioni, «XML/PDF non più disponibile». FAQ: «La fattura rifiutata non compare nella spesa», «Ho corretto il pattern ma le fatture vecchie non cambiano».

## Lasciato al builder

- Libreria IMAP Node e parsing MIME/CMS (verificare compatibilità con jest: pacchetti ESM-only, vedi `docs/claude/dependencies.md`).
- Modello dati di registro messaggi, pattern e regole (tabelle o JSON), nomi delle colonne.
- Firma della "struttura" e scelta del pattern più specifico.
- Ordinamento di plausibilità per tipo di campo.
- Concorrenza del job ogni 15 minuti (un solo giro alla volta).
- Arrotondamenti dell'importo riga e scostamento dal totale documento (la scheda mostra già la differenza).
- Lettura parziale dei messaggi (struttura + primi KB della fattura) per scartare presto i fornitori non in anagrafica: ottimizzazione facoltativa.
