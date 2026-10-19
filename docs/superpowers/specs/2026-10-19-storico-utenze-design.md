# Storico di attivazione e intestazione delle utenze (roadmap voce 22)

Data: 2026-10-19

## Perché

Due domande oggi senza risposta affidabile:

1. **«Questa fattura copre un periodo in cui l'utenza doveva essere attiva?»**: periodi di fatturazione incongrui (es. utenze 2526 e 2874 sul DB locale: cessate il 07/07/2025, fatturate fino al 16/09/2025).
2. **«Il giorno X l'utenza era attiva, e intestata a chi?»** (Comune o soggetto terzo).

Oggi `supply_active` è solo lo stato di adesso, `activated_on`/`ceased_on` sono una data ciascuna (una riattivazione sovrascrive) e scollegate dallo stato, la voltura è un campo singolo (`transferred_to_third_party_id`/`transferred_on`) intrecciato con la spunta del contratto immobiliare e con `transfer_required`: l'utente la giudica «gestita veramente male».

Terza esigenza: seguire le **pratiche in corso**. L'ufficio chiede attivazioni e cessazioni al fornitore, e volture e reintestazioni alla controparte; poi le verifica sulle bollette. Tra il momento in cui nasce il bisogno e quello in cui il cambiamento avviene davvero serve un avviso, per sollecitare.

## Obiettivi

- Storico unico per utenza di **attivazioni, cessazioni, volture, reintestazioni**, da cui si ricava lo stato reale (attiva sì/no, intestatario) in qualunque giorno.
- **Cambiamenti in sospeso** con avviso finché non diventano effettivi.
- **Contratti immobiliari**: decisione **per singola utenza** (luce sì, acqua no è frequente) se segue il contratto o resta al Comune; volture e reintestazioni proposte dall'app a inizio e fine contratto.
- Anomalia sulle **fatture fuori dai periodi di attività**, sul periodo fatturato, con tolleranza.
- Inserimento manuale di cambiamenti già avvenuti, anche vecchi (es. voltura fatta e mai registrata).

## Non obiettivi

- Nessun dato di pratica oltre a date e note: niente protocollo, PEC, destinatario, allegati della richiesta.
- Nessuna ricerca delle date di attivazione storiche: un'utenza attiva da decenni resta «attiva da prima» finché è attiva.
- Nessun ridisegno dell'UI esistente. Il tab nuovo usa i componenti delle schede (`app-linked-table`, `app-tab-label`); il Riepilogo mostra solo lo stato. **Prima la logica, l'UI segue** (richiesta esplicita: le bozze proposte erano incongrue con l'UI attuale).
- Nessun calcolo di rimborsi tra Comune e controparte per i periodi di voltura in ritardo.
- "Manutenzione a carico di" non cambia.

## Anti-obiettivi

- Logica e UI appesantite: l'utente l'ha chiesto espressamente. Ogni cambiamento è **una riga**, non un flusso a stati con passaggi obbligatori.
- Anomalie su fatture di chiusura legittime (vedi tolleranza).

## Modello

### Il cambiamento (una riga)

Tabella nuova, una riga per cambiamento di un'utenza:

| Campo | Note |
|---|---|
| utenza | FK |
| tipo | `ACTIVATION`, `CESSATION`, `TRANSFER` (voltura a un soggetto terzo), `RETURN` (reintestazione al Comune) |
| intestatario | solo per `TRANSFER`: soggetto terzo a cui va l'utenza |
| data richiesta | facoltativa (vuota = non ancora chiesta, o cambiamento inserito a posteriori) |
| data effettiva | facoltativa: vuota = **in sospeso**. Correggibile anche dopo |
| data non nota | `ACTIVATION` o `CESSATION` avvenuta senza data conosciuta (attiva da prima, cessata da prima) |
| annullato il | cambiamento in sospeso annullato (a mano o in automatico): resta visibile nello Storico come «annullato», non conta per lo stato né per gli avvisi |
| contratto immobiliare | facoltativo: il contratto che ha generato il cambiamento |
| note | testo libero |
| standard | `deleted`, `created_by`/`updated_by`, audit come le altre entità |

La **data evento** (quando nasce il bisogno, da cui parte l'avviso) **non si salva**: è la data d'inizio o di fine del contratto immobiliare collegato, altrimenti la data richiesta, altrimenti la data di inserimento. **In ogni caso non prima della creazione della riga**: così le righe create dalla migration o per contratti iniziati anni fa contano i giorni dal rilascio, non dall'inizio del contratto.

### Stato in un giorno X

Si ricava solo dai cambiamenti **con data effettiva**, in ordine di data:

- **attiva**: l'ultimo `ACTIVATION`/`CESSATION` effettivo fino a X (le righe «data non nota» valgono come avvenute prima di qualunque data). Un `ACTIVATION` solo in sospeso non attiva l'utenza. Utenza senza nessuna riga effettiva = non attiva; ogni utenza attiva ha quindi almeno un `ACTIVATION` effettivo, eventualmente «data non nota» (vedi dati di partenza e creazione).
- **intestatario**: l'ultimo `TRANSFER`/`RETURN` effettivo fino a X; nessuno = Comune.

Righe annullate o cancellate non contano.

### Stato di oggi sull'utenza

`supply_active`, `activated_on`, `ceased_on`, `transferred_to_third_party_id`, `transferred_on` restano colonne su `utilities` ma diventano **di sola lettura, ricalcolate dallo storico** a ogni modifica di un cambiamento (stesso servizio, stessa transazione). Motivo: ~20 file (anomalie, mappa, spesa, filtri, elenchi) leggono `u.supply_active` in SQL; così restano invariati. **Scelta mia.** `activated_on`/`ceased_on` = date dell'ultimo `ACTIVATION`/`CESSATION` effettivo (null se «data non nota»). La data effettiva non può essere nel futuro, quindi il valore resta valido fino al cambiamento successivo; il ricalcolo notturno esistente le riallinea comunque.

Il form dell'utenza non le modifica più: «Fornitura attiva», «Attivata il», «Cessata il» e «Volturata a/il» spariscono dal form e si vedono come stato nel Riepilogo. `transfer_required` si elimina (sostituito dalla decisione per contratto, sotto).

**Creazione di un'utenza nuova** (**scelta mia**): il form di creazione chiede se è già attiva. Sì: `ACTIVATION` effettivo con la data indicata, oppure «data non nota» se vuota. No: `ACTIVATION` in sospeso, con data richiesta facoltativa.

**Coerenza delle righe** (**scelta mia**, permissiva ma senza ambiguità; errori 400 con messaggio):
- al massimo un cambiamento in sospeso per tipo;
- niente `TRANSFER` verso chi ha già l'utenza, niente `RETURN` se è già del Comune;
- data effettiva non nel futuro e non prima della data richiesta;
- sequenze effettive incoerenti (due attivazioni di fila, voltura su utenza cessata) **accettate** con avviso nel tab, non bloccate: servono per inserire a posteriori uno storico incompleto.

### Contratti immobiliari

Riguarda i contratti concessi dal Comune (`direction = ACTIVE`) sulle utenze dei loro immobili.

**Contratto attivo** (decisione utente 2026-10-19): stato dichiarato `ACTIVE` **e** fine effettiva non passata, calcolata con `effectiveEndDate` (`real-estate-contract.calc.ts`, considera il rinnovo tacito). Un contratto dichiarato in corso ma scaduto conta come **finito** (sul DB locale 165 così al 2026-10-19). La stessa definizione vale per «da decidere», per `costInfo`/`costStatusSql` (oggi guardano solo lo stato dichiarato) e per gli eventi di fine. Serve il controllo notturno: un contratto finisce per data senza che nessuno lo salvi.

- **Decisione per utenza**: nuova tabella contratto × utenza con la decisione `FOLLOWS` (segue il contratto) / `STAYS` (resta al Comune) / vuota (**da decidere**). La spunta «Utenze da volturare» del contratto resta come **proposta di partenza**: precompila `FOLLOWS` nella scelta, ma finché l'ufficio non conferma, l'utenza è da decidere. **Scelta mia**: la proposta si applica con un clic («Conferma la proposta per tutte»), non da sola.
- **Contratto che parte**: ogni utenza degli immobili del contratto è **da decidere**, con avviso dalla data d'inizio del contratto. `FOLLOWS` crea un `TRANSFER` in sospeso verso la controparte (se le parti sono più d'una, l'ufficio sceglie quale), collegato al contratto. `STAYS` non crea nulla.
- **Rinnovo con la stessa controparte** (stesso contratto prorogato, anche col rinnovo tacito; oppure contratto nuovo con la stessa parte sullo stesso immobile): la decisione e l'intestazione restano, niente da decidere. `parent_contract_id` non c'entra: lega le assegnazioni figlie a una concessione, non i rinnovi.
- **Controparte diversa**: l'utenza torna da decidere; con `FOLLOWS` il `TRANSFER` va direttamente al nuovo intestatario, senza passare dal Comune. Fino alla data effettiva lo storico la mostra intestata al precedente.
- **Contratto che finisce** (non più attivo, nel senso sopra; data evento = fine effettiva, o data del cambio di stato): se l'utenza è intestata a una parte di quel contratto e non c'è un contratto nuovo che la riguarda, si crea da solo un `RETURN` in sospeso, collegato al contratto, con avviso dalla data di fine.
- **Contratto chiuso mentre il `TRANSFER` è ancora in sospeso**: il `TRANSFER` si annulla da solo (l'utenza non è mai uscita dal Comune).
- **Cambi a metà** (**scelte mie**, stessa regola: lo stato desiderato si confronta con quello reale):
  - decisione da `FOLLOWS` a `STAYS`: `TRANSFER` in sospeso annullato; se già volturata a quella parte, `RETURN` in sospeso;
  - immobile tolto dal contratto, utenza scollegata dall'immobile, parte intestataria tolta dal contratto: come la fine del contratto per quell'utenza;
  - rinnovo con un contratto nuovo e la stessa parte: la decisione si copia sul contratto nuovo;
  - utenza con due contratti attivi, entrambi `FOLLOWS` e controparti diverse: vince il contratto iniziato per ultimo; l'altro mostra un avviso nel tab Utenze del contratto.
- Gli annullamenti automatici valorizzano «annullato il» con una nota che ne dice il motivo.
- Le creazioni e gli annullamenti automatici avvengono nel salvataggio del contratto immobiliare (cambio di stato, immobili, parti) e nel job notturno per i contratti che scadono per data. **Scelta mia** sul meccanismo: la regola resta una sola funzione, chiamata da entrambi.

### Stato «A carico di»

`CostStatus` resta e cambia significato, così badge e segnalazioni restano dove sono:

| Stato | Quando |
|---|---|
| `COMUNE` | intestata al Comune, niente in sospeso |
| `TO_DECIDE` (nuovo) | almeno un contratto attivo con decisione vuota per l'utenza |
| `TO_TRANSFER` | `TRANSFER` in sospeso |
| `TRANSFERRED` | intestata a un terzo, niente in sospeso |
| `TO_RECOVER` | `RETURN` in sospeso |

La gemella SQL `costStatusSql` va riscritta sulla stessa regola.

### Avvisi

- Segnalazioni nell'elenco utenze e anomalie in dashboard: «Utenze da decidere» (nuova), «Utenze da volturare» e «Utenze da reintestare» (al posto di «Volturate da riprendere»), «Attivazioni in sospeso», «Cessazioni in sospeso». Ognuna mostra da quanti giorni, a partire dalla data evento.
- **Scelta mia**: niente soglia di giorni prima dell'avviso; tutte le pratiche in sospeso sono segnalate.

### Fatture fuori periodo

L'anomalia «Fatture su utenze cessate» diventa **«Fatture fuori dai periodi di attività»**: una riga fattura con utenza è anomala se il suo periodo (`period_start`–`period_end`; senza periodo, la data della fattura) cade fuori dai periodi in cui l'utenza era attiva, con **30 giorni di tolleranza** dopo ogni cessazione (spese di chiusura). **Scelta mia**: la stessa tolleranza prima di ogni attivazione. Cessazioni «data non nota» e utenze «attive da prima» non generano anomalie nei periodi non coperti da date. Finestra: ultimi 12 mesi, come oggi.

### Consumi

I «Periodi senza dati» (`consumption-calculator.ts`) non contano i giorni in cui l'utenza non era attiva.

## UI (minima, l'utente la rivedrà)

- **Scheda utenza, tab nuovo «Storico»**: elenco dei cambiamenti (tipo, intestatario, data richiesta, data effettiva, note, contratto collegato) con `app-linked-table`; in sospeso evidenziati; azioni «Nuovo cambiamento» (anche già avvenuto: si compila direttamente la data effettiva) e modifica della riga, dove si inserisce la data effettiva.
- **Riepilogo dell'utenza**: solo lo stato di oggi (attiva/cessata, intestata a…, eventuale cambiamento in sospeso da N giorni), nel riquadro «A carico di» esistente.
- **Scheda contratto immobiliare, tab Utenze** (esiste): colonna decisione per utenza (segue / resta al Comune / da decidere), «Conferma la proposta per tutte».
- Guida operatori aggiornata nella stessa PR.

## Dati di partenza (migration + DB locale)

Migration (schema e conversione deterministica):

- `activated_on` presente → `ACTIVATION` effettivo a quella data.
- `ceased_on` presente → `CESSATION` effettivo a quella data.
- `supply_active = 0` senza `ceased_on` → `CESSATION` effettivo con **data non nota** (preceduto da `ACTIVATION` «data non nota»).
- `supply_active = 1` senza `activated_on` → `ACTIVATION` effettivo con **data non nota**: attiva da prima.
- La migration ricalcola poi le colonne di stato e verifica che `supply_active` non cambi per nessuna utenza (SELECT di controllo, si ferma con l'elenco se qualcosa non torna).
- Volture: oggi nessuna utenza volturata e nessun `transfer_required` valorizzato (DB locale, 2026-10-19); la migration le converte comunque in `TRANSFER` effettivo se presenti in produzione.
- Contratti attivi (definizione sopra) **con** «Utenze da volturare» (8 sul DB locale, 34 utenze): le utenze diventano **da decidere**, con «segue» proposto. Contratti attivi **senza** la spunta (70, 88 utenze): decisione `STAYS` d'ufficio, come oggi di fatto (decisione utente 2026-10-19).
- Giorni di attesa delle righe create dalla migration: dal rilascio (regola della data evento).

Sul DB locale, a mano con conferma dell'utente (produzione via export): le 3 cessate senza data con fatture (2559, 2581, 2733) ricevono come data effettiva la fine dell'ultimo periodo fatturato, con nota **«Data stimata dall'ultima fattura»** (data non nota tolta).

## Lasciato al builder

- Nomi di tabelle, colonne, enum, endpoint.
- Come ricalcolare le colonne di stato (servizio dedicato, transazione).
- Criterio esatto di «stessa controparte» per il rinnovo, purché copra il contratto prorogato e la stessa parte sullo stesso immobile.
- Struttura delle query delle anomalie (in fondo a `getAnomalies()`, mock posizionali nello spec).
