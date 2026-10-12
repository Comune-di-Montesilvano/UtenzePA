# UtenzePA – Guida per gli operatori

_Ultimo aggiornamento: 2026-10-12_

## Cos'è e chi lo usa

UtenzePA è il gestionale del patrimonio e delle utenze del Comune: immobili, utenze (luce, gas, acqua, telefonia, internet…), impianti, contratti immobiliari e di fornitura, fatture e capitoli di spesa. Lo usano gli uffici che gestiscono il patrimonio, le forniture e la spesa per le utenze, e chi ha bisogno di consultarne i dati.

Ogni elemento ha una scheda con i suoi collegamenti: da un immobile si arriva alle sue utenze, da un'utenza ai contratti e alle fatture, da un capitolo alla spesa dell'anno.

## Accesso

- **Indirizzo**: il link è nella plancia dei dipendenti.
- **Credenziali**: con l'account di dominio inserisci il nome utente del PC (es. `nome.cognome`) e la sua password. Gli account locali entrano con l'email.
- **Primo accesso con l'account di dominio**: l'utente viene creato in automatico in sola consultazione (ruolo Lettore). Per modificare i dati chiedi a un amministratore di cambiarti il ruolo.
- **Password dimenticata?**: vale solo per gli account locali. Ricevi un codice OTP via email e scegli una nuova password. Per l'account di dominio la password è quella del PC.
- **Inattività**: dopo 30 minuti senza attività l'applicazione esce da sola e torna al login.

## Operazioni frequenti

### Trovare un elemento negli elenchi

Ogni voce del menu (Immobili, Utenze, Impianti, Fatture…) apre un elenco.

1. Scrivi nella ricerca libera per filtrare le righe già caricate.
2. Usa i filtri in alto. Quelli meno usati sono in **Filtri avanzati**. I filtri attivi compaiono come etichette che puoi togliere con un clic.
3. Scegli quante righe vedere per pagina (25, 50 o 100): la scelta viene ricordata.

Il filtro **Mostra** permette di vedere gli elementi **Attivi** oppure quelli **Eliminati**.

### Usare le segnalazioni

Sopra gli elenchi compaiono le **segnalazioni**: dati incompleti o incoerenti da sistemare (es. «Attive senza posizione», «Da volturare»). Un clic su una segnalazione filtra l'elenco sugli elementi interessati. Le segnalazioni si ricalcolano dopo ogni salvataggio. L'elenco completo è in «Segnalazioni per elenco».

### Aprire e modificare una scheda

1. Clicca una riga dell'elenco: si apre la scheda dell'elemento, divisa in schede (tab). Ad esempio un'utenza ha Riepilogo, Tecnici e stato, Immobili, Impianti, Contratti di fornitura, Consumi, Fatture, Note, Foto, Storico.
2. Modifica i campi e premi **Salva**. Se un campo non è valido, il tab che lo contiene è segnato con un pallino rosso.
3. Dai tab dei collegamenti (es. Immobili, Utenze) puoi collegare un elemento esistente o crearne uno nuovo al volo. **Scollega** chiede sempre conferma e il collegamento viene rimosso al salvataggio della scheda.
4. Il tab **Storico** mostra chi ha modificato cosa e quando.

### Eliminare e ripristinare un elemento

Eliminare un elemento non lo cancella davvero: sparisce dagli elenchi ma resta recuperabile.

1. Per eliminare usa **Elimina** dalla riga o dalla scheda e conferma.
2. Per recuperarlo imposta il filtro **Mostra** su **Eliminati**, trova l'elemento e premi **Riattiva**.

### Registrare una fattura

1. Apri **Fatture** e crea una nuova fattura.
2. Nel **Riepilogo** inserisci fornitore, contratto di fornitura, numero e data della fattura, numero di protocollo, totale documento IVA inclusa. Imponibile, morosità e note sono facoltativi.
3. Nel tab **Righe** premi **Aggiungi riga** per ogni utenza fatturata. Cerca l'utenza per POD/PDR o codice cliente, indica l'importo IVA inclusa e, se serve, consumo e descrizione.
4. Per ogni riga scegli l'**Impegno**: gli impegni disponibili sono quelli del contratto scelto. Se non ne scegli uno, vale il capitolo dell'utenza.
5. Premi **Salva**.

Se con la fattura il fatturato dell'anno supera l'assestato del capitolo, compare un avviso giallo (vedi «Il fatturato supera l'assestato del capitolo»). L'avviso non blocca il salvataggio.

### Controllare la spesa di un capitolo

1. Apri **Capitoli di spesa** e scegli il capitolo.
2. Nel tab **Esercizi** trovi, anno per anno, stanziamento iniziale, assestato e spesa della ragioneria. Impegnato, fatturato, disponibile ed eventuale sforamento sono calcolati.
3. I tab **Impegni**, **Fatture** e **Utenze** mostrano cosa pesa sul capitolo.

Le segnalazioni «Oltre l'assestato dell'anno» e «Senza assestato dell'anno» riguardano l'esercizio in corso.

### Gestire la voltura di un'utenza

Il campo **A carico di** dell'utenza indica chi paga: il Comune oppure il terzo a cui l'utenza è stata volturata.

1. Apri la scheda dell'utenza.
2. Se l'utenza risulta **Da volturare**, quando il terzo ha fatto la voltura premi **Segna volturata oggi**, oppure scegli il soggetto in **Volturata a** e la data.
3. Quando il Comune riprende l'utenza (es. contratto immobiliare finito), usa **Ripresa dal Comune**.

Il significato degli stati è in «A carico di: gli stati».

### Registrare i consumi di un'utenza

1. Apri la scheda dell'utenza, tab **Consumi**, e aggiungi una rilevazione.
2. Scegli il tipo:
    - **Lettura contatore**: data lettura, matricola contatore e valore letto;
    - **Consumo periodo**: date dal/al e consumo del periodo (es. da una fattura).
3. Premi **Salva**.

Una matricola diversa dalla precedente indica un nuovo contatore. Il grafico mostra i consumi del mese, distinguendo quelli reali da quelli stimati. Le utenze Internet non hanno consumi.

### Consultare la mappa

**Mappa** mostra immobili, utenze e impianti con livelli separati.

- Tipologia e funzione dell'immobile filtrano anche utenze e impianti; lo stato filtra solo gli immobili.
- Di default immobili dismessi e utenze cessate sono nascosti.
- La ricerca indirizzo cerca prima nel territorio del Comune, poi altrove.
- Il livello **Complessi** raggruppa gli immobili di un complesso in un solo pin (vedi «Gestire i complessi»).

Un'utenza compare sulla mappa con le sue coordinate. Se non le ha, usa la posizione dell'immobile collegato, poi quella dell'impianto collegato.

### Gestire i complessi

Un **complesso** raggruppa immobili gestiti o censiti come un insieme: una palazzina di alloggi, un plesso scolastico, un impianto sportivo con più edifici. Il tipo segue i tipi di compendio del censimento MEF.

1. Apri **Complessi** dal menu e premi **Nuovo complesso**, oppure scegli **Nuovo complesso** dal campo **Complesso** nella scheda di un immobile.
2. Nel tab **Immobili** collega gli immobili del complesso. Un immobile sta in un solo complesso: collegarlo qui lo toglie da quello precedente.
3. I tab **Utenze**, **Impianti** e **Contratti immobiliari** mostrano quelli degli immobili del complesso, in sola lettura: si modificano dalle loro schede.
4. Un complesso con immobili collegati non si può eliminare: scollega prima gli immobili.
5. **Raggruppamento**: *Fisico* per edifici vicini gestiti insieme (palazzina, impianto sportivo); *Amministrativo* per edifici distanti raggruppati, come un istituto comprensivo con i suoi plessi.

In **Mappa** il livello **Complessi** mostra un solo pin per ogni complesso fisico; i complessi amministrativi non hanno un pin e i loro edifici si vedono singolarmente. Il pin del complesso porta il numero dei suoi immobili: clic sul pin = scheda del complesso, clic sul numero = elenco degli immobili. Gli immobili nello stesso punto del complesso stanno nel suo pin; quelli più lontani hanno un proprio pin, collegato al complesso da una linea tratteggiata viola che si evidenzia passando con il mouse.

### Catasto e dati di patrimonio

Il tab **Catasto e patrimonio** della scheda immobile raccoglie i dati catastali e quelli chiesti dal censimento MEF «Patrimonio della PA».

1. **Unità catastali**: un immobile può avere più unità (piani, subalterni). Premi **Aggiungi unità** e compila almeno **Foglio** e **Particella**; sezione, subalterno, categoria e rendita sono facoltativi. Il cestino rimuove un'unità dopo la conferma. Le modifiche valgono al **Salva**.
2. **Consistenza**: superficie, superficie di riferimento, aree pertinenziali, cubatura ed epoca di costruzione.
3. **Patrimonio**: natura giuridica, vincolo culturale o paesaggistico, federalismo demaniale e bene confiscato (Sì, No o Non noto).
4. **Per il MEF** (si apre con un clic) mostra i dati calcolati dall'applicazione, aggiornati a ogni salvataggio:
   - **Id bene MEF**: lo assegna il MEF, arriva con l'import e non si modifica.
   - **Utilizzo**: «Dato a terzi» se è in corso (o in scadenza) un contratto immobiliare attivo, cioè con cui il Comune concede l'immobile a terzi, «Inutilizzabile» se l'immobile è dismesso, altrimenti «Utilizzato direttamente».
   - **Stato di accatastamento**: «Accatastato» con almeno un'unità catastale.
   - **Tipologia** e **Finalità**: vengono dalla funzione dell'immobile. Si impostano in **Funzioni immobile** (campi **Tipologia MEF** e **Finalità MEF**), anche con **apri la funzione** dal riquadro; la finalità vale solo per gli immobili utilizzati direttamente.

Nell'elenco immobili puoi cercare per foglio e particella (valore esatto), natura giuridica e utilizzo, e aggiungere le colonne **Catasto**, **Natura giuridica**, **Utilizzo** e **Id MEF**.

### Fare un backup (solo amministratori)

Da **Impostazioni → Backup e manutenzione** puoi creare un backup, scaricarlo, eliminarlo o ripristinarlo. Il ripristino non tocca utenti e branding. <!-- DA VERIFICARE: cosa contiene il backup (foto incluse?) e se va fatto prima di operazioni particolari -->

## Regole e riferimenti

### Ruoli

| Ruolo | Cosa può fare |
| --- | --- |
| Lettore | Consulta tutto, non modifica nulla. È il ruolo di chi entra la prima volta con l'account di dominio. |
| Operatore | Crea, modifica ed elimina immobili, utenze, impianti, contratti, fatture e capitoli. |
| Admin | Come l'Operatore, più utenti e ruoli, log attività completo, backup, branding e rigeocodifica degli immobili. |

I ruoli si assegnano da **Impostazioni → Utenti e ruoli**.

### A carico di: gli stati

| Stato | Significato |
| --- | --- |
| Comune | L'utenza non è volturata e nessun contratto immobiliare in corso ne prevede la voltura. |
| Da volturare | Un contratto immobiliare in corso prevede «Utenze da volturare», ma il terzo non ha ancora volturato: intanto paga il Comune. |
| Volturata | L'utenza è volturata a una parte di un contratto immobiliare in corso. |
| Da riprendere | L'utenza è volturata a qualcuno che non ha più un contratto in corso: il Comune deve riprenderla. |

**Manutenzione a carico di** è calcolata allo stesso modo: Fornitore se il contratto di fornitura include la manutenzione, Controparte se lo prevede il contratto immobiliare, altrimenti Comune.

### Contratti di fornitura

| Tipo | Regola |
| --- | --- |
| Ordinario | CIG obbligatorio. |
| Escluso da CIG | Senza CIG. |
| A titolo gratuito | Nessun costo: le utenze collegate non hanno bisogno di un capitolo di spesa. |

Un CIG può essere usato da un solo contratto. Il numero d'ordine CONSIP è unico.

### Segnalazioni per elenco

| Elenco | Segnalazioni |
| --- | --- |
| Utenze | Attive senza contratto di fornitura valido · Attive coperte solo da contratti senza CIG · Con contratti di fornitura sovrapposti · Attive senza tipologia ARERA · Da volturare · Volturate da riprendere · Capitolo non impegnato sul contratto di fornitura · Senza capitolo di spesa · Attive senza posizione |
| Immobili | Da classificare (tipologia o funzione mancanti) · Non di proprietà senza contratto passivo attivo · Di proprietà senza catasto · Fabbricati di proprietà senza Id MEF · Subalterno da assegnare (stessi via, civico, foglio e particella) |
| Impianti | Senza posizione · Senza immobile |
| Fatture | Su utenze cessate · Con righe senza utenza |
| Contratti di fornitura | Senza CIG (non esclusi) · CIG duplicati |
| Contratti immobiliari | Senza immobile · Senza parti |
| Capitoli di spesa | Oltre l'assestato dell'anno · Senza assestato dell'anno |
| Soggetti terzi | Senza P.IVA o codice fiscale |

In dashboard compare anche **Funzioni immobile senza tipologia MEF**: funzioni usate da immobili di proprietà a cui manca la tipologia del censimento MEF.

## Problemi frequenti

### Non posso modificare nulla

**Causa:** il tuo utente ha il ruolo Lettore, che consente solo la consultazione. È il ruolo assegnato in automatico al primo accesso con l'account di dominio.

**Soluzione:** chiedi a un amministratore di assegnarti il ruolo Operatore da **Impostazioni → Utenti e ruoli**. Poi esci e rientra.

**Apri un ticket se:** risulti Operatore ma non riesci comunque a modificare.

### Non riesco ad accedere

**Causa:** nome utente o password errati, password del PC scaduta, oppure account disattivato.

**Soluzione:**

1. Con l'account di dominio usa il nome utente del PC (es. `nome.cognome`), non l'email.
2. Se la password del PC è scaduta, cambiala e riprova.
3. Per un account locale usa **Password dimenticata?**.

**Apri un ticket se:** le credenziali funzionano sul PC ma non qui.

### L'applicazione mi ha riportato al login

**Causa:** dopo 30 minuti di inattività l'applicazione esce da sola, per sicurezza.

**Soluzione:** accedi di nuovo. I dati già salvati restano; quelli in una scheda non salvata vanno reinseriti.

**Apri un ticket se:** vieni riportato al login mentre stai lavorando.

### «CIG … già usato dal contratto …»

**Causa:** lo stesso CIG è già su un altro contratto di fornitura (indicato nel messaggio con il suo numero).

**Soluzione:** apri il contratto indicato e verifica quale dei due è corretto. Se è un doppione, elimina quello sbagliato. Se il contratto non è soggetto a CIG, imposta il tipo **Escluso da CIG**.

**Apri un ticket se:** i due contratti devono davvero avere lo stesso CIG.

### P.IVA o codice fiscale di un soggetto già usati

**Causa:** P.IVA e codice fiscale sono unici, anche tra i soggetti eliminati. Se il soggetto era stato eliminato, il codice risulta ancora occupato. Per i soggetti giuridici la P.IVA è obbligatoria («Partita IVA obbligatoria per i soggetti giuridici.»).

**Soluzione:** in **Soggetti terzi** imposta **Mostra → Eliminati**, cerca il soggetto e premi **Riattiva** invece di crearne uno nuovo.

**Apri un ticket se:** il soggetto non compare né tra gli attivi né tra gli eliminati.

### «Combinazione tipologia/funzione non ammessa.»

**Causa:** la funzione scelta non è prevista per quella tipologia di immobile. Se compare «Selezionare la tipologia prima della funzione.», manca la tipologia.

**Soluzione:** scegli prima la tipologia, poi una delle funzioni proposte. Se la combinazione serve davvero, un amministratore può aggiungerla da **Impostazioni → Tipologie immobili** o **Funzioni immobili**.

**Apri un ticket se:** la combinazione è configurata ma viene rifiutata.

### «Tipologia ARERA non valida per il tipo di utenza.»

**Causa:** la tipologia ARERA scelta non appartiene al tipo di utenza (es. una tipologia del gas su un'utenza elettrica).

**Soluzione:** controlla il tipo di utenza, poi scegli una tipologia ARERA tra quelle proposte per quel tipo.

**Apri un ticket se:** la tipologia corretta non compare tra quelle proposte.

### «La data di cessazione non può precedere quella di attivazione.»

**Causa:** le date dell'utenza sono invertite.

**Soluzione:** correggi la data di attivazione o di cessazione nel tab **Tecnici e stato**.

**Apri un ticket se:** le date sono corrette ma il messaggio resta.

### Il fatturato supera l'assestato del capitolo

**Causa:** con la fattura in corso il fatturato dell'anno sul capitolo supera l'assestato. L'avviso è del tipo «Capitolo …: con questa fattura il fatturato … supera l'assestato».

**Soluzione:** è un avviso, non un errore: la fattura si salva comunque. Verifica con la ragioneria l'assestato del capitolo e aggiornalo nel tab **Esercizi**, oppure controlla che la riga sia sull'impegno giusto.

**Apri un ticket se:** l'assestato è aggiornato ma l'avviso indica cifre diverse.

### Non riesco a eliminare un impegno

**Causa:** l'impegno è usato da una o più righe di fattura («Impegno usato da … righe fattura»). Inoltre per ogni contratto, capitolo ed esercizio può esistere un solo impegno («Impegno già presente per questo capitolo ed esercizio»).

**Soluzione:** sposta prima le righe di fattura su un altro impegno, poi elimina quello vecchio. Per un capitolo ed esercizio già impegnati modifica l'impegno esistente invece di crearne un altro.

**Apri un ticket se:** l'impegno non è usato da nessuna fattura ma non si elimina.

### Un'utenza o un impianto risulta «senza posizione»

**Causa:** l'elemento non ha coordinate proprie, né un immobile o un impianto collegato con una posizione.

**Soluzione:** collega l'utenza o l'impianto al suo immobile, oppure inserisci le coordinate nella scheda. La segnalazione sparisce dopo il salvataggio.

**Apri un ticket se:** l'immobile collegato ha l'indirizzo ma non viene posizionato sulla mappa.

### «Massimo 10 foto per elemento.»

**Causa:** ogni elemento può avere al massimo 10 foto.

**Soluzione:** elimina dal tab **Foto** quelle non più utili, poi carica le nuove.

**Apri un ticket se:** ti servono stabilmente più di 10 foto per un elemento.

## Contatti

Per problemi non risolti con questa guida apri un ticket dalla plancia dei dipendenti (CruscottoPA), scegliendo UtenzePA. Indica l'elemento interessato (es. codice utenza o numero fattura) e il messaggio esatto.
