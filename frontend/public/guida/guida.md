# UtenzePA – Guida per gli operatori

_Ultimo aggiornamento: 2026-10-27_

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
2. Nel **Riepilogo** inserisci fornitore, contratto di fornitura, numero e data della fattura, numero di protocollo, totale documento IVA inclusa. Imponibile, morosità e note sono facoltativi. Per una **nota di credito** inserisci il totale, l'imponibile e gli importi delle righe con il segno meno: la fattura è segnata «Nota di credito» e riduce la spesa. Con l'import della contabilità acceso, invece, la spesa del capitolo segue la ragioneria: la nota di credito non pesa sul capitolo, perché la ragioneria liquida la fattura al netto (vedi [Stati di pagamento delle fatture](#stati-di-pagamento-delle-fatture)). L'imponibile può essere negativo solo se lo è anche il totale.
3. Nel tab **Righe** premi **Aggiungi riga** per ogni utenza fatturata. Cerca l'utenza per POD/PDR o codice cliente, indica l'importo IVA inclusa e, se serve, consumo e descrizione. Con il pulsante accanto all'utenza ne apri la scheda; nella scheda dell'utenza il tab **Fatture** mostra quante fatture ha, una riga per fattura e periodo (le righe della stessa bolletta, es. energia, trasporto, oneri e imposte, sono sommate). Se l'utenza non ha fatture proprie, il tab mostra quelle dei suoi contratti di fornitura (es. un canone unico per tutte le utenze del contratto). Il consumo della riga resta sulla fattura: lo storico consumi dell'utenza si registra nel suo tab **Consumi**.
4. Nel tab **Impegni** trovi su quali impegni pesa la fattura: l'impegno è della fattura, non delle righe. Di norma resta in **automatico**: al salvataggio la fattura intera (totale documento, altrimenti somma delle righe) va sul primo impegno del contratto, in ordine di numero, che ha ancora rimanenza sul capitolo e sull'esercizio di competenza della fattura (preso dal periodo delle righe, dal primo inizio all'ultima fine, altrimenti dalla data della fattura). Dopo il salvataggio il tab mostra l'impegno assegnato («Assegnata a 2026/514/1 · comp. 2026 · 1.234,56 €»): con un clic ne apri la scheda. «Nessun impegno del contratto per l'esercizio …» indica che il contratto non ha impegni utilizzabili: la fattura conta sul capitolo dell'utenza delle righe, se ha righe. Una fattura con contratto e senza righe con utenza (canoni) riceve l'impegno automatico solo se gli impegni del contratto per quell'esercizio sono tutti sullo stesso capitolo; altrimenti non entra nella spesa di nessun capitolo finché non la dividi a mano nel tab **Impegni**. Senza contratto in testata la fattura non pesa su nessun impegno.
   Per scegliere un impegno preciso o dividere la fattura tra più impegni (es. un impegno esaurito a metà fattura, quote decise dalla ragioneria) premi **Dividi a mano**: per ogni quota indica impegno, annualità e importo. La prima quota parte dall'impegno automatico con il totale; **Aggiungi quota** propone la differenza ancora da ripartire; sotto la tabella compaiono somma delle quote, totale fattura e differenza (in rosso se non è zero). L'annualità proposta è quella dell'esercizio di competenza o, se l'impegno non lo ha, la più vicina. Le quote a mano non le tocca il ricalcolo: anche l'annualità scelta resta quella, pure se poi cambi la data o i periodi della fattura. Se la somma delle quote non torna col totale la fattura si salva comunque, ma compare la segnalazione «Quote d'impegno che non tornano col totale». Una fattura con contratto che resta senza impegno è segnalata come «Fatture con contratto senza impegno»: o il contratto non ha impegni nell'esercizio di competenza (inseriscilo nel contratto di fornitura) o ne ha su più capitoli (scegli l'impegno con **Dividi a mano**). **Torna automatico** (con conferma) elimina le quote a mano. Se cambi il contratto in testata e le quote a mano erano su impegni dell'altro contratto, le quote tornano automatiche (con un avviso).
   Le righe non hanno un impegno: servono per utenze, consumi e spesa per utenza e immobile.
5. Premi **Salva**.

Una fattura non deve per forza indicare le utenze: per i canoni e i servizi di un contratto (es. Servizio Luce, connettività) basta il contratto di fornitura nel Riepilogo, con righe senza utenza o anche senza righe: la fattura pesa sull'impegno del contratto per il suo totale se gli impegni del contratto per l'esercizio sono tutti sullo stesso capitolo, altrimenti va divisa a mano nel tab **Impegni**. Il tab **Fatture** della scheda del contratto di fornitura elenca tutte le fatture del contratto, quello della scheda del soggetto terzo tutte le fatture del fornitore (con il CIG del contratto): una riga per fattura con data, numero, periodo, totale e stato SDI, divise per anno della fattura con il totale dell'anno nell'intestazione (escluse le rifiutate, barrate nell'elenco). Lo stesso vale per il tab **Fatture** della scheda dell'utenza.

Se con la fattura il fatturato dell'anno supera l'assestato del capitolo, compare un avviso giallo (vedi «Il fatturato supera l'assestato del capitolo»). L'avviso non blocca il salvataggio.

### Vedere stato SDI, XML e PDF di una fattura

Le fatture elettroniche arrivano dallo SDI sulla casella PEC del Comune. UtenzePA legge la casella ogni 15 minuti e collega da sola ogni fattura già inserita con lo stesso fornitore, numero e data (vedi [Importare le fatture dalla PEC](#importare-le-fatture-dalla-pec-solo-amministratori)).

- Nella scheda di una fattura collegata compare il badge dello stato SDI (vedi [Stati SDI delle fatture](#stati-sdi-delle-fatture)); nell'elenco c'è la colonna **Stato SDI** e il filtro omonimo, con la voce «Senza messaggio SDI» per le fatture non collegate.
- **Vedi XML** e **Vedi PDF** mostrano a video la fattura elettronica e il PDF allegato dal fornitore. I file non sono salvati in UtenzePA: vengono riletti al momento dalla PEC.

### Sapere se una fattura è stata pagata

Con l'import della contabilità acceso (vedi [Collegare la contabilità](#collegare-la-contabilità-solo-amministratori)) ogni fattura dall'anno di partenza ha uno stato di pagamento (vedi [Stati di pagamento delle fatture](#stati-di-pagamento-delle-fatture)).

- Nell'elenco c'è la colonna **Pagamento** e, tra i filtri avanzati, il filtro omonimo: per esempio «Da liquidare» mostra le fatture che la ragioneria non ha ancora liquidato.
- Nella scheda compare il badge dello stato e il tab **Pagamento** con le liquidazioni della fattura: numero, impegno, importo, mandato, data di emissione e data di pagamento.
- Lo stato si aggiorna a ogni caricamento della contabilità (con il servizio Tinn ogni notte) e non si modifica a mano.

### Controllare la spesa di un capitolo

1. Apri **Capitoli di spesa** e scegli il capitolo. Il riepilogo mostra l'esercizio in corso in una barra: **fatturato sugli impegni**, **rimanenza impegni** (impegnato non ancora fatturato), **da impegnare** (assestato meno impegnato). In rosso l'impegnato oltre l'assestato e il fatturato senza impegno; passa sopra la barra per i dettagli. Il badge in testa dice quanto resta da impegnare: a zero non vuol dire che non si possa più fatturare, conta la rimanenza degli impegni. Anche la scheda di un impegno ha la sua barra: fatturato, rimanenza e, in rosso, il fatturato oltre l'importo. Il pulsante accanto al capitolo apre la scheda del capitolo.
2. Nel tab **Esercizi** trovi, anno per anno, stanziamento iniziale, assestato e spesa della ragioneria. Impegnato, fatturato, disponibile ed eventuale sforamento sono calcolati.
3. I tab **Impegni**, **Fatture** e **Utenze** mostrano cosa pesa sul capitolo. Nel tab **Impegni** ogni impegno ha importo, speso e rimanenza, e **Nuovo impegno** ne crea uno già sul capitolo. Nel tab **Fatture** la colonna **Da** dice se l'importo arriva da una quota d'impegno o, per le fatture senza impegno, dal capitolo dell'utenza della riga. Fatture (nel capitolo e nella scheda dell'impegno) divise per esercizio di competenza, utenze divise in **Attive** e **Cessate**: in ogni scheda è aperto solo l'anno in corso (o l'ultimo con fatture) e il gruppo delle attive; un clic sull'intestazione apre o chiude un gruppo.
4. Il tab **Utenze** si apre sulle **Statistiche** del periodo scelto in **Periodo** (**Ultimi 12 mesi** o un anno; l'anno in corso fino a oggi): spesa delle utenze del capitolo e variazione sul periodo precedente di pari durata, media per utenza attiva e, per tipo, consumo, costo unitario (€/kWh, €/Smc, €/m³) e presunto annuo. Per ogni utenza: spesa, spesa del periodo precedente, variazione, consumo e costo unitario. La spesa viene dalle righe di fattura dell'utenza (IVA inclusa, rifiutate escluse), divisa in proporzione ai giorni quando una bolletta è a cavallo del periodo; il costo unitario conta solo i giorni con consumo. Il triangolo segnala le utenze **fuori norma**: costo unitario oltre il doppio della mediana delle utenze dello stesso tipo nel capitolo (almeno 3), oppure spesa cambiata di oltre il 50%. La variazione si calcola solo se le bollette coprono almeno l'80% dei giorni di entrambi i periodi (altrimenti «—»: tipico degli anni con fatture senza righe per utenza). **Solo fuori norma** filtra l'elenco; un clic su una riga apre l'utenza. **Anagrafica** mostra la tabella delle utenze con colonne, modifica ed export.
5. Nel tab **Dati** il campo **Note** raccoglie le informazioni utili sul capitolo (es. cosa paga, accordi con la ragioneria).
6. Con l'import della contabilità acceso (vedi [Collegare la contabilità](#collegare-la-contabilità-solo-amministratori)) il capitolo e i suoi esercizi importati hanno il badge **Da contabilità** o l'icona della banca: codice, articolo, descrizione e importi arrivano dalla ragioneria e non si modificano, e non si aggiungono esercizi a mano. Le note restano modificabili.

Le segnalazioni «Oltre l'assestato dell'anno» e «Senza assestato dell'anno» riguardano l'esercizio in corso.

### Gestire gli impegni di spesa

1. Apri **Impegni** (sotto Capitoli di spesa). L'elenco mostra numero (anno/numero/sub della ragioneria), capitolo, esercizi di competenza (es. «2026–2028» per un pluriennale), fornitore, numero di contratti, importo, speso e rimanenza. I filtri principali sono competenza, capitolo e fornitore; in **Filtri avanzati** ci sono convenzione e contratto.
2. Premi **Nuovo impegno** e compila nel tab **Dati** anno, numero e sub dell'impegno (anno e numero vanno insieme; il sub vale 1 se lo lasci vuoto), il **Capitolo**, il **Fornitore**, l'**Esercizio di competenza** e l'**Importo**. Un preimpegno senza numero si può inserire lasciando vuoti anno e numero. Con l'import della contabilità acceso non si inseriscono impegni a mano e i preimpegni degli anni presenti nei file della ragioneria vengono tolti.
   Per un impegno **pluriennale** premi **Aggiungi esercizio** e indica l'importo di ogni anno di competenza: è sempre lo stesso impegno (stesso numero, contratti e documenti), con una rimanenza per anno. Le fatture consumano l'importo dell'anno di competenza della fattura; la scheda mostra una barra per esercizio e, nel tab **Fatture**, la competenza di ogni fattura.
3. Nel tab **Contratti** collega i contratti di fornitura che possono consumare l'impegno: un impegno può servire più contratti e lo stesso contratto può avere più impegni sullo stesso capitolo ed esercizio. Senza contratti l'impegno non viene consumato dalle fatture.
4. Il tab **Fatture** elenca le quote di fattura che consumano l'impegno nell'ordine in cui lo consumano: fattura, data, competenza, importo della quota, **speso progressivo** e **Origine** (**Automatica**, **A mano** o **Ragioneria**). Il tab **Documenti** contiene la determina o gli altri file dell'impegno.

Le fatture automatiche consumano gli impegni in ordine di numero, per intero: quando un impegno è esaurito la fattura successiva passa al seguente. Il ricalcolo non divide mai una fattura: per dividerla usa **Dividi a mano** nel tab **Impegni** della fattura. Ogni salvataggio di fattura o di impegno, e il cambio di capitolo di un'utenza, ricalcola le assegnazioni dei contratti coinvolti; ogni notte il ricalcolo passa su tutti i contratti. Un impegno senza importo non si esaurisce mai: le fatture successive restano su di lui finché esiste, quindi inserisci l'importo appena lo conosci. Una quota a mano senza annualità pesa sull'annualità dell'esercizio di competenza della fattura o, se l'impegno non la ha, sulla più vicina. Si possono creare impegni anche dal tab **Impegni e capitoli** del contratto di fornitura, dal tab **Impegni** del capitolo e dal tab **Impegni** della fattura.

Le segnalazioni dell'elenco sono «Sforati» (rimanenza negativa nell'esercizio in corso), «Senza contratto» e «Senza importo» (dall'esercizio in corso in poi) e, con l'import della contabilità, «Dalla contabilità senza contratto».

Con l'import della contabilità acceso (vedi [Collegare la contabilità](#collegare-la-contabilità-solo-amministratori)) gli impegni arrivano dalla ragioneria con il badge **Da contabilità**: numero, capitolo, fornitore ed esercizi non si modificano, **Nuovo impegno** non compare e gli impegni importati non si eliminano. Contratti collegati, note e documenti restano modificabili. Nel tab **Impegni** di una fattura pagata compare «Ripartizione della ragioneria (liquidazioni)» al posto di **Dividi a mano**.

### Gestire una convenzione CONSIP

1. Apri **Convenzioni CONSIP** e scegli la convenzione. Nel tab **Dati** ci sono nome, CIG master, scadenza, fornitore aggiudicatario, salvaguardia e descrizione; il badge in alto dice se è in corso o scaduta.
2. Il tab **Contratti** elenca i contratti di fornitura aderenti alla convenzione (numero d'ordine, CIG, periodo, stato). **Collega contratto** propone i contratti dello stesso fornitore senza convenzione; **Nuovo contratto** ne crea uno con fornitore e convenzione già compilati. Collegare e scollegare valgono subito, senza premere Salva.
3. Il tab **Impegni** mostra gli impegni dei contratti della convenzione con impegnato, speso e rimanenza totali; un clic apre la scheda dell'impegno.
4. Il tab **Documenti** contiene i file della convenzione (es. guida alla convenzione, listino).

Dalla scheda del contratto di fornitura il pulsante accanto al campo **Convenzione CONSIP** apre la scheda della convenzione.

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
- La ricerca indirizzo cerca prima nel territorio del Comune, poi altrove. Il Comune è quello del nome dell'ente in **Impostazioni → Branding** («Comune di X»): lo stesso Comune completa l'indirizzo degli impianti quando si calcola la loro posizione.
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

Nelle schede di **immobili**, **impianti**, **contratti immobiliari** e **contratti di fornitura** il tab **Documenti** raccoglie gli allegati e gli atti collegati. Anche le schede di **impegni** e **convenzioni CONSIP** hanno il tab **Documenti**, solo con gli allegati. In immobili e impianti si chiama **Documenti e foto** e contiene anche le foto, in fondo.

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

1. **Unità catastali**: un immobile può avere più unità (piani, subalterni). Premi **Aggiungi unità** e compila almeno **Foglio** e **Particella**; sezione, subalterno, categoria e rendita sono facoltativi. Le categorie sono quelle del quadro dell'Agenzia delle Entrate (da A/1 a F/7, comprese D/8 e E/7). Il cestino rimuove un'unità dopo la conferma. Le modifiche valgono al **Salva**.
2. **Consistenza**: superficie, superficie di riferimento, aree pertinenziali, cubatura ed epoca di costruzione.
3. **Patrimonio**: natura giuridica, vincolo culturale o paesaggistico, federalismo demaniale e bene confiscato (Sì, No o Non noto).
4. **Per il MEF** (si apre con un clic) mostra i dati calcolati dall'applicazione, aggiornati a ogni salvataggio:
   - **Id bene MEF**: lo assegna il MEF, arriva con l'import e non si modifica.
   - **Utilizzo**: «Dato a terzi» se è in corso (o in scadenza) un contratto immobiliare attivo, cioè con cui il Comune concede l'immobile a terzi, «Inutilizzabile» se l'immobile è dismesso, altrimenti «Utilizzato direttamente».
   - **Stato di accatastamento**: «Accatastato» con almeno un'unità catastale.
   - **Tipologia** e **Finalità**: vengono dalla funzione dell'immobile. Si impostano in **Funzioni immobile** (campi **Tipologia MEF** e **Finalità MEF**), anche con **apri la funzione** dal riquadro; la finalità vale solo per gli immobili utilizzati direttamente.

Nell'elenco immobili puoi cercare per foglio e particella (valore esatto), natura giuridica e utilizzo, e aggiungere le colonne **Catasto**, **Natura giuridica**, **Utilizzo** e **Id MEF**.

### Fare un backup (solo amministratori)

Da **Impostazioni → Backup e manutenzione** puoi creare un backup, scaricarlo, eliminarlo o ripristinarlo. Ogni notte l'applicazione crea da sola un backup dei soli dati e cancella quelli vecchi: restano il più recente di ciascuno degli ultimi 7 giorni, delle ultime 4 settimane e degli ultimi 12 mesi (anche i backup creati a mano seguono questa regola: per tenerne uno più a lungo, scaricalo). Con **Includi foto** e **Includi gli allegati** il backup contiene anche i file: può diventare di molti GB.

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

Sono considerate solo le fatture dei fornitori in anagrafica con partita IVA e almeno un contratto di fornitura; le altre restano «fuori perimetro». Quando aggiungi in anagrafica un fornitore con la sua partita IVA e un contratto di fornitura, le sue fatture già arrivate tornano da sole in attesa al giro successivo. Per leggere i dati di una fattura (utenze, importi, periodi, consumi) l'import ha bisogno di un **pattern** del fornitore per quella struttura di XML (vedi [Mappare una struttura di fattura](#mappare-una-struttura-di-fattura)). Senza pattern la fattura resta «in attesa» e compare in dashboard; se la inserisci a mano con lo stesso fornitore, numero e data viene collegata al giro successivo. L'import non modifica mai le anagrafiche: le differenze diventano segnalazioni.

**Spegni il motore prima di esportare o importare il database** e riaccendilo dopo: l'interruttore è salvato nel database, quindi un database importato porta con sé il suo stato.

### Collegare la contabilità (solo amministratori)

In **Impostazioni → Contabilità** (visibile solo agli amministratori) UtenzePA prende dalla contabilità del Comune capitoli, impegni e fatture pagate. Con l'import acceso la contabilità è la fonte dei dati: quello che arriva dai file prevale su quanto inserito a mano.

1. Accendi l'interruttore e indica **Importa dall'anno** (es. 2023): le righe degli anni precedenti vengono scartate.
2. Scegli i file **Capitoli**, **Impegni**, **Liquidazioni** e, facoltativo, **Note di credito** estratti dalla contabilità (se ne può caricare anche uno solo: sostituisce quello caricato prima) e premi **Carica**.
3. Il caricamento continua in background (il primo può durare qualche minuto, puoi lasciare la pagina); a fine caricamento la pagina mostra le righe caricate per file, le righe scartate con riga e motivo, e cosa è cambiato: capitoli ed esercizi, impegni, fatture create, identificativi SDI completati, fatture con le quote della ragioneria, impegni collegati a contratti e capitoli delle utenze aggiornati.

**Scaricamento automatico.** Se il Comune ha installato il servizio Tinn, la pagina mostra anche la sezione **Scaricamento automatico**: ogni notte (alle 4) il servizio scarica il backup della contabilità, ne estrae i file e li consegna a UtenzePA, che li carica da solo entro pochi minuti come se li avessi scelti tu. La mattina trovi la contabilità aggiornata, senza fare nulla. Nella sezione vedi quando è avvenuto l'ultimo scaricamento, l'esito, la data del backup e il prossimo giro. Se il backup della notte è uguale a quello già caricato (ad esempio nel fine settimana) l'esito è «Backup invariato, nessuna modifica». Il servizio usa l'anno di **Importa dall'anno** e carica solo con l'interruttore acceso. **Esegui ora** serve solo dopo un errore: il giro parte entro un minuto e il caricamento ne segue qualche minuto dopo.

Cosa fa il caricamento:

- **Capitoli**: entrano i capitoli già presenti e quelli su cui la ragioneria ha pagato fatture di un fornitore con contratto di fornitura. Per ogni anno presente nel file stanziamento iniziale, assestato e spesa della ragioneria (se manca, il liquidato del capitolo nell'anno) arrivano dalla contabilità.
- **Impegni**: tutti quelli non annullati dei capitoli importati, con un'annualità per anno di competenza. Negli anni presenti nel file gli impegni e le annualità che la contabilità non ha (inseriti a mano o annullati in ragioneria) si tolgono, con le loro quote: le fatture tornano al calcolo automatico.
- **Fatture**: una fattura pagata che UtenzePA non ha viene creata (fornitore, numero, data, totale, identificativo SDI e contratto dal CIG); a una fattura presente senza identificativo SDI si aggiunge quello della contabilità. Le righe arrivano poi dall'import PEC o si inseriscono a mano. Una fattura non ancora liquidata non è un errore: semplicemente non è ancora stata pagata.
- **Quote d'impegno**: le fatture pagate pesano sugli impegni come le ha liquidate la ragioneria (origine **Ragioneria**), al posto delle quote automatiche o a mano.
- **Pagamenti**: ogni fattura dall'anno di partenza prende lo stato di pagamento dalle sue liquidazioni, dai mandati e dalle note di credito che la compensano (vedi [Stati di pagamento delle fatture](#stati-di-pagamento-delle-fatture)).
- **Collegamenti**: l'impegno si collega al contratto indicato dal suo CIG e ai contratti delle fatture pagate (i collegamenti esistenti restano); il capitolo di un'utenza diventa quello su cui sono state pagate le sue fatture nell'ultimo esercizio, se è uno solo.

I dati importati hanno il badge **Da contabilità** e, con l'import acceso, numero, capitolo, fornitore e importi non si modificano (si correggono in ragioneria e si ricaricano); non si possono creare capitoli, esercizi o impegni a mano né eliminare quelli importati. Restano modificabili note, documenti, contratti collegati e tipi utenza ammessi.

Tracciato dei file (CSV, separatore punto e virgola, prima riga con i nomi delle colonne in qualsiasi ordine, importi con virgola o punto decimale, date AAAA-MM-GG, `cancelled` = 1 per le righe annullate):

| File | Colonne |
| --- | --- |
| Capitoli | year, chapter, article, description, initial_budget, adjusted_budget, spent |
| Impegni (una riga per anno di competenza) | commitment_year, commitment_num, commitment_sub, fiscal_year, chapter, article, supplier_vat, amount, cig, cancelled, description |
| Liquidazioni | liquidation_key, commitment_year, commitment_num, commitment_sub, fiscal_year, sdi_identifier, invoice_number, invoice_date, invoice_total, invoice_cig, supplier_vat, amount, cancelled; facoltative: liquidation_number, mandate_number, mandate_date, paid_date, paid_amount (mandato più recente e pagamento) |
| Note di credito (facoltativo; una riga per ogni nota compensata su una fattura) | link_key, fiscal_year, amount (negativo), supplier_vat, note_sdi_identifier, note_number, note_date, note_total, invoice_sdi_identifier, invoice_number, invoice_date, invoice_total |

Come per l'import fatture, **spegni l'import prima di esportare o importare il database**: l'interruttore è salvato nel database.

### Mappare una struttura di fattura

Ogni fornitore manda le fatture con una sua struttura di XML: il pattern dice da quale campo leggere ciascun dato di UtenzePA. Di norma basta un pattern per fornitore: vale per tutte le sue fatture che hanno i campi usati, anche se differiscono per dati facoltativi (aliquote esenti, convenzione, quantità). Amministratori e operatori possono salvare, i lettori solo consultare.

1. Apri la segnalazione **Fornitori con fatture senza pattern** in dashboard, oppure **Impostazioni → Import fatture**, tab **Pattern**: in **Documenti senza pattern** c'è un elenco per tipo documento (per esempio «TD01 · Fattura», «TD02 · Acconto/anticipo su fattura», «TD04 · Nota di credito») e in ognuno una riga per fornitore con i documenti non coperti da nessun pattern e quante varianti di struttura hanno. Ogni tipo ha i suoi pattern: il tipo documento si legge sempre dal documento e non si mappa, e un pattern salvato su una TD01 non si applica alle TD02 o alle TD04 (né il contrario). Le note di credito non hanno la sezione Consumi; se non ce ne sono in attesa la pagina lo dice. «Tipo da leggere» raccoglie per pochi minuti i documenti registrati prima di questa versione, finché il tipo non viene letto dalla PEC. **Mappa** apre l'ultima fattura della variante più frequente.
2. Nell'editor, a sinistra, per ogni campo (sezioni **Testata**, **Righe** e **Consumi**: consumo, fasce, unità, matricola e stima) scegli dall'elenco il campo dell'XML: scrivi nel campo per cercare tra i nomi e i valori (es. «POD», «Causale» o il numero che cerchi). Le voci più probabili sono in cima, con sotto il valore letto da questa fattura; i dati del Comune (committente) sono in fondo. Senza scelta la **Descrizione** è quella della riga. Le altre scelte possibili:
   - **Non presente**: il fornitore non manda il dato;
   - **Calcolato: imponibile × IVA**: solo per l'importo della riga, quando l'XML ha l'importo senza IVA; è anche la scelta predefinita se non mappi l'importo;
   - campi segnati **(dalla testata)**: lo stesso valore della testata per tutte le righe;
   - per un dato scritto dentro un testo (Causale, descrizione o PDF), scegli il campo e scrivi **Dopo il testo** e/o **Prima del testo** (compaiono solo per i campi di testo, non per date o importi già pronti; per un campo dell'XML premi prima la forbice ✂ accanto al campo (**Solo una parte del testo**), per il PDF sono sempre visibili): il valore è quello compreso fra i due, e basta uno dei due. Per esempio consumo dopo «CONSUMO» e prima di «kWh» (nel PDF «CONSUMO 1.417 kWh»), consumo dopo «kWh» («kWh 542» nella Causale), consumo prima di «mc» («594 mc»), matricola dopo «Contatore» («Contatore 000000000000283767», con gli zeri iniziali). Con tutti e due i testi si cerca il primo, poi il valore subito prima del secondo. Il carattere **\*** vale qualsiasi carattere dentro una parola, anche nessuno: «rilevata \*mc» trova sia «rilevata mc» sia «rilevata Smc». La barra **|** separa parole alternative: «rilevata|stimata \*mc» trova sia «rilevata» sia «stimata». Lasciati vuoti, si legge il valore intero del campo (per il PDF serve almeno un testo). UtenzePA legge un numero per consumo, totale e imponibile, un testo per gli altri campi. Le date scritte gg/mm/aaaa o gg.mm.aaaa vengono convertite; se il testo ne contiene due (es. «periodo: 01.09.2026-30.09.2026») l'inizio periodo prende la prima e la fine l'ultima. Valgono anche i mesi in lettere con l'anno, interi o abbreviati: «Periodo rif. Luglio-Agosto 2026» dà dal 01/07/2026 al 31/08/2026, «giugno 2026» tutto giugno, «Dicembre-Gennaio 2026» dal 01/12/2025 al 31/01/2026 (per esempio inizio e fine periodo dopo «Periodo rif.» nella descrizione della riga). Dopo il testo cercato vale anche un intervallo di date («dal 01/09/2026 al 31/10/2026», «01.09.2026 - 30.09.2026»): l'inizio prende la prima, la fine la seconda. Con la barra la stessa regola copre più formati: **Dopo il testo** «rif.|dal» legge sia «Periodo rif. Luglio-Agosto 2026» sia «dal 01/09/2026 al 31/10/2026». Se accanto al testo cercato non c'è una data, vale la prima data dopo (o l'ultima prima) entro poche righe: per esempio fine periodo prima di «Consumo nel periodo» in «07/08/2026 99963 mc Stimata Consumo nel periodo di 39 giorni».

     Un testo può essere di più parole: gli spazi valgono anche per l'a capo del PDF (es. prima di «kWh Puoi pagare» trova il kWh seguito, nella riga sotto, da «Puoi pagare»). Se il testo cercato compare più volte, sotto i campi trovi l'elenco delle occorrenze con il testo intorno e il valore che darebbe ciascuna: fai clic su quella giusta («La prima utile» torna alla scelta automatica): l'elenco si chiude e resta la scelta, con **Cambia** per riaprirlo. Cambiando il testo cercato la scelta si azzera. Se non mappi l'unità di misura vale il testo cercato quando è un'unità (kWh, mc), altrimenti quella scritta dopo il numero (Smc). Se la fattura ha più utenze, ogni riga legge il tratto dopo il codice della sua utenza; il consumo letto dalla testata o dal PDF va una volta per utenza;
   - **Consumo stimato**: dice se il consumo letto è stimato dal fornitore, che di solito lo scrive solo nel PDF. In **Lettura** scegli **Presente la parola** (es. «Stimata» accanto alle letture, con **Cerca dopo il testo** «Contatore n.») oppure **Numero dopo la parola maggiore di zero** (es. «di cui stimati: 13 Smc»). Il consumo entra nello storico dell'utenza come rilevazione **Stimata**, che lascia il posto al dato reale quando arriva;
   - **Consumo** **Per fasce (F1, F2, F3)**: per l'energia elettrica con le fasce orarie (es. nel PDF «Fascia oraria F1 … 60 kWh»). Compaiono le righe **Consumo F1**, **Consumo F2** e **Consumo F3**, già impostate dal campo del consumo, dopo «F1»/«F2»/«F3» e prima di «kWh»: correggi i testi se servono (es. dopo «Fascia oraria F1»). Se il consumo totale non è letto, vale la somma delle fasce; se lo è, un bollino giallo avvisa quando la somma delle fasce non torna. Se in una fattura le fasce non ci sono tutte (monoraria, nota di credito), si importa solo il consumo totale e nessuna fascia; se il totale non è letto, vale quanto trovato (per una monoraria la sola F1). Il bollino dice «Fasce non tutte presenti: solo il consumo totale» e l'analisi la conta come trovata: così basta un solo pattern per le fatture a fasce e per quelle monorarie dello stesso fornitore. Le fasce finiscono nella rilevazione dello storico consumi; **Totale** le toglie;
   - **Consumo** **Letture del contatore**: in alternativa al consumo del periodo, quando il PDF riporta la tabella delle letture. UtenzePA la trova da solo, in tutti e due i versi: una lettura per colonna (gas Dolomiti: «UM 31/07/2026 31/08/2026» / «rilevata stimata» / «Smc 5.782 5.790») o una lettura per riga (ACA: «Data Lettura Tipo lettura» e sotto «29/06/2026 99369 mc Stimata»; AGSM AIM: «Tipologia Data Letture» e sotto «Rilevata 30/06/2026 10.393», col tipo in testa). Non sono tabelle delle letture le righe di un periodo col suo consumo («01/06/2026 - 30/06/2026 2») né quelle sotto un'intestazione con una data (es. gli scaglioni «accisa … dal 01/06/2026 al» / «30/06/2026 da 0000000480»). Se una riga ha due date sono la lettura iniziale e la finale (energia elettrica A2A: «31.08.2026 30.09.2026 Fascia oraria F1 3.869 Rilevata 3.976 Rilevata 107 kWh»); se la lettura iniziale è 0 il contatore riparte da zero a ogni periodo (A2A: «31.08.2026 30.09.2026 Energia attiva 0 Rilevata 1.417 Rilevata 1.417 kWh»): la finale diventa il consumo del periodo, non una lettura; con le fasce F1, F2, F3 nelle righe ogni data diventa una lettura con i totalizzatori di fascia, e il valore è la loro somma. Più tabelle con la stessa intestazione (energia attiva, reattiva, potenza) si distinguono dall'unità nel selettore (es. «2 letture in kWh con le fasce»). Nel selettore **Tabella delle letture** scegli quella giusta (es. «In righe, sotto «Data Lettura Tipo lettura»: 2 letture, dal 29/06/2026»); se il PDF ne ha più di una compaiono tutte. L'intestazione della tabella si evidenzia nel testo del PDF a destra e sotto una tabellina mostra le letture: data, valore (con le fasce, se ci sono) e tipo, con un pallino verde per le rilevate e arancio per le stimate (senza tipo nel PDF valgono come rilevate); una colonna senza data o senza valore è in grigio e non si importa. Il pattern ricorda il verso e l'intestazione: nelle altre fatture si legge la tabella con la stessa intestazione, con quante letture ha. Consumo, fasce e consumo stimato spariscono: ogni lettura diventa una rilevazione a data nello storico consumi dell'utenza, collegata alla fattura (via se la fattura viene rifiutata o eliminata). Se alla stessa data c'è già una lettura (es. la finale della fattura precedente) non si duplica: una stima diventa reale, una lettura reale resta com'è; una lettura più bassa della precedente sullo stesso contatore non si importa e compare tra le differenze come «Lettura più bassa della precedente» (con una matricola diversa è un cambio contatore e si importa);
   - **Testo del PDF allegato**: per i dati che il fornitore scrive solo nel PDF (ACA, gas, energia). È in cima per riferimento contratto (che l'XML non riporta), consumo, fasce, matricola e consumo stimato, al quarto posto, subito dopo i tre campi dell'XML più probabili, per gli altri (ragione sociale, numero, data, totale, imponibile, CIG, utenza, periodo, importo della riga, unità); non vale per la P.IVA del fornitore e il tipo documento. L'importo della riga dal PDF va bene per le fatture di una sola riga o con più utenze: altrimenti ogni riga prende lo stesso importo. Si usa sempre con un testo da cercare; se una fattura non ha il PDF il dato resta vuoto e la fattura si importa lo stesso;
   - un campo segnato **(non presente in questa fattura)** viene da un pattern salvato su un'altra fattura della stessa struttura: la regola resta;
   - **Consumo solo dalle righe che contengono**: quando il consumo va preso solo da alcune righe (es. «Energia»).
3. A destra c'è l'XML della fattura, con il valore del campo su cui sei evidenziato; **Vedi PDF** apre il PDF allegato. Se la fattura ha un PDF, **Testo del PDF** mostra il testo così come lo legge UtenzePA, con evidenziati il testo cercato (giallo) e quello da cui parte la ricerca (azzurro), con un riquadro sull'occorrenza scelta: scegli i testi guardando questo testo, non il PDF impaginato, perché l'ordine delle righe può essere diverso.
4. Accanto a ogni campo i bollini dicono come va l'anteprima: verde = letto e riconosciuto (es. «Consumo letto: 59 kWh», utenza trovata in anagrafica, somma delle righe uguale al totale), giallo = da controllare, grigio = non mappato. Sulla matricola il bollino mostra anche quella attuale dell'utenza: verde se coincide, giallo se verrà completata o aggiornata con quella della fattura. Sul consumo un bollino giallo avvisa se una riga non ha utenza riconosciuta o periodo: senza, il consumo non entra nello storico. Sotto, l'anteprima delle righe mostra utenza, descrizione, periodo, importo, consumo (con le fasce o le letture, se lette) e matricola. L'anteprima si aggiorna a ogni modifica e non salva nulla.
5. La barra in alto resta sempre visibile: con le frecce scorri le altre fatture del fornitore senza pattern della stessa variante di struttura, e la pagina resta alla stessa altezza. Se il fornitore ha più varianti, l'elenco **Variante** (dalla più numerosa, con quante fatture ha ciascuna) porta alla prima fattura della variante scelta: così controlli che le regole reggano anche sulle altre. Nel campo accanto, la fattura aperta: scrivi un numero di fattura per aprirne un'altra del fornitore. Le scelte restano, e «regge su K/N viste» dice su quante delle fatture viste le regole funzionano con le utenze riconosciute. **Analizza** prova le regole sulle fatture simili (le 50 più recenti di ogni variante; l'elenco **Variante** mostra per ciascuna «struttura X/N» e la barra quante varianti reggono) e aggiunge a ogni campo mappato il bollino «Trovato su X di N simili» (verde se c'è su tutte, giallo se manca su alcune, rosso se su nessuna); **Vedi le N non trovate** elenca le fatture dove il dato manca e un clic apre quella scelta, con le regole impostate. Allo stesso modo, nella barra, **N non riconosciute** elenca le fatture la cui struttura le regole non riconoscono; la prima volta servono circa 30 secondi ogni 100 fatture, poi l'analisi si ripete da sola a ogni modifica in pochi secondi.
6. **Salva pattern** (serve l'utenza della riga oppure, per le fatture di contratto senza utenze, il CIG o il riferimento contratto della fattura; l'importo della riga, se non lo mappi, è l'imponibile × IVA). Le fatture del fornitore in attesa vengono importate subito in background; il messaggio dice quante. Se il fornitore resta in elenco, le fatture rimaste hanno davvero una struttura diversa (es. senza POD): mappane una. Non salvare due pattern con le stesse regole per lo stesso fornitore: se una fattura è riconosciuta da due pattern equivalenti l'import non sceglie e la fattura resta in attesa; un solo pattern vale per tutte le strutture che hanno i campi usati.

Se una struttura non va importata (es. documenti che non sono fatture di utenze), usa **Ignora questa struttura**: le sue fatture non verranno più proposte. Per tornare indietro elimina la struttura ignorata dall'elenco dei pattern.

Con un pattern, a ogni fattura l'import:

- **crea** la fattura se non c'è, oppure **arricchisce** quella già inserita a mano (stesso fornitore, numero e data), che mantiene il suo numero interno;
- sostituisce le righe con quelle dell'XML (utenza, periodo, importo IVA inclusa, descrizione, consumo); l'impegno della fattura lo assegna poi il ricalcolo automatico;
- trova il **contratto** dall'utenza della riga; per le righe senza utenza (canoni di contratto, sedi senza codice) dal CIG o dal riferimento contratto della fattura, se indica un solo contratto del fornitore (se il contratto non ha impegni nell'esercizio di competenza della fattura compare «Impegno mancante», una volta per fattura: l'impegno si assegna alla fattura nel tab **Impegni**);
- registra i **consumi** delle righe nello storico dell'utenza, salvo i periodi già coperti da una rilevazione, con la matricola letta in fattura;
- aggiorna la **matricola** del contatore dell'utenza con quella della fattura, se manca o è diversa (con una riga nel log attività, dove resta il valore precedente). Serve l'utenza della riga: se il POD non è mappato o non è in anagrafica, l'editor avvisa che la matricola letta non ha dove essere scritta;
- le **note di credito** (TD04, TD08) entrano con importi negativi, sia che il fornitore li scriva positivi sia già negativi; l'imponibile somma tutte le aliquote. Le note di credito non registrano consumi, e nemmeno le fatture col totale negativo (rettifiche che il fornitore ha emesso come TD01 invece che TD04): queste entrano con gli importi come sono scritti, e in UtenzePA risultano comunque «Nota di credito»;
- la spesa conta subito; una fattura **rifiutata** non ha effetti e i suoi consumi vengono tolti.

Una fattura importata che modifichi a mano non viene più aggiornata dall'import. Le fatture già importate con un pattern che correggi vengono rielaborate al salvataggio. La rielaborazione rifà le righe ma tiene le quote d'impegno scelte a mano (per esempio quelle della liquidazione): le quote sono della fattura, non delle righe. I file con più fatture (lotti) non vengono importati: vanno inseriti a mano.

## Regole e riferimenti

### Ruoli

| Ruolo | Cosa può fare |
| --- | --- |
| Lettore | Consulta tutto, non modifica nulla. È il ruolo di chi entra la prima volta con l'account di dominio. |
| Operatore | Crea, modifica ed elimina immobili, utenze, impianti, contratti, fatture e capitoli. |
| Admin | Come l'Operatore, più utenti e ruoli, log attività completo, backup, branding, rigeocodifica degli immobili e ricalcolo dei consumi. |

I ruoli si assegnano da **Impostazioni → Utenti e ruoli**, pagina riservata agli Admin: Operatori e Lettori non vedono l'elenco degli utenti.

Quello che UtenzePA scrive da solo (fatture, letture e matricole dall'import della PEC, righe automatiche dello storico delle forniture) ha come autore **UtenzePA (automatico)** in «Ultima modifica» (anche dell'utenza, quando l'import ne scrive la matricola) e nello storico delle modifiche. Non è una persona: non accede e non compare in Utenti e ruoli. Fino alla versione 1.43 queste scritture risultavano fatte dal primo amministratore; sono state riassegnate.

Su un'installazione nuova UtenzePA crea da solo i quattro tipi di utenza di base (energia elettrica, gas, acqua, connettività), uno per ciascuna categoria che il programma conosce. Puoi rinominarli da **Impostazioni → Tipologie uso contatore**; se ne aggiungi altri, scegli la categoria giusta, perché da quella dipendono unità di consumo, categorie ARERA e controlli.

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

**Nuovo contratto che ne sostituisce più d'uno:** nel tab **Utenze** della scheda del nuovo contratto, **Collega le utenze di un contratto** aggiunge in un colpo le utenze del contratto scelto (in cima quelli dello stesso fornitore; cerca per ordine, CIG o fornitore). Le utenze **Non attive** restano fuori, salvo spuntare **Collega anche le utenze non attive**. Ripetilo per ogni contratto sostituito. Le utenze già collegate non si duplicano e il collegamento vale al **Salva**. I contratti sostituiti non si chiudono da soli: aggiorna la loro scadenza o spunta **Chiuso** nelle loro schede.

### Stati SDI delle fatture

| Stato | Significato | Spesa |
| --- | --- | --- |
| Ricevuta | La fattura è arrivata dallo SDI, nessun esito inviato | Conta |
| Accettata | Il Comune ha inviato l'esito di accettazione | Conta |
| Rifiutata | Il Comune ha inviato l'esito di rifiuto | **Non conta**: esclusa dalla spesa di utenze, immobili e capitoli |
| Decorsi i termini | Nessun esito entro 15 giorni: la fattura si considera accettata | Conta |

Se lo SDI scarta un esito inviato dal Comune, la fattura torna allo stato precedente e compare tra le segnalazioni «Esito scartato dallo SDI». Una fattura senza stato non è (ancora) collegata a un messaggio della PEC.

### Stati di pagamento delle fatture

| Stato | Significato |
| --- | --- |
| Da liquidare | Nessuna liquidazione in contabilità: la fattura non è ancora stata liquidata |
| Liquidata | Liquidata, ma almeno un mandato non è ancora pagato (o non è ancora emesso) |
| Pagata | Tutte le liquidazioni hanno il mandato pagato; la data è quella dell'ultimo pagamento |
| Stornata | Nessuna liquidazione e note di credito che ne annullano tutto l'importo: la fattura non si paga |
| Compensata | Nota di credito che la ragioneria ha compensato su una fattura del fornitore |
| Da compensare | Nota di credito non ancora compensata su nessuna fattura in contabilità |

La ragioneria non liquida le note di credito: le compensa sulle fatture del fornitore, che si liquidano al netto o, se stornate per intero, non si liquidano. Per questo le fatture **Stornate** e le note di credito (**Compensata**, **Da compensare**) non contano nella spesa del capitolo né consumano gli impegni: lo sconto è già nelle liquidazioni delle fatture. Restano invece nella spesa delle utenze e degli immobili, che si calcola dalle righe.

Senza stato restano le fatture prima dell'anno di partenza dell'import e quelle rifiutate dallo SDI. Per gli esercizi già chiusi la contabilità non sempre registra la data di pagamento del mandato: lì un mandato emesso e non annullato conta come pagato, con la data di emissione.

### Segnalazioni per elenco

| Elenco | Segnalazioni |
| --- | --- |
| Utenze | Attive senza contratto di fornitura valido · Attive coperte solo da contratti senza CIG · Con contratti di fornitura sovrapposti · Attive senza tipologia ARERA · Da volturare · Da reintestare · Da decidere · Attivazioni in sospeso · Cessazioni in sospeso · Capitolo non impegnato sul contratto di fornitura · Senza capitolo di spesa · Pagate su più capitoli nell'ultimo esercizio (import contabilità) · Attive senza posizione · Penali per energia reattiva (penale in un periodo terminato negli ultimi 12 mesi) |
| Immobili | Da classificare (tipologia o funzione mancanti) · Non di proprietà senza contratto passivo attivo · Di proprietà senza catasto · Fabbricati di proprietà senza Id MEF · Subalterno da assegnare (stessi via, civico, foglio e particella) |
| Impianti | Senza posizione · Senza immobile · Presidi scaduti (almeno un estintore con una scadenza superata) · Verifiche obbligatorie mancanti (vedi [Verifiche obbligatorie per legge](#verifiche-obbligatorie-per-legge)) |
| Fatture | Fuori dai periodi di attività · Con righe senza utenza (né contratto in testata) · Esito scartato dallo SDI · Quote d'impegno che non tornano col totale · Differenze trovate dall'import (vedi sotto) |
| Contratti di fornitura | Senza CIG (non esclusi) · CIG duplicati |
| Contratti immobiliari | Senza immobile · Senza parti |
| Capitoli di spesa | Oltre l'assestato dell'anno · Senza assestato dell'anno |
| Soggetti terzi | Senza P.IVA o codice fiscale |

In dashboard compare anche **Funzioni immobile senza tipologia MEF**: funzioni usate da immobili di proprietà a cui manca la tipologia del censimento MEF. Per l'import dalla PEC compaiono **Import fatture fermo** (nessun giro riuscito da più di 2 ore), **Fatture PEC in attesa di import** (fatture di fornitori in perimetro non ancora inserite), **Fornitori con fatture senza pattern** (un clic apre l'editor) e **Differenze trovate dall'import fatture**. Per l'import della contabilità compare **Fatture pagate dalla ragioneria non trovate**: liquidazioni su impegni di UtenzePA la cui fattura non c'è e non si può creare (manca il totale o il fornitore non ha un contratto di fornitura).

### Differenze trovate dall'import

L'import non corregge mai le anagrafiche: segnala le differenze, che trovi in dashboard e, per tipo, tra le segnalazioni dell'elenco fatture. Non sono segnalate quelle delle fatture rifiutate.

| Segnalazione | Significato | Cosa fare |
| --- | --- | --- |
| Utenza sconosciuta | Il codice letto (POD, PDR, codice cliente) non è di nessuna utenza: la riga resta senza utenza. | Aggiungi il codice all'utenza giusta (o crea l'utenza), poi salva di nuovo il pattern per rielaborare. |
| CIG diverso dal contratto | Il CIG della fattura non è quello del contratto di fornitura dell'utenza. | Verifica la fattura o il contratto. |
| Ragione sociale diversa | Il nome del fornitore in fattura è diverso da quello in anagrafica (stessa partita IVA). | Aggiorna l'anagrafica se il fornitore ha cambiato nome. |
| Impegno mancante | Non c'è un impegno per contratto, capitolo ed esercizio: la riga usa il capitolo dell'utenza. Per le righe senza utenza: il contratto non ha impegni nell'esercizio o li ha su più capitoli. | Inserisci l'impegno nel contratto di fornitura (con impegni su più capitoli, scegli quello giusto con **Dividi a mano** nel tab **Impegni** della fattura). |
| Periodo di consumo già coperto | Il periodo della riga è già coperto da una rilevazione: il consumo della fattura non è stato registrato. | Controlla lo storico consumi dell'utenza. |
| Contratti diversi sulle righe | Le righe sono su utenze di contratti di fornitura diversi. | Verifica che utenze e contratti siano giusti. |
| File con più fatture (lotto) | Il file contiene più fatture: non è stato importato. | Inserisci le fatture a mano. |
| Matricola diversa (import fermo) | Segnalazione delle versioni precedenti: la fattura era ferma per una matricola diversa. | Nessuna azione: al primo giro la fattura si importa e la matricola dell'utenza prende quella della fattura. |
| Dati dal PDF non trovati | Il pattern legge dati dal PDF (letture, matricola, consumo…) ma in questa fattura non li ha trovati: il PDF manca o il fornitore ne ha cambiato l'impaginazione. La fattura è importata senza quei dati. Non vale per i dati che mancano per regola (consumi delle note di credito, fasce di una monoraria). | Clic sulla segnalazione: si apre l'editor sulla fattura. Se il layout è cambiato, correggi il pattern e salvalo (le fatture si rielaborano). Se è un caso isolato, registra i dati a mano e usa la campanella barrata **Silenzia**: la segnalazione non torna più per quella fattura, nemmeno se viene rielaborata. |

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

**Soluzione:** è un avviso, non un errore: la fattura si salva comunque. Verifica con la ragioneria l'assestato del capitolo e aggiornalo nel tab **Esercizi**, oppure controlla nel tab **Impegni** che la fattura sia sull'impegno giusto.

**Apri un ticket se:** l'assestato è aggiornato ma l'avviso indica cifre diverse.

### «Con l'import della contabilità attivo questo dato arriva dalla contabilità.»

**Causa:** l'import della contabilità è acceso e il dato (capitolo, esercizio del capitolo o impegno con il badge **Da contabilità**) arriva dalla ragioneria: numero, capitolo, fornitore e importi non si modificano e non si possono creare o eliminare a mano capitoli, esercizi e impegni. Lo stesso vale per le quote d'impegno di origine **Ragioneria** di una fattura.

**Soluzione:** chiedi la correzione alla ragioneria e fai ricaricare i file in **Impostazioni → Contabilità**. Note, documenti, contratti collegati e tipi utenza ammessi restano modificabili.

**Apri un ticket se:** il messaggio compare su un dato senza badge **Da contabilità**.

### Contabilità non aggiornata

**Causa:** in dashboard compare «Contabilità non aggiornata da N giorni» (o «Contabilità mai caricata») quando lo scaricamento automatico è installato e acceso ma da più di due giorni nessun caricamento è riuscito. Di solito il server della contabilità non era raggiungibile, il backup non c'era o il caricamento dei file è andato in errore.

**Soluzione:** apri **Impostazioni → Contabilità** e leggi l'esito nella sezione **Scaricamento automatico** e in **Ultimo giro**. Se l'errore era passeggero premi **Esegui ora** e controlla l'esito dopo qualche minuto. Se l'import era spento o mancava l'anno di partenza, accendilo e indica l'anno: i file già consegnati si caricano al controllo successivo.

**Apri un ticket se:** dopo **Esegui ora** l'esito resta un errore, oppure lo scaricamento è completato ma l'ultimo giro non si aggiorna.

### Non riesco a eliminare un impegno

**Causa:** l'impegno è stato scelto a mano su una o più fatture («Impegno scelto a mano su … fatture»). Le fatture automatiche invece non bloccano: passano da sole agli altri impegni del contratto. Il ripristino di un impegno eliminato non riesce se nel frattempo il suo numero è stato usato da un altro impegno («Impegno … già presente»).

**Soluzione:** apri le fatture con origine **A mano** dal tab **Fatture** dell'impegno e, nel loro tab **Impegni**, premi **Torna automatico** o sposta la quota su un altro impegno, poi elimina. Per il ripristino correggi prima il numero dell'impegno che lo usa.

**Apri un ticket se:** l'impegno non ha quote a mano ma non si elimina.

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
