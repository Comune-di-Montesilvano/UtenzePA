# UtenzePA – Guida per gli operatori

_Ultimo aggiornamento: 2026-10-19_

## Cos'è e chi lo usa

UtenzePA è il gestionale del patrimonio e delle utenze del Comune: immobili, utenze (luce, gas, acqua, telefonia, internet…), impianti, contratti immobiliari e di fornitura, fatture e capitoli di spesa. Lo usano gli uffici che gestiscono il patrimonio, le forniture e la spesa per le utenze, e chi ha bisogno di consultarne i dati.

Ogni elemento ha una scheda con i suoi collegamenti: da un immobile si arriva alle sue utenze, da un'utenza ai contratti e alle fatture, da un capitolo alla spesa dell'anno.

## Accesso

- **Indirizzo**: il link è nella plancia dei dipendenti.
- **Credenziali**: con l'account di dominio inserisci il nome utente del PC (es. `nome.cognome`) e la sua password. Gli account locali entrano con l'email.
- **Primo accesso con l'account di dominio**: l'utente viene creato in automatico in sola consultazione (ruolo Lettore). Per modificare i dati chiedi a un amministratore di cambiarti il ruolo.
- **Password dimenticata?**: vale solo per gli account locali. Ricevi un codice OTP via email e scegli una nuova password. Per l'account di dominio la password è quella del PC.
- **Inattività**: dopo 30 minuti senza attività l'applicazione esce da sola, chiude le schede aperte e torna al login.

## Operazioni frequenti

### Trovare un elemento negli elenchi

Ogni voce del menu (Immobili, Utenze, Impianti, Fatture…) apre un elenco.

1. Scrivi nella ricerca libera per filtrare le righe già caricate.
2. Usa i filtri in alto. Quelli meno usati sono in **Filtri avanzati**. I filtri attivi compaiono come etichette che puoi togliere con un clic.
3. Scegli quante righe vedere per pagina (25, 50 o 100): la scelta viene ricordata.

Il filtro **Mostra** permette di vedere gli elementi **Attivi** oppure quelli **Eliminati**.

### Usare le segnalazioni

Sopra gli elenchi compaiono le **segnalazioni**: dati incompleti o incoerenti da sistemare (es. «Attive senza posizione», «Da decidere»). Un clic su una segnalazione filtra l'elenco sugli elementi interessati. Le segnalazioni si ricalcolano dopo ogni salvataggio. L'elenco completo è in «Segnalazioni per elenco».

### Aprire e modificare una scheda

1. Clicca una riga dell'elenco: si apre la scheda dell'elemento, divisa in schede (tab) elencate nella colonna a sinistra; quella aperta è evidenziata con il colore dell'elemento. Ad esempio un'utenza ha Riepilogo, Tecnici e stato, Immobili, Impianti, Contratti di fornitura, Consumi, Fatture, Note, Foto, Attivazioni e volture, Storico. Sul telefono i tab stanno in alto, su più righe. Il numero accanto a un tab conta gli elementi collegati; un pallino segnala che il tab ha dati (es. note compilate).
2. Modifica i campi e premi **Salva**. Se un campo non è valido, il tab che lo contiene è segnato con un pallino rosso.
3. Dai tab dei collegamenti (es. Immobili, Utenze) puoi collegare un elemento esistente o crearne uno nuovo al volo. **Scollega** chiede sempre conferma e il collegamento viene rimosso al salvataggio della scheda.
4. Il tab **Storico** mostra chi ha modificato cosa e quando.

### Eliminare e ripristinare un elemento

Eliminare un elemento non lo cancella davvero: sparisce dagli elenchi ma resta recuperabile.

1. Per eliminare usa **Elimina** dalla riga o dalla scheda e conferma.
2. Per recuperarlo imposta il filtro **Mostra** su **Eliminati**, trova l'elemento e premi **Riattiva**.

### Registrare una fattura

1. Apri **Fatture** (l'elenco parte dalle fatture più recenti) e crea una nuova fattura.
2. Nel **Riepilogo** inserisci fornitore, contratto di fornitura, numero e data della fattura, numero di protocollo, totale documento IVA inclusa. Imponibile, morosità e note sono facoltativi. Per una **nota di credito** inserisci il totale, l'imponibile e gli importi delle righe con il segno meno: la fattura è segnata «Nota di credito» e riduce la spesa. L'imponibile può essere negativo solo se lo è anche il totale.
3. Nel tab **Righe** premi **Aggiungi riga** per ogni utenza fatturata. Cerca l'utenza per POD/PDR o codice cliente, indica l'importo IVA inclusa e, se serve, consumo e descrizione. Con il pulsante accanto all'utenza ne apri la scheda; nella scheda dell'utenza il tab **Fatture** mostra quante fatture ha. Il consumo della riga resta sulla fattura: lo storico consumi dell'utenza si registra nel suo tab **Consumi**.
4. Per ogni riga scegli l'**Impegno**: gli impegni disponibili sono quelli del contratto scelto. Se non ne scegli uno, vale il capitolo dell'utenza.
5. Premi **Salva**.

Se con la fattura il fatturato dell'anno supera l'assestato del capitolo, compare un avviso giallo (vedi «Il fatturato supera l'assestato del capitolo»). L'avviso non blocca il salvataggio.

### Controllare la spesa di un capitolo

1. Apri **Capitoli di spesa** e scegli il capitolo.
2. Nel tab **Esercizi** trovi, anno per anno, stanziamento iniziale, assestato e spesa della ragioneria. Impegnato, fatturato, disponibile ed eventuale sforamento sono calcolati.
3. I tab **Impegni**, **Fatture** e **Utenze** mostrano cosa pesa sul capitolo.

Le segnalazioni «Oltre l'assestato dell'anno» e «Senza assestato dell'anno» riguardano l'esercizio in corso.

### Attivazioni, cessazioni e volture di un'utenza

Ogni utenza ha uno **storico dei cambiamenti**: attivazioni, cessazioni, volture a un terzo e reintestazioni al Comune. Da questo storico l'applicazione ricava se l'utenza è attiva e **a carico di** chi (il Comune o il terzo a cui è stata volturata). Non si modificano più a mano lo stato di attività o la voltura: si registra il cambiamento.

1. Apri la scheda dell'utenza e il tab **Attivazioni e volture**. Ogni riga ha Tipo (Attivazione, Cessazione, Voltura, Reintestazione al Comune), Intestatario, data **Richiesta** e data **Effettiva**. Se il cambiamento è avvenuto ma non si conosce il giorno, la data effettiva mostra «data non nota».
2. Quando chiedi un cambiamento (al fornitore o alla controparte) premi **Nuovo cambiamento**, scegli il tipo, la **Data richiesta** e, per la voltura, l'**Intestatario** tra i soggetti terzi. Lascia vuota la **Data effettiva**: la riga resta **in sospeso** e compare evidenziata.
3. Quando il cambiamento avviene davvero (lo verifichi sulla bolletta) apri la riga con la matita, inserisci la **Data effettiva** e salva.
4. Per registrare un cambiamento già avvenuto compila subito la data effettiva. Se è avvenuto ma non conosci il giorno, spunta **Avvenuta, data non nota** (vale per tutti i tipi, anche voltura e reintestazione, con i limiti spiegati sotto).
5. Lo storico si può inserire a mano anche per volture avvenute e mai registrate, anche in passato: l'utenza risulta così intestata al terzo dalla data giusta, oppure da prima di tutte le altre date se usi «data non nota» (solo se non ci sono già volture o reintestazioni con data effettiva).

Una riga con «data non nota» vale come avvenuta **prima di tutte le altre**. Per questo un'attivazione o una cessazione con «data non nota» si può registrare solo se l'utenza non ha ancora nessuna data effettiva nello storico, e una voltura o una reintestazione con «data non nota» solo se non ci sono già volture o reintestazioni con data effettiva: altrimenti cambierebbe lo stato di periodi già noti (per esempio una reintestazione senza data dopo una voltura datata non riporterebbe l'utenza al Comune). In quel caso indica una data effettiva, anche stimata (per esempio la fine dell'ultimo periodo fatturato), e scrivi nelle note che è stimata.

Altre azioni sulle righe:

- **Annulla** (solo sulle righe in sospeso inserite a mano): la riga resta nello storico come annullata.
- **Elimina**: la riga sparisce dallo storico (usalo per correggere un inserimento sbagliato).
- Le righe create dai contratti immobiliari riportano il contratto e la scritta **Gestita dal contratto**: non si annullano né si eliminano dal tab, si cambiano dalla decisione sul contratto (vedi sotto). Puoi invece correggerne la data effettiva.

Sopra la tabella possono comparire **avvisi** (per esempio due cessazioni di fila: probabilmente manca un'attivazione). Il numero accanto al nome del tab indica i cambiamenti in sospeso.

Nel **Riepilogo** dell'utenza, la sezione **A carico di** mostra lo stato (vedi «A carico di: gli stati»), se l'utenza è attiva o cessata, l'intestatario («Intestata al Comune» oppure «Intestata a … dal …») e, se c'è una pratica aperta, un avviso come «Voltura in sospeso da 12 giorni». Un'utenza volturata a un terzo mostra invece «Volturata a … dal …»: per il Comune non è né attiva né cessata (vedi «A carico di: gli stati»).

Quando crei una nuova utenza, nella sezione **Fornitura** scegli **Già attiva**: con **Sì** indica da quando è attiva (**Attiva dal**, facoltativa: vuota significa data non nota); con **No, da attivare** indica quando l'hai richiesta (**Richiesta il**) e l'attivazione resta in sospeso fino alla data effettiva.

#### Volture decise dal contratto immobiliare

Per gli immobili concessi a terzi, la voltura delle utenze si decide nel contratto immobiliare, tab **Utenze**, colonna **Voltura**. La scelta è separata per ogni utenza (è frequente volturare la luce e non l'acqua) e si fa solo su un contratto **in corso**:

- **Da decidere**: nessuna scelta ancora; l'utenza compare nella segnalazione «Da decidere».
- **Segue il contratto → parte**: l'utenza va volturata alla controparte (se il contratto ha più parti scegli quale). Si apre una voltura in sospeso nello storico dell'utenza.
- **Resta al Comune**: l'utenza resta intestata al Comune.

Se il contratto ha la spunta **Proponi la voltura delle utenze**, compare il pulsante **Conferma la proposta per tutte** (solo per contratti con una sola parte), che fa seguire il contratto a tutte le utenze ancora da decidere. Un'icona di avviso segnala una decisione **scavalcata** da un contratto più recente con un'altra controparte.

Se il contratto finisce e l'utenza è volturata alla sua controparte, l'utenza diventa **Da reintestare** (si apre una reintestazione al Comune in sospeso), salvo che parta un nuovo contratto con la stessa controparte: in quel caso la decisione e l'intestazione restano. Le utenze di un contratto che parte senza decisione risultano **Da decidere**.

Il significato degli stati è in «A carico di: gli stati».

### Registrare i consumi di un'utenza

1. Apri la scheda dell'utenza, tab **Consumi**, e aggiungi una rilevazione.
2. Scegli il tipo:
    - **Lettura contatore**: data lettura, matricola contatore e valore letto;
    - **Consumo periodo**: date dal/al e consumo del periodo (es. da una fattura).
3. Premi **Salva**.

Sull'etichetta del tab **Consumi** compare il consumo effettivo degli ultimi 12 mesi in forma compatta (es. «1,2 MWh» per la luce, «1,2k Smc» per il gas). Una matricola diversa dalla precedente indica un nuovo contatore. Il **consumo effettivo ultimi 12 mesi** copre i 12 mesi che finiscono con l'ultimo dato registrato (se è dell'ultimo anno): i giorni dopo, come la bolletta non ancora arrivata, non lo rendono parziale. Il riquadro **Periodi senza dati** elenca i buchi tra il primo e l'ultimo dato (bollette o letture mancanti): aggiungi le rilevazioni di quei periodi. Il grafico parte dal primo mese con dati (al massimo 24 mesi indietro) e mostra i consumi del mese, distinguendo quelli reali da quelli stimati; i giorni dopo l'ultimo dato sono stimati, i buchi tra due dati restano vuoti. Se l'utenza ha dati per fascia, ogni barra è divisa in colori per fascia (F1, F2, F3, F0) più un grigio per la parte senza fasce; la stima è ripartita secondo le quote dell'ultimo anno. Le utenze Internet non hanno consumi.

Per le utenze elettriche il consumo di periodo può avere anche:

- le **fasce** F0 (monoraria), F1, F2, F3: facoltative; se le compili, la loro somma deve coincidere col consumo del periodo (scarto massimo 1 kWh);
- sulla **lettura contatore**, i **totalizzatori** F1, F2, F3 letti sul contatore: facoltativi; la loro somma deve coincidere col valore letto e ognuno non può scendere rispetto alla lettura precedente dello stesso contatore. Il consumo di ogni fascia è la differenza tra due letture;
- la casella **Penale per energia reattiva**, se la bolletta addebita una penale per basso fattore di potenza. Le utenze con una penale negli ultimi 12 mesi compaiono nella segnalazione «Penali per energia reattiva»: l'impianto va rifasato.

Nella scheda delle utenze elettriche, tab **Tecnici e stato**, c'è anche il **Codice impianto fornitore**: il codice con cui il fornitore di energia identifica la fornitura, stabile tra i rinnovi del contratto.

### Consultare la mappa

**Mappa** mostra immobili, utenze e impianti con livelli separati.

- Tipologia e funzione dell'immobile filtrano anche utenze e impianti; lo stato filtra solo gli immobili.
- Di default immobili dismessi, utenze cessate e utenze volturate sono nascosti: **Includi utenze cessate e volturate** li mostra. Le utenze volturate a un terzo hanno il segnaposto grigio.
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

### Registrare i presidi di un impianto antincendio

Nella scheda di un impianto antincendio il tab **Presidi** elenca estintori, idranti, naspi, attacchi VVF, i dispositivi di rivelazione e allarme (rivelatori di fumo, pulsanti di allarme, centrali di rivelazione, segnalatori ottico-acustici, sirene) e quelli delle vie di esodo (porte tagliafuoco REI, maniglioni antipanico, segnaletica luminosa di uscita, lampade di emergenza). Nel campo **Capacità** si indica la classe o la variante: «REI 120», «2 ante», «18 W».

1. Premi **Aggiungi presidio** e scegli il tipo.
2. **Quantità**: per rivelatori, pulsanti e simili basta una riga con il numero di pezzi; gli estintori si registrano uno per riga, con la matricola (quantità fissa a 1).
3. Per gli estintori indica in formato `mm/aaaa`, come sul cartellino, **Ultimo controllo** (semestrale), **Scadenza revisione** e **Scadenza collaudo**. Una scadenza vale fino all'ultimo giorno del mese; il controllo scade sei mesi dopo l'ultimo.
4. Lo stato mostra la scadenza messa peggio: **Scaduta**, **Entro 60 giorni**, **In regola**, **Senza data**; passa il mouse sullo stato per vedere quale scadenza lo determina. Le date importate dai censimenti riportano solo l'anno (nota «date importate: solo anno»). Se un estintore è scaduto o in scadenza, l'intestazione della scheda mostra **Presidi scaduti** o **Presidi in scadenza**.

### Dati tecnici di un ascensore

Nella scheda di un ascensore il tab **Dati tecnici** riporta i dati dell'anagrafe comunale ascensori: matricola, numero impianto, costruttore, anno e data di collaudo, tipologia, azionamento, portata, fermate, velocità, **capienza** (persone), **accessi**, **corsa** (metri), **norma tecnica** e presenza della **SIM di emergenza** del combinatore telefonico. Le verifiche periodiche si registrano nel tab **Verifiche**.

### Impianto elettrico di un edificio

L'impianto elettrico interno di un edificio (scuola, ufficio, palestra…) è un impianto di tipo **Impianto elettrico**, collegato all'immobile e all'utenza (POD) che lo alimenta. Il tab **Dati tecnici** riporta i dati richiesti dalla normativa:

- **Alimentazione**: bassa tensione, o media tensione con cabina propria.
- **Classificazione per il DPR 462/01**: stabilisce ogni quanto va verificato l'impianto di terra. **Ordinario**: ogni 5 anni. **Maggior rischio** (scuole, luoghi a maggior rischio di incendio, locali medici): ogni 2 anni. **Pericolo di esplosione**: ogni 2 anni. Per un nuovo impianto collegato a una scuola il campo parte da «maggior rischio»; si può cambiare.
- **Protezione dalle scariche atmosferiche**: presente, assente o non nota.
- **Conformità (DM 37/08)**: dichiarazione di conformità dell'installatore (DiCo) o, per gli impianti precedenti al 2008, di rispondenza (DiRi), con data e numero.
- **Denuncia INAIL**: data di invio e numero pratica della messa in esercizio.

Le verifiche **Messa a terra (DPR 462/01)** e, se la protezione dalle scariche atmosferiche è presente, **Scariche atmosferiche (DPR 462/01)** sono obbligatorie (vedi [Verifiche obbligatorie per legge](#verifiche-obbligatorie-per-legge)): si registrano nel tab **Verifiche** con la data del verbale. Se cambi la classificazione cambia la periodicità di quelle registrate e, se c'è la data dell'ultima verifica, si ricalcola la prossima scadenza; data ed esito restano. Gli altri salvataggi della scheda non toccano le verifiche: una periodicità modificata a mano resta com'è finché non cambi classificazione o protezione.

DiCo o DiRi, verbali di verifica, progetto e denuncia INAIL vanno nel tab **Documenti e foto** (vedi sotto); il verbale di una verifica si allega con la graffetta sulla sua riga.

### Verifiche obbligatorie per legge

Alcuni impianti hanno verifiche periodiche imposte dalla legge:

| Impianto | Verifica | Norma | Quando |
|---|---|---|---|
| Ascensore | Verifica periodica (ente notificato), ogni 2 anni | DPR 162/99 | sempre |
| Impianto elettrico | Messa a terra (DPR 462/01), ogni 2 o 5 anni secondo la classificazione | DPR 462/01 | sempre |
| Impianto elettrico | Scariche atmosferiche (DPR 462/01) | DPR 462/01 | se la protezione è presente |
| Termico | Controllo di efficienza energetica, ogni 2 anni oltre 100 kW, altrimenti 4 | DPR 74/2013 | da 10 kW di potenza |

Un impianto attivo a cui manca una di queste verifiche, registrata con lo stesso nome e almeno una data (ultima o prossima), compare nella segnalazione **Verifiche obbligatorie mancanti** dell'elenco impianti; la sua scheda mostra l'avviso in intestazione e il tab **Verifiche** elenca quelle mancanti con il pulsante **Registra**, che apre la verifica già compilata con nome e periodicità: aggiungi la data dell'ultimo verbale. Le verifiche non si creano da sole e non si registrano senza data: una verifica senza data non fa scattare nessuna scadenza.

### Allegare un file a un immobile, impianto o contratto

Nelle schede di **immobili**, **impianti**, **contratti immobiliari** e **contratti di fornitura** il tab **Documenti** raccoglie gli allegati e gli atti collegati. In immobili e impianti si chiama **Documenti e foto** e contiene anche le foto, in fondo.

1. Apri il tab **Documenti** e, nella sezione **Allegati**, trascina i file nel riquadro oppure premi **scegli**. Non serve compilare nulla: la descrizione (es. «Contratto firmato», «Planimetria piano terra») è facoltativa e si scrive direttamente nella riga.
2. Sono ammessi PDF, PDF firmati (.p7m), documenti e fogli di calcolo (Word, Excel, OpenDocument, CSV, testo), immagini (JPG, PNG, TIFF), disegni AutoCAD (.dwg) ed email (.eml, .msg). La dimensione massima per file è indicata nel riquadro (di norma 50 MB).
3. Il verbale di una verifica di un impianto si allega alla verifica: nel tab **Verifiche** premi la graffetta sulla riga della verifica. Gli allegati delle verifiche compaiono anche nel tab **Documenti e foto** dell'impianto, con l'indicazione «verifica: …».
4. **Apri** mostra PDF e immagini JPG e PNG in una nuova scheda del browser (gli altri file, TIFF compresi, si scaricano), **Scarica** salva il file. Un allegato eliminato non si vede più.

### Registrare un atto

Un **atto** è un atto ufficiale (delibera di Giunta o di Consiglio, determina, decreto, ordinanza, atto notarile, autorizzazione) di cui si registrano gli estremi: tipo, numero, data, oggetto, chi lo ha emesso, protocollo. Si registra anche senza il testo, ad esempio quando si hanno solo gli estremi o il file è troppo pesante.

1. Apri **Atti** dal menu e premi **Nuovo atto**, oppure nel tab **Documenti** di una scheda premi **Nuovo atto** nella sezione **Atti collegati**: l'atto nasce già collegato a quella scheda.
2. Compila tipo e oggetto (obbligatori) e gli altri estremi che conosci, poi **Salva**.
3. Se hai il testo, caricalo nel tab **Allegati** dell'atto.
4. Un atto può riguardare più immobili, impianti o contratti (es. una delibera che acquisisce più immobili): si registra una volta sola e si collega dalle altre schede con **Collega atto**, oppure dal tab **Collegamenti** dell'atto.

I tipi di atto si modificano da **Impostazioni → Tipi di atto** (solo amministratori).

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

Da **Impostazioni → Backup e manutenzione** puoi creare un backup, scaricarlo, eliminarlo o ripristinarlo. Ogni notte l'applicazione crea da sola un backup dei soli dati. Con **Includi foto** e **Includi gli allegati** il backup contiene anche i file: può diventare di molti GB.

Nel tab **Consumi** della stessa pagina, **Ricalcola consumi** aggiorna subito per tutte le utenze il consumo effettivo degli ultimi 12 mesi, i giorni coperti e la stima annua. Lo stesso ricalcolo avviene ogni notte: serve dopo un'importazione di dati, per non aspettare.

- La creazione avviene in background: puoi continuare a lavorare, l'elenco si aggiorna da solo quando il backup è pronto.
- **Scarica** avvia il download direttamente nel browser, anche per file molto grandi.
- Il **ripristino** carica il file (una barra mostra l'avanzamento: non chiudere la pagina), poi sostituisce i dati. Nella conferma puoi scegliere di non toccare utenti e branding attuali. Gli allegati già presenti non vengono sovrascritti.
- Durante il ripristino l'applicazione è bloccata per tutti: chi la usa vede la pagina «Ripristino dei dati in corso». Al termine bisogna accedere di nuovo; l'esito dell'ultimo ripristino resta scritto nella pagina Backup.

## Regole e riferimenti

### Ruoli

| Ruolo | Cosa può fare |
| --- | --- |
| Lettore | Consulta tutto, non modifica nulla. È il ruolo di chi entra la prima volta con l'account di dominio. |
| Operatore | Crea, modifica ed elimina immobili, utenze, impianti, contratti, fatture e capitoli. |
| Admin | Come l'Operatore, più utenti e ruoli, log attività completo, backup, branding, rigeocodifica degli immobili e ricalcolo dei consumi. |

I ruoli si assegnano da **Impostazioni → Utenti e ruoli**, pagina riservata agli Admin: Operatori e Lettori non vedono l'elenco degli utenti.

### A carico di: gli stati

| Stato | Significato |
| --- | --- |
| Comune | L'utenza è intestata al Comune e non c'è nessuna voltura da fare. |
| Da decidere | Un contratto immobiliare in corso non ha ancora una decisione per questa utenza: va scelto se segue il contratto o resta al Comune. |
| Da volturare | Il contratto prevede la voltura, ma il terzo non l'ha ancora fatta (voltura in sospeso): intanto paga il Comune. |
| Volturata | L'utenza è intestata a un soggetto terzo (con il contratto immobiliare o con una voltura registrata a mano) e non ci sono pratiche in sospeso. Per il Comune non è né attiva né cessata: non compare nelle segnalazioni sulle utenze attive, nella spesa dei capitoli e nel filtro «Fornitura attiva», e nelle schede risulta «Volturata». |
| Da reintestare | L'utenza è intestata a un terzo che non ha più un contratto in corso: il Comune deve riprenderla (reintestazione in sospeso). |

**Manutenzione a carico di** è calcolata allo stesso modo: Fornitore se il contratto di fornitura include la manutenzione, Controparte se lo prevede il contratto immobiliare, altrimenti Comune.

### Canone e IVA dei contratti immobiliari

Il **canone** si inserisce sempre **netto**, cioè senza IVA. Nel **Regime IVA** si sceglie:

| Regime IVA | Quando |
| --- | --- |
| Fuori campo IVA | Il locatore non è soggetto IVA (es. persona fisica): si paga solo l'imposta di registro. |
| Esente (art. 10 DPR 633/72) | Locazioni di abitazioni e, salvo opzione per l'IVA, di immobili strumentali. |
| IVA 10% | Abitazioni locate con opzione per l'IVA (es. alloggi sociali, imprese costruttrici). |
| IVA 22% | Immobili strumentali (uffici, negozi, capannoni) locati con opzione per l'IVA. |

Con IVA 10% o 22% sotto il canone compaiono l'importo annuo netto, l'IVA e il totale. **Da indicare** vuol dire che il regime non è ancora stato verificato. Nel dubbio sul regime chiedi alla ragioneria.

### Chi può scaricare gli allegati

Le schede, gli elenchi degli allegati e gli atti sono visibili a tutti. **Aprire e scaricare i file** è riservato ad amministratori e operatori, perché contratti e atti contengono spesso dati personali: chi ha il ruolo di sola lettura vede un lucchetto al posto dei pulsanti.

### Contratti di fornitura

| Tipo | Regola |
| --- | --- |
| Ordinario | CIG obbligatorio. |
| Escluso da CIG | Senza CIG. |
| A titolo gratuito | Nessun costo: le utenze collegate non hanno bisogno di un capitolo di spesa. |

Un CIG può essere usato da un solo contratto. Il numero d'ordine CONSIP è unico.

Nella scheda dell'utenza i contratti di fornitura compaiono con quelli **in corso** in alto, poi dal più recente al più vecchio.

**Rinnovo con le stesse utenze:** nella scheda di un contratto, **Nuovo contratto con queste utenze** apre un nuovo contratto con le stesse utenze collegate e con fornitore, tipologia, convenzione CONSIP e «Manutenzione inclusa» già compilati. CIG, ordine e date vanno inseriti. Con **Chiudi il contratto precedente** spuntata (scelta predefinita), il contratto precedente scade il giorno prima della decorrenza del nuovo (se la sua scadenza manca o non è anteriore), così non risultano contratti sovrapposti. Se la decorrenza del nuovo è già arrivata il precedente diventa subito chiuso; se è futura resta il contratto corrente fino ad allora. Prima di usare l'azione salva o annulla le modifiche alla scheda.

### Segnalazioni per elenco

| Elenco | Segnalazioni |
| --- | --- |
| Utenze | Attive senza contratto di fornitura valido · Attive coperte solo da contratti senza CIG · Con contratti di fornitura sovrapposti · Attive senza tipologia ARERA · Da volturare · Da reintestare · Da decidere · Attivazioni in sospeso · Cessazioni in sospeso · Capitolo non impegnato sul contratto di fornitura · Senza capitolo di spesa · Attive senza posizione · Penali per energia reattiva (penale in un periodo terminato negli ultimi 12 mesi) |
| Immobili | Da classificare (tipologia o funzione mancanti) · Non di proprietà senza contratto passivo attivo · Di proprietà senza catasto · Fabbricati di proprietà senza Id MEF · Subalterno da assegnare (stessi via, civico, foglio e particella) |
| Impianti | Senza posizione · Senza immobile · Presidi scaduti (almeno un estintore con una scadenza superata) · Verifiche obbligatorie mancanti (vedi [Verifiche obbligatorie per legge](#verifiche-obbligatorie-per-legge)) |
| Fatture | Fuori dai periodi di attività · Con righe senza utenza |
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

### «L'utenza ha già date note: indica una data effettiva, anche stimata, e scrivilo nelle note.»

**Causa:** stai registrando un'attivazione o una cessazione con «Avvenuta, data non nota» su un'utenza che ha già cambiamenti con una data effettiva. Una riga senza data vale come avvenuta prima di tutte le altre e cambierebbe lo stato dei periodi già noti.

**Soluzione:** togli la spunta e indica una data effettiva, anche stimata (per esempio la fine dell'ultimo periodo fatturato); scrivi nelle note che la data è stimata.

**Apri un ticket se:** l'utenza non ha cambiamenti con data effettiva ma il messaggio resta.

### «L'utenza ha già volture con date note: indica una data effettiva, anche stimata, e scrivilo nelle note.»

**Causa:** stai registrando una voltura o una reintestazione con «Avvenuta, data non nota» su un'utenza che ha già volture o reintestazioni con una data effettiva. Una riga senza data vale come avvenuta prima di tutte le altre: per esempio una reintestazione senza data dopo una voltura datata non riporterebbe l'utenza al Comune.

**Soluzione:** togli la spunta e indica una data effettiva, anche stimata; scrivi nelle note che la data è stimata.

**Apri un ticket se:** l'utenza non ha volture o reintestazioni con data effettiva ma il messaggio resta.

### «La somma delle fasce … non coincide con il consumo del periodo …»

**Causa:** nel consumo di periodo le fasce F0–F3 compilate non sommano al consumo indicato (scarto oltre 1 kWh).

**Soluzione:** ricopia le fasce dalla bolletta o correggi il consumo; se non conosci le fasce, lasciale tutte vuote.

**Apri un ticket se:** la somma torna ma il messaggio resta.

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

### «Tipo di file non ammesso» o «Il contenuto del file non corrisponde al tipo»

**Causa:** il file non è di un tipo ammesso (es. ZIP o programmi), oppure l'estensione non corrisponde al contenuto (es. un file rinominato in .pdf), oppure supera la dimensione massima indicata nel riquadro (di norma 50 MB), oppure è vuoto.

**Soluzione:** salva o esporta il documento in PDF dal programma che lo ha creato, senza rinominare l'estensione; se è troppo grande, scansionalo a risoluzione più bassa o dividilo in più file.

**Apri un ticket se:** un PDF originale, non modificato, viene rifiutato.

### «Massimo 10 foto per elemento.»

**Causa:** ogni elemento può avere al massimo 10 foto.

**Soluzione:** elimina dal tab **Foto** (in immobili e impianti: **Documenti e foto**) quelle non più utili, poi carica le nuove.

**Apri un ticket se:** ti servono stabilmente più di 10 foto per un elemento.

### Una fattura risulta fuori dai periodi di attività

**Causa:** il periodo della fattura cade oltre 30 giorni fuori dagli intervalli in cui l'utenza era attiva e intestata al Comune secondo lo storico (le spese di chiusura entro 30 giorni dalla cessazione o dalla voltura, o poco prima dell'attivazione o della reintestazione, non contano). Durante una voltura le bollette vanno al terzo: una fattura al Comune in quel periodo è segnalata. Di solito manca una attivazione, una cessazione, una voltura o una reintestazione, oppure una data è sbagliata.

**Soluzione:** apri l'utenza, tab **Attivazioni e volture**, e controlla le date di attivazione, cessazione, voltura e reintestazione; inserisci lo storico mancante (anche con «Avvenuta, data non nota» se non conosci il giorno). Le segnalazioni si ricalcolano dopo il salvataggio.

**Apri un ticket se:** le date dello storico sono giuste e la fattura è corretta ma resta segnalata.

## Contatti

Per problemi non risolti con questa guida apri un ticket dalla plancia dei dipendenti (CruscottoPA), scegliendo UtenzePA. Indica l'elemento interessato (es. codice utenza o numero fattura) e il messaggio esatto.
