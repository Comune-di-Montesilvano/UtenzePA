# Roadmap: estensione del perimetro di UtenzePA al patrimonio

Aggiornata: 2026-10-01

Obiettivo: portare UtenzePA da gestionale delle utenze a gestionale del **patrimonio** comunale (immobili, contratti, impianti, inventario), sfruttando i dati già presenti in `W:\PATRIMONIO`.

Ogni voce qui sotto è **da approfondire**: prima di implementarla serve il solito giro domande → spec in `docs/superpowers/specs/` → piano. Le fonti sono già convertite in JSON (non committate, contengono dati reali):

- `.audit-w/immobiliare/inventory.json`: inventario file di `W:\PATRIMONIO\4_IMMOBILIARE` (22.275 file, solo metadati)
- `.audit-w/immobiliare/excel/`: 688/689 fogli di calcolo di `4_IMMOBILIARE` in JSON (`_index.json` → percorso originale)
- `.audit-w/excel/`: fogli di calcolo di `W:\PATRIMONIO\2_ UTENZE` in JSON

I PDF (circa 12.000) non sono stati estratti: si leggono solo su richiesta, per cartelle mirate.

## Ordine proposto

| # | Funzione | Stato |
|---|---|---|
| 1 | Contratti immobiliari (unificazione Concessioni) | codice fatto su `feat/contratti-immobiliari`; pulizia/import dati in attesa degli impianti |
| 2 | Inventario patrimoniale e catasto | da approfondire |
| 3 | Impianto unificato | codice fatto su `feat/contratti-immobiliari` (spec `docs/superpowers/specs/2026-10-02-impianti-design.md`); riclassificazione immobili e import consistenze in migrazione manuale dei dati |
| 4 | Complessi | da approfondire |
| 5 | Aree verdi | da approfondire |
| 6 | Fatture per utenza | da approfondire |
| 7 | Contratti di servizio e manutenzione | da approfondire |
| 8 | Permessi di scrittura granulari | da approfondire |

Gli impianti (3) sono stati anticipati: circa 240 "immobili" Access sono in realtà impianti (punti luce, fontane, pompe, semafori), e separarli prima rende pulita l'anagrafe su cui poggerà l'inventario (2).

## 1. Contratti immobiliari

Registro unico di locazioni, concessioni, comodati, assegnazioni di alloggi, occupazioni di suolo, attivi e passivi, con scadenzario, rinnovo tacito e preavviso. Unifica il modulo Concessioni (oggi misto di contratti, destinazioni d'uso e note di verifica). Dettagli nella spec.

## 2. Inventario patrimoniale e catasto

Fonti (`4_IMMOBILIARE/ricostruzione immobili/`):

| Fonte | Righe | Contenuto |
|---|---|---|
| `elenchi patrimonio erika 21.7.2022/registri imm xls 2021 montesilvano.xls` | 2.016 | schede patrimoniali: ID scheda, fabbricato/terreno, stato patrimoniale, aliquota di ammortamento |
| `elenchi patrimonio erika 21.7.2022/trasp terr 2021 montesilvano.xls` | 1.605 | terreni: cespite, classificazione, superficie, foglio, particella |
| `elenchi patrimonio erika 21.7.2022/trasp fabb 2021 montesilvano.xls` | 144 | fabbricati con unità immobiliari, classificazione, mq |
| `elenchi patrimonio erika 21.7.2022/trasp 2021 strade montesilvano.xls` | 159 | strade: tipo, classificazione |
| `adempimenti/MEF/inventario per adempim MEF 2016 ORIG.xls`, `2017 LAVORI PER INVIO MASSIVO MEF.xlsx` | 1.636 | censimento annuale beni PA al MEF |
| `adempimenti/TRASPARENZA/immobili 2016 per trasparenza.xlsx` | 544 | Amministrazione trasparente, sez. 14.1 patrimonio immobiliare |
| `ELENCO FASCICOLI ARCHIVIO_ LAVORO STAGISTA 2018/*` | ~130 | alloggi ERP, locali cabine/sollevamenti, terreni e strade non accatastate |
| `FONTE URBANISTICA/GEOM DI LORITO/cessioni aree 2002–2008` | ~380 | aree cedute al Comune da lottizzazioni |

Da approfondire:

- terreni come nuova tipologia di bene (oggi l'app ha 477 immobili e quasi nessun terreno);
- unità immobiliari catastali (foglio/particella/subalterno) distinte dall'immobile "gestionale";
- classificazione patrimoniale (demaniale, indisponibile, disponibile) e stato;
- valori e ammortamento: probabilmente fuori scope (contabilità economico-patrimoniale della ragioneria), da chiarire;
- export generati dall'app per il censimento MEF e per la trasparenza;
- provenienza del bene: federalismo demaniale, beni confiscati (via Adige 12/14, via L'Aquila 11/13), acquisti, cessioni da lottizzazione;
- riconciliazione con i 477 immobili attuali (chiave: catasto + indirizzo).

## 3. Impianto unificato

Generalizzare `thermal_plants` (v1.6.0) in un'entità **Impianto** con tipo e dati specifici, sempre legata all'immobile, con **scadenzario delle verifiche periodiche** e avvisi in dashboard. Da non confondere con la tipologia di immobile "Impianto" (v1.3.0): chiarire il naming.

Fonti (`4_IMMOBILIARE/01_CONSISTENZE_CENSIMENTI/CONSISTENZE 2025/`, salvo dove indicato):

| Tipo | Fonte | Contenuto |
|---|---|---|
| Termico | già in app (46 impianti) | potenza, VVF/INAIL, climatizzazione |
| Ascensori | `02_CONSISTENZA ASCENSORI 2025/0 REGISTRO ascensori comunali.xlsx` + schede anagrafiche | ~10 impianti, matricola, collaudo, costruttore, scadenzario verifiche periodiche 2024–2025 |
| Antincendio | `01_CONSISTENZA ANTINCENDIO 2025/` | ~50 edifici: estintori (matricola, tipo, kg, carica), idranti, naspi, attacchi VVF; schede con corpi scaldanti e destinazione d'uso dei locali |
| Fotovoltaico | `04_CONSISTENZA IMPIANTI FOTOVOLTAICI/` | 1 impianto (Trisi, 17 kWp, convenzione GSE SSP) |
| Pubblica illuminazione | `03_AREE_STRADE_e_P.ILL/3_ ILLUMINAZIONE PUBBLICA/3_2005_2014_CPL/` | 8.371 punti luce, 123 quadri (2014); contratto ENGIE 2024–2033 in `1_2024_2033_ENGIE/` |
| Semafori | `06_CONSISTENZA P.I - SEMAFORI/` | ~14 impianti semaforici e contabici |
| Fontane | `07_ FONTANE/`, `03_AREE.../8_ FONTANE _PRESE ACQUA/` | 34 fontane con contratto di manutenzione, contatori |

Da approfondire: livello di dettaglio (impianto intero vs componenti, es. singolo estintore o singolo punto luce), verifiche obbligatorie per tipo (periodicità di legge), legame con i contratti di manutenzione (voce 7).

Rifiniture aperte (dalla revisione finale del codice, 2026-10-02, rimandate):

- dialog impianto: cambiando tipo, i campi dei dati tecnici nascosti mantengono la validazione → "Salva" disattivato senza errore visibile se c'era un valore non valido;
- `GET /plants/:id` su impianto eliminato risponde `null` → il dialog aperto da `/plants?selectedId=<eliminato>` va in errore (serve 404 o controllo nel frontend);
- presidi antincendio non rimossi se il tipo cambia via API diretta (la UI blocca il cambio);
- impianti dismessi contati nel riepilogo verifiche e in "impianti senza posizione";
- periodicità proposte nel tab Verifiche calcolate solo all'apertura del dialog (non seguono cambio tipo/potenza);
- dialog utenza carica l'elenco impianti con tutte le relazioni solo per la select (endpoint leggero di opzioni);
- codice impianto non ripulito dagli spazi in modifica via API diretta se uguale all'attuale.

## 4. Complessi

Entità che raggruppa immobili gestiti come un tutt'uno (plesso scolastico, cimitero, stadio, "Edificio con 6 alloggi contrada giardino"). Non è una tipologia (v1.3.0 ha 4 tipologie fisse, l'utente ha escluso "Struttura" e "Altro"). Semi: `assets.associated_building`; abbinamento istituto scolastico → plesso dal report di pulizia delle concessioni (voce 1).

## 5. Aree verdi

Fonti (`03_AREE_STRADE_e_P.ILL/1_AREE VERDI/MANUTENZIONE VERDE/`):

- `Aree Verdi in Global lotto 1.xls`: 581 aree verdi (codice, nome, stato, mq, quartiere, ID Global);
- `GIS aggiornato 23-01-2013 excel 2003.xls` e `A3 GIS aggiornato 23-01-2013 PARCHI.xls`: superfici per strada/parco divise in prati, aiuole, scarpate, aree pedonali.

Da approfondire: area verde come tipo di bene con superfici per tipologia, legame con il contratto di manutenzione del verde.

## 6. Fatture per utenza

Oggi le fatture si legano a contratto e capitolo, non all'utenza. Fonte pronta: fatture ACA 2025–2026 (490 fatture, `.audit-w/aca_fatture_2025_2026.json`). Serve `utility_id_fk` sulla fattura per avere spesa reale per utenza/immobile e anomalie "fattura su utenza cessata". Rimandata dall'utente (si è fatta solo la pulizia dati).

## 7. Contratti di servizio e manutenzione

Fonte: `W:\PATRIMONIO\2_ UTENZE\2_UFFICIO ASSOCIATO GESTIONE INTEGRATA ENERGIA\adempimenti servizi\costo storico\Attività di competenza e costo storico .xlsx`: per ambito (impianti elettrici, termici, idrosanitari, ascensori, fontane, semafori, illuminazione pubblica, sollevamenti, videosorveglianza) ditta, costo 2022–2024, scadenza, determina. Da collegare a impianti (voce 3) e immobili.

## 8. Permessi di scrittura granulari

Oggi i ruoli sono tre (Admin, Operatore, Lettore) e chi scrive scrive su tutto. Con il perimetro allargato (contratti immobiliari, impianti, inventario) serve poter dare la scrittura per area: per esempio un ufficio che gestisce solo i contratti immobiliari, un altro solo utenze e impianti. Da approfondire: modello (permessi per modulo o per gruppi), impatto su guard backend e direttiva `appHasRole` frontend, migrazione dei ruoli esistenti. Il codice fiscale delle controparti è già oscurato per il Lettore (v1.7.0).

## Fuori scope (decisioni prese)

- **Condomini**: non è ciò che serve (2026-10-01).
- **Registro agibilità 1986–2023**: edilizia privata (SUE), non patrimonio comunale.
- **Pratiche lavori** (CUP, gare, SAL, espropri): archivio progetti; al massimo in futuro un elenco "interventi per immobile".
- **Assegnatari case comunali "canoni 2017"** (305 righe con nucleo familiare): non si importano, dati personali eccedenti; basta il report da 45 righe con oscuramento (voce 1).
- **Incassi/pagamenti dei canoni**: il registro contratti non gestisce rate né pagamenti.
