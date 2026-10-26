# Impegni pluriennali e import facoltativo dalla contabilità

Data: 2026-10-25. Stato: bozza da approvare. Roadmap voce 26.

## Perché

Sulla spesa UtenzePA serve a **programmare** a inizio anno capitoli e impegni e ad **accorgersi in tempo** quando il preventivato sta per essere superato. Non deve replicare la contabilità.

Gli enti che riusano UtenzePA si trovano in due situazioni:

- **Ente senza import** (il caso di default per il riuso): inserisce a mano solo quello che serve alla programmazione, cioè l'assestato del capitolo per anno e gli impegni con i contratti. Tutto il resto (impegnato, fatturato, rimanenza, sforamenti) lo calcola UtenzePA dalle fatture. Non inserisce liquidazioni, mandati, residui o variazioni.
- **Ente con import** (Montesilvano con Tinn): gli stessi dati arrivano ogni notte dalla contabilità e non si scrivono a mano. In più le liquidazioni dicono da quale impegno è stata pagata ogni fattura.

Il modello dell'applicazione deve essere **lo stesso** nei due casi. L'import compila gli stessi campi che l'ente senza import compila a mano: non esistono funzioni visibili solo con l'import, salvo l'indicazione «da contabilità» sui dati importati.

## Cosa cambia nell'applicazione

### 1. Impegni pluriennali: annualità dell'impegno

Oggi un impegno = numero + **un** esercizio + importo. Nella contabilità invece lo stesso numero (es. 2026/528/1) ha un importo per ogni anno di competenza: 2026, 2027, 2028. Le fatture del 2027 oggi sforano l'impegno o restano senza impegno.

Proposta: **l'impegno resta uno**, con numero, capitolo, fornitore, contratti, note e documenti, e ha **una o più annualità** (`budget_commitment_years`: `commitment_id`, `fiscal_year`, `amount`, unica per impegno + anno).

- **Ente senza import.** Nel form ci sono «Esercizio» e «Importo» come oggi; «+ Aggiungi anno» aggiunge le annualità successive. Nell'impegno annuale (quasi tutti) non cambia niente.
- **Allocazione** (`commitment-allocation.ts`): l'unità che si consuma è l'annualità, non l'impegno. Una riga con competenza 2027 consuma l'annualità 2027. (v1.48.0 sulle righe; dalla fase 2 sulle quote della fattura, sezione 3.)
- **Rimanenza, barre, spesa per capitolo e anomalie** si calcolano per annualità. La scheda impegno mostra una riga per anno.
- **Unicità**: il numero resta unico tra gli impegni non cancellati, come oggi. Le annualità stanno dentro.
- **Migration**: `fiscal_year` e `amount` di `budget_commitments` diventano la prima annualità, poi si rimuovono le colonne. Il ciclo up → down → up va verificato sui dati locali.

Alternativa scartata: una riga di impegno per ogni anno con lo stesso numero. Costringerebbe a ricollegare i contratti e i documenti anno per anno; per l'ente senza import è lavoro doppio.

### 2. Provenienza dei dati

Colonna `source` (`MANUAL` | `ACCOUNTING`, default `MANUAL`) su `budget_chapters`, `budget_chapter_spending`, `budget_commitments` e `budget_commitment_years`, più `external_key` (chiave nella contabilità, unica per tabella dove presente).

- Con `source = ACCOUNTING` i campi che arrivano dalla contabilità sono in sola lettura nella UI (badge «Da contabilità»). Restano modificabili quelli che la contabilità non ha: contratti collegati, note, tipi utenza ammessi e documenti.
- Per l'ente senza import è tutto `MANUAL`: non vede niente di nuovo.

### 3. Quote d'impegno della fattura (al posto dell'impegno sulla riga)

Rivisto il 2026-10-26. Una fattura si paga **a importo**, eventualmente da più impegni, e la ripartizione **non segue le righe**: spesso le righe non ci sono e la ragioneria divide a occhio. Casi trovati nelle liquidazioni 2025–2026 (408 fatture pagate da più impegni su 9.721; delle 12 presenti in UtenzePA nessuna ha quote che coincidono con gruppi di righe):

| Caso | Esempio |
|---|---|
| Impegno esaurito: il resto va sul successivo | A2A 825500337328: 13,36 € su 2024/522, 206,37 € su 2024/561, stesso capitolo |
| Quote fisse per capitolo | Engie canone servizio energia: 57.990,32 + 57.990,34 + 2.236,74 € su 3 capitoli; in UtenzePA 3 righe senza utenza di altri importi |
| Importi tondi | Engie 2200002322: 13 impegni da 500, 2.000, 10.000 € più il resto |
| Imponibile e IVA su impegni diversi | Hera 2017–2018: ~82% su un impegno, ~18% su un altro |

Quindi l'associazione **riga → impegno si elimina del tutto**. Escono da `invoice_lines` `commitment_id_fk`, `commitment_auto` e `commitment_fiscal_year`. Le righe restano per utenza, consumi e spesa per utenza/immobile.

Nuova tabella **`invoice_commitment_shares`** (quote): fattura, impegno, annualità (`fiscal_year`), importo, `source` (`AUTO` | `MANUAL` | `ACCOUNTING`).

Tre modi, uno esclude gli altri (mai quote miste sulla stessa fattura):

- **Automatico** (`AUTO`, default): **una sola quota per tutto il totale** (IVA inclusa; senza totale = somma delle righe). Effetto: le fatture con contratto e senza righe (canoni, 306 nel DB locale per 18.647,79 €) entrano nella spesa del capitolo dell'impegno. Più impegni candidati (stesso contratto, capitolo ed esercizio: integrazioni, sub-impegni; 46 gruppi su 256 nel DB locale) = il primo per numero finché ha rimanenza, la fattura intera. Il ricalcolo (`commitment-allocation.ts` sulla fattura invece che sulla riga) sceglie l'annualità come oggi per la riga: competenza = anno del periodo della fattura (inizio più vecchio e fine più recente delle righe, regole di `lineFiscalYear`), senza periodo = anno della data fattura; candidati = annualità degli impegni del contratto in testata in quell'esercizio, sul capitolo delle utenze delle righe (senza utenze o con capitoli diversi: solo se i candidati sono tutti dello stesso capitolo); prima annualità in ordine di numero con rimanenza, se esaurite l'ultima. Fatture in ordine di data e id. Nessuna divisione automatica.
- **A mano** (`MANUAL`): l'operatore divide la fattura in più quote (tab «Impegni»: impegno, annualità, importo) o sceglie a mano l'impegno della quota unica. Il ricalcolo non le tocca. Quote che non sommano al totale = anomalia. Impegno non eliminabile se ha quote a mano.
- **Dalla ragioneria** (`ACCOUNTING`): fattura liquidata = quote delle liquidazioni (una per liquidazione), che sostituiscono quelle automatiche o a mano. Le scrive solo l'import, che le riscrive se la liquidazione cambia.
- **Spesa per capitolo e rimanenza** dalle quote (capitolo dell'impegno, anno dell'annualità). Fattura senza quote (nessun contratto o nessun candidato): spesa per capitolo dalle righe, capitolo dell'utenza e anno della riga, come oggi.
- **Import PEC**: le quote sono della fattura, non delle righe, quindi sopravvivono alla sostituzione delle righe (`kept-commitment.ts` non serve più).
- **Migration**: dati locali 2026-10-26: 4.422 fatture con impegno, nessuna con righe su più impegni, capitoli o annualità, 0 miste auto/manuali → una quota per fattura (impegno + annualità delle righe, importo = somma delle righe, `MANUAL` se `commitment_auto = 0`). Down = impegno della quota su tutte le righe.
- Ente senza import: solo `AUTO` e `MANUAL`.

### 4. Cosa NON entra nell'applicazione

- **Liquidazioni e mandati non diventano entità.** L'ente senza import non li inserirebbe mai. Con l'import restano nelle tabelle di appoggio e servono solo a scrivere le quote `ACCOUNTING` e a segnalare le anomalie.
- Niente residui, variazioni, riaccertamenti, economie, SIOPE o piano dei conti.
- Niente disponibilità del capitolo copiata dalla contabilità: la rimanenza resta quella calcolata da UtenzePA, che conta anche le fatture arrivate e non ancora liquidate.
- I collegamenti impegno ↔ contratto restano di UtenzePA. L'import li **suggerisce** dal CIG dell'impegno (CIG = CIG del contratto, un solo contratto), mai li impone.

## Import (facoltativo)

### Formato neutro

Le tabelle di appoggio (`acc_*`) sono lo stesso tracciato per ogni ente e sono documentate nella guida:

| Tabella | Campi |
|---|---|
| `acc_chapters` | anno, capitolo, articolo, descrizione, stanziamento iniziale, assestato, speso (facoltativo) |
| `acc_commitments` | anno/num/sub, anno di competenza, capitolo, articolo, P.IVA o CF del creditore, importo, CIG, annullato |
| `acc_liquidations` | chiave liquidazione, impegno + competenza, IdentificativoSdI, numero e data della fattura, P.IVA del fornitore, importo, annullata |

Ogni giro sostituisce in blocco il contenuto delle tabelle di appoggio, poi un **applicatore** generico, uguale per tutti gli enti, le confronta con l'applicazione:

- **capitoli**: aggiorna assestato e iniziale su `budget_chapter_spending` dei capitoli già presenti in UtenzePA (perimetro = i capitoli che l'ente gestisce). I capitoli nuovi non si creano da soli: compaiono in un elenco «da aggiungere».
- **impegni**: crea o aggiorna gli impegni sui capitoli del perimetro, una annualità per anno di competenza, abbinando il fornitore per P.IVA/CF. Un impegno sparito o annullato in contabilità resta da noi, con una segnalazione.
- **liquidazioni**: abbinate alla fattura per **IdentificativoSdI** (esatto), altrimenti per fornitore + numero + data. Ogni liquidazione diventa una quota `ACCOUNTING` della fattura (impegno + competenza + importo), anche con più impegni: nessuna ripartizione sulle righe.
- **anomalie nuove**:
  - liquidazione senza fattura in UtenzePA (es. fatture Wind mancanti);
  - capitolo dell'utenza diverso da quello delle sue liquidazioni (si corregge l'anagrafica, non la fattura);
  - impegno della contabilità senza contratto suggeribile.

Le scritture dell'import le firma l'utente di sistema (`-1`), con audit sui campi cambiati.

### Due modi di riempire le tabelle di appoggio

1. **Caricamento CSV dalla UI** (Impostazioni → Contabilità, solo Admin): per l'ente che sa esportare dalla sua contabilità ma non vuole automatismi. Si carica un file per tabella, con lo stesso tracciato. È anche il modo per fare una correzione una tantum, come quella fatta il 2026-10-25 a mano.
2. **Adattatore automatico** (Tinn): container opzionale nel profilo compose `accounting`.
   - Di notte scarica il backup `gbak` (`.fbk`) via SFTP/FTPS, lo ripristina in un Firebird 3 locale ed esegue le query di estrazione verso i CSV del formato neutro su un volume condiviso.
   - Il backend importa i CSV come nel caso 1.
   - Il backend **non ha driver Firebird**: niente dipendenza nativa, niente codice Tinn nell'API.
   - Le query Tinn stanno nell'adattatore (`accounting/tinn/`): `GFBIPRN1` capitoli, `GFIMDEN1` impegni, `GFLIQUN1` + `GFPNCGN1` (`FE_ID_SDI_S`) liquidazioni con la fattura, `GFANCON1` creditori.

Accensione come l'import PEC: variabile `ACCOUNTING_IMPORT_DISABLED` (default `true`) + stato nel DB. Senza import la pagina mostra solo il caricamento CSV e il tracciato.

## Fasi (PR separate)

1. **Annualità dell'impegno** (migration, allocazione, scheda, form, guida). Serve a tutti, anche senza import: è il primo passo.
2. **Quote d'impegno della fattura** (sezione 3: migration, ricalcolo sulla fattura, tab «Impegni» della fattura, tab «Fatture» dell'impegno con le quote, spesa e anomalie, guida). Serve a tutti: copre gli impegni esauriti a metà fattura e le ripartizioni a mano.
3. **`source`/`external_key` + formato neutro + applicatore + caricamento CSV** (sezione 2, tabelle `acc_*`, pagina Impostazioni → Contabilità, anomalie, guida con il tracciato).
4. **Adattatore Tinn** (container, query, profilo compose, documentazione per l'installazione). Si fa quando arriva il DB del Comune.

## Da verificare sul DB del Comune

- Importo delle annualità passate: in `GFIMDEN1` lo stesso impegno si ripete negli esercizi successivi (riaccertamento). Bisogna capire se l'importo dell'ultimo esercizio è il definitivo o il residuo; la roadmap vuole il definitivo.
- Quale campo di `GFBIPRN1` è l'assestato (`PREV_AGG_ANNO` o `PREV_COMP_RES`) e quale l'iniziale (`PREV_COMP_RES_INI`): confronto con la schermata «Competenza».
- Charset (WIN1252?), dialect 1 (importi double, si arrotondano al centesimo).
- Trasporto: SFTP/FTPS, orario e dimensione del `.fbk`.

## Decisioni (utente, 2026-10-25)

- Perimetro degli impegni: **solo i capitoli già presenti in UtenzePA**.
- «Spesa ragioneria» del capitolo (`budget_chapter_spending.amount`): **importata come liquidato** (somma delle liquidazioni non annullate sugli impegni del capitolo × anno di competenza), in sola lettura se importata.
- (2026-10-26) **Nessun impegno sulle righe**: l'impegno è della fattura. In automatico una sola quota per tutto l'importo; più quote solo con la divisione a mano o con l'import della ragioneria (sezione 3).
