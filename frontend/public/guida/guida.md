# UtenzePA – Guida per gli operatori

_Ultimo aggiornamento: 2026-10-20_

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

1. Clicca una riga dell'elenco: si apre la scheda dell'elemento, divisa in schede (tab) elencate nella colonna a sinistra; quella aperta è evidenziata con il colore dell'elemento. Ad esempio un'utenza ha Riepilogo, Fornitura, Dati tecnici, Immobili, Impianti, Contratti di fornitura, Consumi, Fatture, Note, Foto, Storico. Sul telefono i tab stanno in alto, su più righe. Il numero accanto a un tab conta gli elementi collegati; un pallino segnala che il tab ha dati (es. note compilate).
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

### Vedere stato SDI, XML e PDF di una fattura

Le fatture elettroniche arrivano dallo SDI sulla casella PEC del Comune. UtenzePA legge la casella ogni 15 minuti e collega da sola ogni fattura già inserita con lo stesso fornitore, numero e data (vedi [Importare le fatture dalla PEC](#importare-le-fatture-dalla-pec-solo-amministratori)).

- Nella scheda di una fattura collegata compare il badge dello stato SDI (vedi [Stati SDI delle fatture](#stati-sdi-delle-fatture)); nell'elenco c'è la colonna **Stato SDI** e il filtro omonimo, con la voce «Senza messaggio SDI» per le fatture non collegate.
- **Vedi XML** e **Vedi PDF** mostrano a video la fattura elettronica e il PDF allegato dal fornitore. I file non sono salvati in UtenzePA: vengono riletti al momento dalla PEC.

### Controllare la spesa di un capitolo

1. Apri **Capitoli di spesa** e scegli il capitolo.
2. Nel tab **Esercizi** trovi, anno per anno, stanziamento iniziale, assestato e spesa della ragioneria. Impegnato, fatturato, disponibile ed eventuale sforamento sono calcolati.
3. I tab **Impegni**, **Fatture** e **Utenze** mostrano cosa pesa sul capitolo.

Le segnalazioni «Oltre l'assestato dell'anno» e «Senza assestato dell'anno» riguardano l'esercizio in corso.

### Attivazioni, cessazioni e volture di un'utenza

Ogni utenza ha uno **storico dei cambiamenti**: attivazioni, cessazioni, volture a un terzo e reintestazioni al Comune. Da questo storico l'applicazione ricava se l'utenza è attiva e **a carico di** chi (il Comune o il terzo a cui è stata volturata). Non si modificano più a mano lo stato di attività o la voltura: si registra il cambiamento.

1. Apri la scheda dell'utenza e il tab **Fornitura** (il badge sull'etichetta mostra lo stato: Attiva, Cessata, Volturata, oppure in arancio Da decidere, Da volturare, Da reintestare, In attivazione, In cessazione, In sospeso). Ogni riga ha Tipo (Attivazione, Cessazione, Voltura, Reintestazione al Comune), Intestatario, data **Richiesta** e data **Effettiva**. Se il cambiamento è avvenuto ma non si conosce il giorno, la data effettiva mostra «data non nota».
2. Quando chiedi un cambiamento (al fornitore o alla controparte) premi **Nuovo cambiamento**, scegli il tipo, la **Data richiesta** e, per la voltura, l'**Intestatario** tra i soggetti terzi. Lascia vuota la **Data effettiva**: la riga resta **in sospeso** e compare evidenziata.
3. Quando il cambiamento avviene davvero (lo verifichi sulla bolletta) apri la riga con la matita, inserisci la **Data effettiva** e salva.
4. Per registrare un cambiamento già avvenuto compila subito la data effettiva. Se è avvenuto ma non conosci il giorno, spunta **Avvenuta, data non nota** (vale per tutti i tipi, anche voltura e reintestazione, con i limiti spiegati sotto).
5. Lo storico si può inserire a mano anche per volture avvenute e mai registrate, anche in passato: l'utenza risulta così intestata al terzo dalla data giusta, oppure da prima di tutte le altre date se usi «data non nota» (solo se non ci sono già volture o reintestazioni con data effettiva).

Una riga con «data non nota» vale come avvenuta **prima di tutte le altre**. Se ce n'è più di una sono numerate («non nota (1ª)», «non nota (2ª)»…) nell'ordine in cui contano, cioè quello di inserimento. Per questo un'attivazione o una cessazione con «data non nota» si può registrare solo se l'utenza non ha ancora nessuna data effettiva nello storico, e una voltura o una reintestazione con «data non nota» solo se non ci sono già volture o reintestazioni con data effettiva: altrimenti cambierebbe lo stato di periodi già noti (per esempio una reintestazione senza data dopo una voltura datata non riporterebbe l'utenza al Comune). In quel caso indica una data effettiva, anche stimata (per esempio la fine dell'ultimo periodo fatturato), e scrivi nelle note che è stimata.

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

**Letture e consumi stimati.** Se la bolletta riporta una lettura o un consumo «stimato» dal fornitore (non letto sul contatore), spunta **Stimata**: nella tabella compare il badge **Stimata**. Una stima conta nei consumi finché non arriva il dato reale; da quel momento le stime dei giorni coperti dal dato reale non contano più (il conguaglio riporta tutto al valore reale) e la riga resta in grigio con «Superata dal dato reale». Una lettura stimata risulta superata anche se è più bassa di una lettura reale precedente dello stesso contatore, o se è su un contatore già sostituito. Una lettura reale può essere più bassa di una stima precedente: è il caso tipico del conguaglio, e si salva. Un consumo di periodo stimato può sovrapporsi a uno reale (conta il reale), non a un altro stimato.

Nella scheda delle utenze elettriche, tab **Dati tecnici**, c'è anche il **Codice impianto fornitore**: il codice con cui il fornitore di energia identifica la fornitura, stabile tra i rinnovi del contratto.

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

### Importare le fatture dalla PEC (solo amministratori)

In **Impostazioni → Import fatture**, tab **Motore** (visibile solo agli amministratori):

- l'interruttore accende o spegne la lettura automatica della casella PEC (ogni 15 minuti, in sola lettura: nessun messaggio viene segnato, spostato o cancellato);
- **Esegui ora** avvia subito un giro in background, senza aspettare il prossimo quarto d'ora: puoi lasciare la pagina, e al termine compare un messaggio (il primo giro, che legge tutta la casella, può durare alcuni minuti);
- sotto trovi l'ultimo giro, l'ultimo giro riuscito, l'eventuale errore, quanti file sono stati letti per esito (importate con un pattern, collegate, in attesa, strutture ignorate, fuori perimetro, esiti e notifiche, errori) e gli ultimi 10 file in errore con il motivo.

Sono considerate solo le fatture dei fornitori in anagrafica con partita IVA e almeno un contratto di fornitura; le altre restano «fuori perimetro». Per leggere i dati di una fattura (utenze, importi, periodi, consumi) l'import ha bisogno di un **pattern** del fornitore per quella struttura di XML (vedi [Mappare una struttura di fattura](#mappare-una-struttura-di-fattura)). Senza pattern la fattura resta «in attesa» e compare in dashboard; se la inserisci a mano con lo stesso fornitore, numero e data viene collegata al giro successivo. L'import non modifica mai le anagrafiche: le differenze diventano segnalazioni.

**Spegni il motore prima di esportare o importare il database** e riaccendilo dopo: l'interruttore è salvato nel database, quindi un database importato porta con sé il suo stato.

### Mappare una struttura di fattura

Ogni fornitore manda le fatture con una sua struttura di XML: il pattern dice da quale campo leggere ciascun dato di UtenzePA. Di norma basta un pattern per fornitore: vale per tutte le sue fatture che hanno i campi usati, anche se differiscono per dati facoltativi (aliquote esenti, convenzione, quantità). Amministratori e operatori possono salvare, i lettori solo consultare.

1. Apri la segnalazione **Fornitori con fatture senza pattern** in dashboard, oppure **Impostazioni → Import fatture**, tab **Pattern**: in **Documenti senza pattern** c'è un elenco per tipo documento (per esempio «TD01 · Fattura», «TD02 · Acconto/anticipo su fattura», «TD04 · Nota di credito») e in ognuno una riga per fornitore con i documenti non coperti da nessun pattern e quante varianti di struttura hanno. Ogni tipo ha i suoi pattern: il tipo documento si legge sempre dal documento e non si mappa, e un pattern salvato su una TD01 non si applica alle TD02 o alle TD04 (né il contrario). Le note di credito non hanno la sezione Consumi; se non ce ne sono in attesa la pagina lo dice. «Tipo da leggere» raccoglie per pochi minuti i documenti registrati prima di questa versione, finché il tipo non viene letto dalla PEC. **Mappa** apre l'ultima fattura della variante più frequente.
2. Nell'editor, a sinistra, per ogni campo (sezioni **Testata**, **Righe** e **Consumi**: consumo, fasce, unità, matricola e stima) scegli dall'elenco il campo dell'XML: scrivi nel campo per cercare tra i nomi e i valori (es. «POD», «Causale» o il numero che cerchi). Le voci più probabili sono in cima, con sotto il valore letto da questa fattura; i dati del Comune (committente) sono in fondo. Senza scelta la **Descrizione** è quella della riga. Le altre scelte possibili:
   - **Non presente**: il fornitore non manda il dato;
   - **Calcolato: imponibile × IVA**: solo per l'importo della riga, quando l'XML ha l'importo senza IVA; è anche la scelta predefinita se non mappi l'importo;
   - campi segnati **(dalla testata)**: lo stesso valore della testata per tutte le righe;
   - per un dato scritto dentro un testo (Causale, descrizione o PDF), scegli il campo e scrivi **Dopo il testo** e/o **Prima del testo** (compaiono solo per i campi di testo, non per date o importi già pronti; per un campo dell'XML premi prima la forbice ✂ accanto al campo (**Solo una parte del testo**), per il PDF sono sempre visibili): il valore è quello compreso fra i due, e basta uno dei due. Per esempio consumo dopo «CONSUMO» e prima di «kWh» (nel PDF «CONSUMO 1.417 kWh»), consumo dopo «kWh» («kWh 542» nella Causale), consumo prima di «mc» («594 mc»), matricola dopo «Contatore» («Contatore 000000000000283767», con gli zeri iniziali). Con tutti e due i testi si cerca il primo, poi il valore subito prima del secondo. Il carattere **\*** vale qualsiasi carattere dentro una parola, anche nessuno: «rilevata \*mc» trova sia «rilevata mc» sia «rilevata Smc». La barra **|** separa parole alternative: «rilevata|stimata \*mc» trova la riga delle letture sia quando sono rilevate sia quando sono stimate. Per il tipo di lettura usa **Prima del testo** sulla stessa parola (es. tipo della lettura 1 prima di «rilevata|stimata \*mc», della lettura 2 prima di «\*mc»): si legge «rilevata» o «stimata» e la lettura viene segnata di conseguenza. Lasciati vuoti, si legge il valore intero del campo (per il PDF serve almeno un testo). UtenzePA legge un numero per consumo, totale e imponibile, un testo per gli altri campi. Le date scritte gg/mm/aaaa o gg.mm.aaaa vengono convertite; se il testo ne contiene due (es. «periodo: 01.09.2026-30.09.2026») l'inizio periodo prende la prima e la fine l'ultima. Se accanto al testo cercato non c'è una data, vale la prima data dopo (o l'ultima prima) entro poche righe: per esempio fine periodo prima di «Consumo nel periodo» in «07/08/2026 99963 mc Stimata Consumo nel periodo di 39 giorni».

     Un testo può essere di più parole: gli spazi valgono anche per l'a capo del PDF (es. prima di «kWh Puoi pagare» trova il kWh seguito, nella riga sotto, da «Puoi pagare»). Se il testo cercato compare più volte, sotto i campi trovi l'elenco delle occorrenze con il testo intorno e il valore che darebbe ciascuna: fai clic su quella giusta («La prima utile» torna alla scelta automatica): l'elenco si chiude e resta la scelta, con **Cambia** per riaprirlo. Cambiando il testo cercato la scelta si azzera. Se non mappi l'unità di misura vale il testo cercato quando è un'unità (kWh, mc), altrimenti quella scritta dopo il numero (Smc). Se la fattura ha più utenze, ogni riga legge il tratto dopo il codice della sua utenza; il consumo letto dalla testata o dal PDF va una volta per utenza;
   - **Consumo stimato**: dice se il consumo letto è stimato dal fornitore, che di solito lo scrive solo nel PDF. In **Lettura** scegli **Presente la parola** (es. «Stimata» accanto alle letture, con **Cerca dopo il testo** «Contatore n.») oppure **Numero dopo la parola maggiore di zero** (es. «di cui stimati: 13 Smc»). Il consumo entra nello storico dell'utenza come rilevazione **Stimata**, che lascia il posto al dato reale quando arriva;
   - **Consumo** **Per fasce (F1, F2, F3)**: per l'energia elettrica con le fasce orarie (es. nel PDF «Fascia oraria F1 … 60 kWh»). Compaiono le righe **Consumo F1**, **Consumo F2** e **Consumo F3**, già impostate dal campo del consumo, dopo «F1»/«F2»/«F3» e prima di «kWh»: correggi i testi se servono (es. dopo «Fascia oraria F1»). Se il consumo totale non è letto, vale la somma delle fasce; se lo è, un bollino giallo avvisa quando la somma delle fasce non torna. Se in una fattura le fasce non ci sono tutte (monoraria, nota di credito), si importa solo il consumo totale e nessuna fascia; se il totale non è letto, vale quanto trovato (per una monoraria la sola F1). Il bollino dice «Fasce non tutte presenti: solo il consumo totale» e l'analisi la conta come trovata: così basta un solo pattern per le fatture a fasce e per quelle monorarie dello stesso fornitore. Le fasce finiscono nella rilevazione dello storico consumi; **Totale** le toglie;
   - **Consumo** **Letture del contatore**: in alternativa al consumo del periodo, quando la fattura riporta le letture (es. nel PDF del gas «LETTURE E CONSUMI … 31/07/2026 31/08/2026 rilevata rilevata Smc 5.782 5.782»). Per ogni lettura compili **data**, **valore** e **tipo** (rilevata / stimata); **Aggiungi lettura** ne aggiunge un'altra (fino a 6), **Togli l'ultima** la toglie. Consumo, fasce e consumo stimato spariscono: si importano solo le letture, ciascuna come rilevazione a data nello storico consumi dell'utenza, collegata alla fattura (via se la fattura viene rifiutata o eliminata). Il tipo «stimata» o «presunta» rende la lettura stimata; senza tipo vale come rilevata. Se alla stessa data c'è già una lettura (es. la finale della fattura precedente) non si duplica: una stima diventa reale, una lettura reale resta com'è. Quando la stessa parola compare più volte (es. «UM» anche dentro «CONSUMI»), scegli la volta giusta o metti il testo da cui partire;
   - **Testo del PDF allegato**: per i dati che il fornitore scrive solo nel PDF (ACA, gas, energia). È in cima per riferimento contratto (che l'XML non riporta), consumo, fasce, matricola e consumo stimato, in fondo all'elenco per gli altri campi (ragione sociale, numero, data, tipo documento, totale, imponibile, CIG, utenza, periodo, unità); non vale solo per la P.IVA del fornitore. L'importo della riga dal PDF va bene per le fatture di una sola riga o con più utenze: altrimenti ogni riga prende lo stesso importo. Si usa sempre con un testo da cercare; se una fattura non ha il PDF il dato resta vuoto e la fattura si importa lo stesso;
   - un campo segnato **(non presente in questa fattura)** viene da un pattern salvato su un'altra fattura della stessa struttura: la regola resta;
   - **Consumo solo dalle righe che contengono**: quando il consumo va preso solo da alcune righe (es. «Energia»).
3. A destra c'è l'XML della fattura, con il valore del campo su cui sei evidenziato; **Vedi PDF** apre il PDF allegato. Se la fattura ha un PDF, **Testo del PDF** mostra il testo così come lo legge UtenzePA, con evidenziati il testo cercato (giallo) e quello da cui parte la ricerca (azzurro), con un riquadro sull'occorrenza scelta: scegli i testi guardando questo testo, non il PDF impaginato, perché l'ordine delle righe può essere diverso.
4. Accanto a ogni campo i bollini dicono come va l'anteprima: verde = letto e riconosciuto (es. «Consumo letto: 59 kWh», utenza trovata in anagrafica, somma delle righe uguale al totale), giallo = da controllare, grigio = non mappato. Sulla matricola il bollino mostra anche quella attuale dell'utenza: verde se coincide, giallo se verrà completata o aggiornata con quella della fattura. Sul consumo un bollino giallo avvisa se una riga non ha utenza riconosciuta o periodo: senza, il consumo non entra nello storico. Sotto, l'anteprima delle righe mostra utenza, descrizione, periodo, importo, consumo (con le fasce o le letture, se lette) e matricola. L'anteprima si aggiorna a ogni modifica e non salva nulla.
5. La barra in alto resta sempre visibile: con le frecce scorri le altre fatture del fornitore senza pattern della stessa variante di struttura, e la pagina resta alla stessa altezza. Se il fornitore ha più varianti, l'elenco **Variante** (dalla più numerosa, con quante fatture ha ciascuna) porta alla prima fattura della variante scelta: così controlli che le regole reggano anche sulle altre. Nel campo accanto, la fattura aperta: scrivi un numero di fattura per aprirne un'altra del fornitore. Le scelte restano, e «regge su K/N viste» dice su quante delle fatture viste le regole funzionano con le utenze riconosciute. **Analizza** prova le regole sulle fatture simili (le 50 più recenti di ogni variante; l'elenco **Variante** mostra per ciascuna «struttura X/N» e la barra quante varianti reggono) e aggiunge a ogni campo mappato il bollino «Trovato su X di N simili» (verde se c'è su tutte, giallo se manca su alcune, rosso se su nessuna); **Vedi le N non trovate** elenca le fatture dove il dato manca e un clic apre quella scelta, con le regole impostate. Allo stesso modo, nella barra, **N non riconosciute** elenca le fatture la cui struttura le regole non riconoscono; la prima volta servono circa 30 secondi ogni 100 fatture, poi l'analisi si ripete da sola a ogni modifica in pochi secondi.
6. **Salva pattern** (servono almeno utenza e importo della riga). Le fatture del fornitore in attesa vengono importate subito in background; il messaggio dice quante. Se il fornitore resta in elenco, le fatture rimaste hanno davvero una struttura diversa (es. senza POD): mappane una.

Se una struttura non va importata (es. documenti che non sono fatture di utenze), usa **Ignora questa struttura**: le sue fatture non verranno più proposte. Per tornare indietro elimina la struttura ignorata dall'elenco dei pattern.

Con un pattern, a ogni fattura l'import:

- **crea** la fattura se non c'è, oppure **arricchisce** quella già inserita a mano (stesso fornitore, numero e data), che mantiene il suo numero interno;
- sostituisce le righe con quelle dell'XML (utenza, periodo, importo IVA inclusa, descrizione, consumo), con il capitolo dall'impegno o, se manca, dall'utenza;
- registra i **consumi** delle righe nello storico dell'utenza, salvo i periodi già coperti da una rilevazione, con la matricola letta in fattura;
- aggiorna la **matricola** del contatore dell'utenza con quella della fattura, se manca o è diversa (con una riga nel log attività, dove resta il valore precedente). Serve l'utenza della riga: se il POD non è mappato o non è in anagrafica, l'editor avvisa che la matricola letta non ha dove essere scritta;
- le **note di credito** (TD04, TD08) entrano con importi negativi, sia che il fornitore li scriva positivi sia già negativi; l'imponibile somma tutte le aliquote. Le note di credito non registrano consumi, e nemmeno le fatture col totale negativo (rettifiche che il fornitore ha emesso come TD01 invece che TD04): queste entrano con gli importi come sono scritti, e in UtenzePA risultano comunque «Nota di credito»;
- la spesa conta subito; una fattura **rifiutata** non ha effetti e i suoi consumi vengono tolti.

Una fattura importata che modifichi a mano non viene più aggiornata dall'import. Le fatture già importate con un pattern che correggi vengono rielaborate al salvataggio. I file con più fatture (lotti) non vengono importati: vanno inseriti a mano.

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
| Volturata | L'utenza è intestata a un soggetto terzo (con il contratto immobiliare o con una voltura registrata a mano) e non ci sono pratiche in sospeso. Per il Comune non è né attiva né cessata: non compare nelle segnalazioni sulle utenze attive, non è contata tra le utenze dei capitoli (riepilogo del contratto di fornitura, capitoli senza impegno o senza assestato) e non compare nel filtro «Fornitura attiva»; nelle schede risulta «Volturata». Le fatture già registrate sull'utenza restano nella spesa del capitolo, dell'utenza e dell'immobile. |
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

### Stati SDI delle fatture

| Stato | Significato | Spesa |
| --- | --- | --- |
| Ricevuta | La fattura è arrivata dallo SDI, nessun esito inviato | Conta |
| Accettata | Il Comune ha inviato l'esito di accettazione | Conta |
| Rifiutata | Il Comune ha inviato l'esito di rifiuto | **Non conta**: esclusa dalla spesa di utenze, immobili e capitoli |
| Decorsi i termini | Nessun esito entro 15 giorni: la fattura si considera accettata | Conta |

Se lo SDI scarta un esito inviato dal Comune, la fattura torna allo stato precedente e compare tra le segnalazioni «Esito scartato dallo SDI». Una fattura senza stato non è (ancora) collegata a un messaggio della PEC.

### Segnalazioni per elenco

| Elenco | Segnalazioni |
| --- | --- |
| Utenze | Attive senza contratto di fornitura valido · Attive coperte solo da contratti senza CIG · Con contratti di fornitura sovrapposti · Attive senza tipologia ARERA · Da volturare · Da reintestare · Da decidere · Attivazioni in sospeso · Cessazioni in sospeso · Capitolo non impegnato sul contratto di fornitura · Senza capitolo di spesa · Attive senza posizione · Penali per energia reattiva (penale in un periodo terminato negli ultimi 12 mesi) |
| Immobili | Da classificare (tipologia o funzione mancanti) · Non di proprietà senza contratto passivo attivo · Di proprietà senza catasto · Fabbricati di proprietà senza Id MEF · Subalterno da assegnare (stessi via, civico, foglio e particella) |
| Impianti | Senza posizione · Senza immobile · Presidi scaduti (almeno un estintore con una scadenza superata) · Verifiche obbligatorie mancanti (vedi [Verifiche obbligatorie per legge](#verifiche-obbligatorie-per-legge)) |
| Fatture | Fuori dai periodi di attività · Con righe senza utenza · Esito scartato dallo SDI · Differenze trovate dall'import (vedi sotto) |
| Contratti di fornitura | Senza CIG (non esclusi) · CIG duplicati |
| Contratti immobiliari | Senza immobile · Senza parti |
| Capitoli di spesa | Oltre l'assestato dell'anno · Senza assestato dell'anno |
| Soggetti terzi | Senza P.IVA o codice fiscale |

In dashboard compare anche **Funzioni immobile senza tipologia MEF**: funzioni usate da immobili di proprietà a cui manca la tipologia del censimento MEF. Per l'import dalla PEC compaiono **Import fatture fermo** (nessun giro riuscito da più di 2 ore), **Fatture PEC in attesa di import** (fatture di fornitori in perimetro non ancora inserite), **Fornitori con fatture senza pattern** (un clic apre l'editor) e **Differenze trovate dall'import fatture**.

### Differenze trovate dall'import

L'import non corregge mai le anagrafiche: segnala le differenze, che trovi in dashboard e, per tipo, tra le segnalazioni dell'elenco fatture. Non sono segnalate quelle delle fatture rifiutate.

| Segnalazione | Significato | Cosa fare |
| --- | --- | --- |
| Utenza sconosciuta | Il codice letto (POD, PDR, codice cliente) non è di nessuna utenza: la riga resta senza utenza. | Aggiungi il codice all'utenza giusta (o crea l'utenza), poi salva di nuovo il pattern per rielaborare. |
| CIG diverso dal contratto | Il CIG della fattura non è quello del contratto di fornitura dell'utenza. | Verifica la fattura o il contratto. |
| Ragione sociale diversa | Il nome del fornitore in fattura è diverso da quello in anagrafica (stessa partita IVA). | Aggiorna l'anagrafica se il fornitore ha cambiato nome. |
| Impegno mancante | Non c'è un impegno per contratto, capitolo ed esercizio: la riga usa il capitolo dell'utenza. | Inserisci l'impegno nel contratto di fornitura. |
| Periodo di consumo già coperto | Il periodo della riga è già coperto da una rilevazione: il consumo della fattura non è stato registrato. | Controlla lo storico consumi dell'utenza. |
| Contratti diversi sulle righe | Le righe sono su utenze di contratti di fornitura diversi. | Verifica che utenze e contratti siano giusti. |
| File con più fatture (lotto) | Il file contiene più fatture: non è stato importato. | Inserisci le fatture a mano. |
| Matricola diversa (import fermo) | Segnalazione delle versioni precedenti: la fattura era ferma per una matricola diversa. | Nessuna azione: al primo giro la fattura si importa e la matricola dell'utenza prende quella della fattura. |

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

**Causa:** dopo 30 minuti di inattività l'applicazione esce da sola, per sicurezza. Il login compare appena scade, oppure quando torni sulla pagina (PC in sospensione, altra scheda del browser), senza dover prima fare clic.

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

### Ho inserito la lettura reale e il consumo stimato non conta più

**Causa:** è il conguaglio: un dato reale prende il posto delle stime dei giorni che copre. Le rilevazioni stimate restano in elenco, in grigio con «Superata dal dato reale», ma non contano nei consumi.

**Soluzione:** nessuna, il consumo è ora quello reale. Se la rilevazione era in realtà reale, aprila e togli la spunta **Stimata**.

**Apri un ticket se:** una stima risulta superata ma non c'è nessun dato reale successivo per quel contatore o quel periodo.

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

**Soluzione:** apri l'utenza, tab **Fornitura**, e controlla le date di attivazione, cessazione, voltura e reintestazione; inserisci lo storico mancante (anche con «Avvenuta, data non nota» se non conosci il giorno). Le segnalazioni si ricalcolano dopo il salvataggio.

**Apri un ticket se:** le date dello storico sono giuste e la fattura è corretta ma resta segnalata.

### Una fattura rifiutata non compare nella spesa

**Causa:** il Comune ha inviato allo SDI l'esito di rifiuto: la fattura resta nell'elenco con lo stato «Rifiutata» ma non conta nella spesa di utenze, immobili e capitoli.

**Soluzione:** nessuna, è il comportamento previsto. Se il fornitore emette una nuova fattura, registrala come nuova.

**Apri un ticket se:** la fattura risulta rifiutata ma l'esito inviato era di accettazione.

### «Non più disponibile sulla PEC: cercare la fattura nel protocollo.»

**Causa:** il messaggio con la fattura non è più sulla casella PEC (il gestore cancella i messaggi più vecchi). UtenzePA non conserva copie di XML e PDF.

**Soluzione:** cerca la fattura nel sistema di protocollo.

**Apri un ticket se:** la fattura è recente (pochi mesi) e il messaggio dovrebbe essere ancora sulla PEC.

### Import fatture fermo

**Causa:** da più di 2 ore nessun giro di lettura della PEC è riuscito: casella non raggiungibile, password cambiata o problema di rete del server.

**Soluzione:** un amministratore apre **Impostazioni → Import fatture**, tab **Motore**, legge l'ultimo errore e prova **Esegui ora**.

**Apri un ticket se:** l'errore resta dopo qualche tentativo o riguarda la connessione o le credenziali.

### Ho corretto il pattern ma le fatture vecchie non cambiano

**Causa:** al salvataggio vengono rielaborate le fatture rilette dalla PEC; restano come sono quelle il cui messaggio non è più sulla casella (il gestore cancella i più vecchi) e quelle modificate a mano dopo l'import.

**Soluzione:** correggi a mano le fatture rimaste, dalla scheda della fattura.

**Apri un ticket se:** una fattura recente, mai modificata a mano, non si aggiorna dopo qualche minuto.

### Il fornitore ha un pattern ma una fattura resta in attesa

**Causa:** la fattura ha una struttura che il pattern non legge (mancano campi usati dalle regole), oppure il suo messaggio non è più sulla casella PEC.

**Soluzione:** apri l'editor del pattern dalla fattura e usa **Analizza le N simili**: i campi con il bollino giallo o rosso sono quelli che mancano su alcune fatture. Correggi la regola o mappa la struttura diversa con un altro pattern.

**Apri un ticket se:** l'analisi trova tutti i campi e la fattura resta in attesa dopo un'ora.

### Una fattura importata che ho corretto non si aggiorna più

**Causa:** è voluto: quando modifichi a mano una fattura importata, l'import non la tocca più, per non cancellare le tue correzioni.

**Soluzione:** completa le correzioni a mano dalla scheda della fattura.

**Apri un ticket se:** serve rimettere la fattura sotto l'import (va fatto sul database).

## Contatti

Per problemi non risolti con questa guida apri un ticket dalla plancia dei dipendenti (CruscottoPA), scegliendo UtenzePA. Indica l'elemento interessato (es. codice utenza o numero fattura) e il messaggio esatto.
