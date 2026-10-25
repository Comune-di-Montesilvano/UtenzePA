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
- **Allocazione** (`commitment-allocation.ts`): l'unità che si consuma è l'annualità, non l'impegno. Una riga con competenza 2027 consuma l'annualità 2027. `invoice_lines.commitment_id_fk` resta sull'impegno e l'anno è già quello della riga (`lineYearSql`): niente FK nuova sulla riga.
- **Rimanenza, barre, spesa per capitolo e anomalie** si calcolano per annualità. La scheda impegno mostra una riga per anno.
- **Unicità**: il numero resta unico tra gli impegni non cancellati, come oggi. Le annualità stanno dentro.
- **Migration**: `fiscal_year` e `amount` di `budget_commitments` diventano la prima annualità, poi si rimuovono le colonne. Il ciclo up → down → up va verificato sui dati locali.

Alternativa scartata: una riga di impegno per ogni anno con lo stesso numero. Costringerebbe a ricollegare i contratti e i documenti anno per anno; per l'ente senza import è lavoro doppio.

### 2. Provenienza dei dati

Colonna `source` (`MANUAL` | `ACCOUNTING`, default `MANUAL`) su `budget_chapters`, `budget_chapter_spending`, `budget_commitments` e `budget_commitment_years`, più `external_key` (chiave nella contabilità, unica per tabella dove presente).

- Con `source = ACCOUNTING` i campi che arrivano dalla contabilità sono in sola lettura nella UI (badge «Da contabilità»). Restano modificabili quelli che la contabilità non ha: contratti collegati, note, tipi utenza ammessi e documenti.
- Per l'ente senza import è tutto `MANUAL`: non vede niente di nuovo.

### 3. Assegnazione della riga di fattura

`invoice_lines.commitment_auto` (booleano) diventa `commitment_source`: `AUTO` | `MANUAL` | `ACCOUNTING`.

- `AUTO`: allocazione automatica (oggi `commitment_auto = 1`).
- `MANUAL`: scelta a mano, mai toccata (oggi `commitment_auto = 0`).
- `ACCOUNTING`: impegno dato dalla liquidazione. Lo scrive solo l'import, che lo riscrive se la liquidazione cambia; l'allocazione automatica non lo tocca. Nella riga si legge «Liquidata su <impegno>».
- Ente senza import: solo `AUTO` e `MANUAL`, cioè esattamente come oggi.

### 4. Cosa NON entra nell'applicazione

- **Liquidazioni e mandati non diventano entità.** L'ente senza import non li inserirebbe mai. Con l'import restano nelle tabelle di appoggio e servono solo a scrivere `commitment_source = ACCOUNTING` sulle righe e a segnalare le anomalie.
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
- **liquidazioni**: abbinate alla fattura per **IdentificativoSdI** (esatto), altrimenti per fornitore + numero + data. Le righe ricevono l'impegno della liquidazione (`ACCOUNTING`). Con più liquidazioni su impegni diversi la ripartizione segue il capitolo dell'utenza della riga; se non è univoca le righe restano `AUTO` e parte un'anomalia.
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
2. **`commitment_source` sulle righe + `source`/`external_key`** (migration, sola lettura nella UI). Senza import nessun cambiamento visibile.
3. **Formato neutro + applicatore + caricamento CSV** (tabelle `acc_*`, pagina Impostazioni → Contabilità, anomalie, guida con il tracciato).
4. **Adattatore Tinn** (container, query, profilo compose, documentazione per l'installazione). Si fa quando arriva il DB del Comune.

## Da verificare sul DB del Comune

- Importo delle annualità passate: in `GFIMDEN1` lo stesso impegno si ripete negli esercizi successivi (riaccertamento). Bisogna capire se l'importo dell'ultimo esercizio è il definitivo o il residuo; la roadmap vuole il definitivo.
- Quale campo di `GFBIPRN1` è l'assestato (`PREV_AGG_ANNO` o `PREV_COMP_RES`) e quale l'iniziale (`PREV_COMP_RES_INI`): confronto con la schermata «Competenza».
- Charset (WIN1252?), dialect 1 (importi double, si arrotondano al centesimo).
- Trasporto: SFTP/FTPS, orario e dimensione del `.fbk`.

## Decisioni (utente, 2026-10-25)

- Perimetro degli impegni: **solo i capitoli già presenti in UtenzePA**.
- «Spesa ragioneria» del capitolo (`budget_chapter_spending.amount`): **importata come liquidato** (somma delle liquidazioni non annullate sugli impegni del capitolo × anno di competenza), in sola lettura se importata.
