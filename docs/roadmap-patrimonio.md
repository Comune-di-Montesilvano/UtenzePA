# Roadmap: estensione del perimetro di UtenzePA al patrimonio

Aggiornata: 2026-10-05

Obiettivo: portare UtenzePA da gestionale delle utenze a gestionale del **patrimonio** comunale (immobili, contratti, impianti, inventario), sfruttando i dati già presenti in `W:\PATRIMONIO`.

Ogni voce qui sotto è **da approfondire**: prima di implementarla serve il solito giro domande → spec in `docs/superpowers/specs/` → piano. Le fonti sono già convertite in JSON (non committate, contengono dati reali):

- `.audit-w/immobiliare/inventory.json`: inventario file di `W:\PATRIMONIO\4_IMMOBILIARE` (22.275 file, solo metadati)
- `.audit-w/immobiliare/excel/`: 688/689 fogli di calcolo di `4_IMMOBILIARE` in JSON (`_index.json` → percorso originale)
- `.audit-w/excel/`: fogli di calcolo di `W:\PATRIMONIO\2_ UTENZE` in JSON

I PDF (circa 12.000) non sono stati estratti: si leggono solo su richiesta, per cartelle mirate.

## Ordine proposto

| # | Funzione | Stato |
|---|---|---|
| 1 | Contratti immobiliari (unificazione Concessioni) | fatto, v1.7.0 (dati: registro ripulito e import fonti sul DB locale, da portare in produzione) |
| 2 | Inventario patrimoniale e catasto | da approfondire |
| 3 | Impianto unificato | fatto, v1.7.0 (immobili convertiti in impianti e consistenze 2025 importate sul DB locale, da portare in produzione) |
| 4 | Complessi | da approfondire |
| 5 | Aree verdi | da approfondire |
| 6 | Fatture per utenza | fatto, v1.10.0 (fatture ACA 2025–2026 caricate sul DB locale, da portare in produzione; import FatturaPA in un giro successivo) |
| 7 | Contratti di servizio e manutenzione | da approfondire (ditte esterne sugli impianti; i gestori manutenzione sono stati sostituiti in v1.9.0) |
| 8 | Permessi di scrittura granulari | da approfondire |
| 9 | Soggetti terzi (controparti + fornitori) | fatto, v1.8.0 (pulizia dati fatta sul DB locale; restano CF delle persone, P.IVA Open Fiber, 2 locatori SPRAR) |
| 10 | Tipologie contrattuali ARERA (al posto delle finalità d'uso) | fatto, v1.8.0 (valorizzazione delle tipologie sul DB locale da fare) |
| 11 | Aggregati utenze (da eliminare) | fatto, v1.8.1 (funzione assegnata a 118 immobili sul DB locale; 7 senza funzione, 10 utenze SPRAR senza capitolo SPRAR da girare alla ragioneria) |
| 12 | Costi a carico calcolato | fatto, v1.8.1, con volture (26 utenze da volturare, 8 attive, da verificare dall'anomalia) |
| 13 | Schede entità: rifiniture | fatto in v1.11.2 (restano 3 verifiche E2E) |
| 14 | Schede di fornitori, capitoli, fatture | da fare |
| 15 | UI e identità (elenchi, filtri, dark mode, sidebar, nome) | elenchi, filtri, segnalazioni e sidebar fatti in v1.11.0; creazione al volo dalle schede ("+" sulle select, "Nuovo …" sui collegamenti); dark mode e nome da approfondire |
| 16 | Dashboard e mappa | mappa a livelli in v1.11.0 (filtri a perimetro, inattivi nascosti, ricerca nel Comune); dashboard per ultima |
| 17 | Impegni di spesa (contratto ↔ capitolo) | fatto, v1.10.0 (impegni ACA 2025–2026 senza numero né importo, da completare con la ragioneria) |
| 18 | Pulizia entità e incongruenze del modello | fatto: parte 1 v1.9.0 (tabelle morte, aggregati immobili, gestori manutenzione → manutenzione calcolata), parte 2 v1.9.1 (campi doppi) |
| 19 | Allegati di contratti, immobili e impianti | da approfondire |
| 20 | Assestato dei capitoli e disponibilità | da fare |

I dati si correggono solo sul DB locale; la produzione si allinea con export del DB locale e import (nessuno script o migration di dati).

Ordine di lavoro concordato (2026-10-02): prima i dati (9–12, 6), poi l'UI (13–15), poi complessi e catasto (4, 2), per ultime mappa e dashboard (16). La mappa non si tocca finché non ci sono i complessi.

Gli impianti (3) sono stati anticipati: circa 240 "immobili" Access sono in realtà impianti (punti luce, fontane, pompe, semafori), e separarli prima rende pulita l'anagrafe su cui poggerà l'inventario (2).

## 1. Contratti immobiliari

Registro unico di locazioni, concessioni, comodati, assegnazioni di alloggi, occupazioni di suolo, attivi e passivi, con scadenzario, rinnovo tacito e preavviso. Unifica il modulo Concessioni (oggi misto di contratti, destinazioni d'uso e note di verifica). Dettagli nella spec.

**Rimandato (richiesta utente 2026-10-02, da riprendere quando ci saranno dati da collegare): contratti collegati agli impianti.** Un contratto immobiliare oggi si collega solo a immobili, ma l'oggetto può essere un impianto: esempio reale, un contratto con un condominio per un'antenna della Polizia Locale, senza l'antenna in anagrafe. Serve: tipo d'impianto "Antenna / ripetitore", collegamento contratto ↔ impianti N-N (come `utilizer_grant_assets`, tab nella scheda), anomalia in dashboard "Contratti immobiliari senza immobile né impianto" al posto di quella attuale (73 contratti senza immobile al 2026-10-02). Caso reale già nei dati: contratto 2447 (locazione passiva di area condominiale per un ponte radio della Polizia Locale, senza immobile). PR separata; design già abbozzato (tipo `ANTENNA`, tabella `utilizer_grant_plants`, tab Impianti nella scheda contratto e Contratti nella scheda impianto).

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
- riconciliazione con i 477 immobili attuali (chiave: catasto + indirizzo);
- **foglio e particella automatici da SIT**: ricavarli dalle coordinate dell'immobile invece di inserirli a mano (tab Catasto della scheda). Il geoportale comunale https://montesilvano.geoportal.it/ è Autodesk MapGuide (viewer `cassini/mapguide.aspx`), senza servizi OGC visibili dalla home: individuare layer catasto ed endpoint (WMS/WFS, mapagent) dalle richieste di rete del viewer o dall'ufficio SIT. Alternativa da verificare: WMS cartografia catastale dell'Agenzia delle Entrate (INSPIRE, licenza aperta) con `GetFeatureInfo`. Uso: proposta con conferma dell'utente (singola o batch), mai sovrascrivere dati inseriti a mano; il subalterno non è ricavabile.

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

- ~~dialog impianto: cambiando tipo, i campi dei dati tecnici nascosti mantengono la validazione~~ (risolto in v1.7.1: il gruppo del tipo non corrente è disabilitato);
- `GET /plants/:id` su impianto eliminato risponde `null` → il dialog aperto da `/plants?selectedId=<eliminato>` va in errore (serve 404 o controllo nel frontend);
- presidi antincendio non rimossi se il tipo cambia via API diretta (la UI blocca il cambio);
- impianti dismessi contati nel riepilogo verifiche e in "impianti senza posizione";
- periodicità proposte nel tab Verifiche calcolate solo all'apertura del dialog (non seguono cambio tipo/potenza);
- dialog utenza carica l'elenco impianti con tutte le relazioni solo per la select (endpoint leggero di opzioni);
- codice impianto non ripulito dagli spazi in modifica via API diretta se uguale all'attuale;
- **presidi antincendio spuri dall'import**: in ogni impianto antincendio la nota "(collaudo ogni 6 anni…)" è stata importata come 2 "estintori", più la tabella riassuntiva superfici/piani dell'impianto 354. Criterio: `equipment_type='EXTINGUISHER' AND (agent IS NULL OR agent NOT IN ('polvere','co2')) AND capacity IS NULL` (88 righe). Soft-deleted sul DB locale (2026-10-02).

## 4. Complessi

Entità che raggruppa immobili gestiti come un tutt'uno (plesso scolastico, cimitero, stadio, "Edificio con 6 alloggi contrada giardino"). Non è una tipologia (v1.3.0 ha 4 tipologie fisse, l'utente ha escluso "Struttura" e "Altro"). Semi: `assets.associated_building`; abbinamento istituto scolastico → plesso dal report di pulizia delle concessioni (voce 1). Da fare prima di rimettere mano alla mappa (voce 16).

## 5. Aree verdi

Fonti (`03_AREE_STRADE_e_P.ILL/1_AREE VERDI/MANUTENZIONE VERDE/`):

- `Aree Verdi in Global lotto 1.xls`: 581 aree verdi (codice, nome, stato, mq, quartiere, ID Global);
- `GIS aggiornato 23-01-2013 excel 2003.xls` e `A3 GIS aggiornato 23-01-2013 PARCHI.xls`: superfici per strada/parco divise in prati, aiuole, scarpate, aree pedonali.

Da approfondire: area verde come tipo di bene con superfici per tipologia, legame con il contratto di manutenzione del verde.

## 6. Fatture per utenza

Fatto in v1.10.0 insieme alla voce 17: spec `docs/superpowers/specs/2026-10-05-fatture-per-utenza-impegni-design.md`. Fattura = testata (fornitore, totale documento IVA inclusa, imponibile facoltativo) + righe per utenza (importo IVA inclusa, impegno, periodo, consumo, codice fornitura, tutto facoltativo tranne l'importo); spesa calcolata per utenza, immobile e capitolo; anomalie "Fatture su utenze cessate", "Utenze con capitolo non impegnato sul contratto", "Righe fattura senza utenza". Dati sul DB locale (2026-10-05): 490 fatture ACA 2025–2026 con una riga ciascuna (utenza dal codice servizio, impegno da capitolo e anno della fattura; 324 totali a 3 decimali arrotondati a 2), fornitore valorizzato sulle 185 fatture esistenti. Restano: import FatturaPA/tracciati dei fornitori (anteprima, abbinamento per P.IVA e POD/PDR, deduplica), consumi da fattura nel tab Consumi (`ConsumptionSource.INVOICE`), righe delle 185 fatture storiche (2019–2023, solo testata). 

Gotcha per l'import FatturaPA (da una fattura elettronica A2A luce, 2026-10-05):

- una fattura = un POD e un mese, con 4 `DettaglioLinee` (vendita energia, uso rete, oneri di sistema, imposte), tutte con periodo e POD in `AltriDatiGestionali` (`TipoDato` = POD): diventano 4 righe sulla stessa utenza, descrizione dalla linea;
- importi di riga **senza IVA** (`PrezzoTotale` + `AliquotaIVA`), le nostre righe sono IVA inclusa: moltiplicare riga per riga può scostarsi di qualche centesimo dal totale documento (la scheda mostra la differenza). Valutare imponibile e aliquota sulla riga quando si fa l'import;
- split payment (`EsigibilitaIVA` = S): il fornitore incassa l'imponibile (`ImportoPagamento`), il Comune versa l'IVA all'Erario: il costo per l'ente resta IVA inclusa (conferma della scelta);
- abbinamenti che funzionano già sul DB locale: P.IVA del cedente → soggetto terzo; `CodiceCIG` → contratto (`cig_contract`); le ultime 7 cifre di `CodiceCommessaConvenzione` = numero ordine ODA (`consip_order`), utile come controllo; POD → utenza (`utility_id`);
- consumo (kWh) e matricola del contatore solo nel testo di `Causale`: serve un parser per fornitore, non c'è un campo strutturato;
- l'impegno (contratto + capitolo dell'utenza + esercizio) può non esistere ancora: l'import deve crearlo o segnalarlo, mai inventare il capitolo;
- il PDF della fattura è allegato in base64 (quasi tutto il peso del file): da decidere se conservarlo collegato alla fattura.

Rifiniture rimandate dalla revisione finale di v1.10.0, non bloccanti:

- id di utenza inesistente su una riga, o `null` su capitolo/esercizio in PATCH di un impegno: 500 invece di 400 (la UI non li invia);
- "costi del mese" in dashboard calcolati con l'ora del container (UTC): nelle prime ore del giorno 1 mostra ancora il mese prima;
- un impegno usato solo da fatture eliminate non si può eliminare (il conteggio include le fatture cancellate);
- anomalia "Utenze con capitolo non impegnato sul contratto": usa i contratti non chiusi, mentre la colonna contratti mostra quelli correnti (scadenza);
- scheda utenza: i capitoli impegnati non si azzerano se l'utenza non ha più contratti aperti;
- manca un test di rollback della transazione delle righe fattura.

## 7. Contratti di servizio e manutenzione

Fonte: `W:\PATRIMONIO\2_ UTENZE\2_UFFICIO ASSOCIATO GESTIONE INTEGRATA ENERGIA\adempimenti servizi\costo storico\Attività di competenza e costo storico .xlsx`: per ambito (impianti elettrici, termici, idrosanitari, ascensori, fontane, semafori, illuminazione pubblica, sollevamenti, videosorveglianza) ditta, costo 2022–2024, scadenza, determina. Da collegare a impianti (voce 3) e immobili.

Decisione utente (2026-10-03): i gestori manutenzione (voce 18) si sostituiscono con i contratti di manutenzione. La manutenzione può essere a carico del Comune (in proprio), del locatore o del conduttore (dal contratto immobiliare), oppure di una ditta esterna con contratto di manutenzione. Stesso schema di "A carico di" della voce 12: dato reale = contratto, stato calcolato.

## 8. Permessi di scrittura granulari

Oggi i ruoli sono tre (Admin, Operatore, Lettore) e chi scrive scrive su tutto. Con il perimetro allargato (contratti immobiliari, impianti, inventario) serve poter dare la scrittura per area: per esempio un ufficio che gestisce solo i contratti immobiliari, un altro solo utenze e impianti. Da approfondire: modello (permessi per modulo o per gruppi), impatto su guard backend e direttiva `appHasRole` frontend, migrazione dei ruoli esistenti. Il codice fiscale delle controparti è già oscurato per il Lettore (v1.7.0).

## 9. Soggetti terzi (controparti + fornitori)

Fatto in v1.8.0: spec `docs/superpowers/specs/2026-10-02-soggetti-terzi-design.md`. Il testo più sotto è il censimento di partenza.

**Pulizia dati (DB locale, 2026-10-02)**: report per categoria generato in sola lettura (225 soggetti attivi dopo la migration). Fatto: soft delete dei 111 soggetti senza alcun collegamento (fontane, semafori, contatori, note di lavoro, `ACA_TERZI`, `comune`…), restano 114 attivi. Da fare, una lista alla volta con conferma:

- ~~non-soggetti con contratto~~ (fatto 2026-10-02): 13 soggetti fittizi ("SPRAR", "mobilità elettrica", parchi, "CANILE COMUNALE", "LOCALI EX FEA"…) eliminati, testo nelle note dei contratti ("Controparte indicata nell'import: «…»"); i contratti restati senza parte sono nell'anomalia "senza controparte", da completare. Il parco gestito dall'Azienda Speciale ora ha lei come parte. Rinominati i soggetti nascosti nella descrizione (Delfino Pescara 1936, Polisportiva SSD Roma Marconi, Egenia, Questura di Pescara) e completato il locatore dell'autoparco di via Danubio (società, con P.IVA, da offerta MePA e determina di aggiudicazione 2023). "Centro sociale anziani" non è un soggetto: il contratto di via Marrone era un doppione della locazione passiva dal condominio (unito), quello di via Vittorio Emanuele II un uso diretto del Comune (eliminato). Ex autoparco di via Meno segnato dismesso;
- ~~tipo e nominativi~~ (fatto 2026-10-02): 38 persone fisiche convertite (cognome/nome separati), 4 righe con due persone divise in due soggetti sullo stesso contratto; completati dai documenti in `W:` i soggetti 1023 (preliminare di locazione 2020, con CF), 1230 (tre persone, via Napoli 7), 1266 (impresa individuale; CF/P.IVA illeggibili nella scansione). Restano giuridiche le ditte individuali (La Playa, Mercato 25, Falù, Falg Sistem), F.lli Filippone Mezzopreti, Immobiliare Pianella. **Ancora da risolvere**: i soggetti 1233 e 1242, locatori SPRAR via Danubio 81 con soli cognomi, nessun contratto trovato in `W:`. Le persone fisiche non hanno CF: il Salva della loro scheda resta bloccato finché non si inserisce;
- ~~doppioni~~ (fatto 2026-10-02): unite le due Vodafone (Vodafone Italia, ex Omnitel), i Carabinieri (con il comodato importato dal vecchio modulo Concessioni unito nella locazione dello stesso immobile) e le due Vincenziane (Gruppi di Volontariato Vincenziano: "Dame della Carità" è il nome storico; via Adige assegnata con delibera GC 19/2017 per la Casa della Mamma e del Bambino). "AB CASE" è un locatore SPRAR vero, resta. Restano 103 soggetti attivi;
- da verificare nel registro contratti (emerso dalla pulizia): campo sportivo via Foscolo con due locazioni Vodafone (2441 dal 2000 senza scadenza, 2440 2005–2023, probabile rinnovo); diverse locazioni attive "in corso" con scadenza passata (2018–2023); immobile confiscato 2260 registrato in via Adige 12, i documenti dicono via Adige 14;
- ~~fornitori~~ (fatto 2026-10-02): P.IVA, CF e sede da documenti in `W:` per ENEIDE, Engie Servizi (incorpora Conversion&Lighting dal 2024), AGSM AIM Energia, Dolomiti Energia; CF di Estra ed Enel Energia riportati a 11 cifre; `TERZI` eliminato con le convenzioni CONSIP 55 e 61 (usate solo da contratti già eliminati). **Resta**: Open Fiber senza P.IVA (nessun documento in `W:`), da inserire a mano. Restano 102 soggetti attivi.

**Portare in produzione**: la migration controlla prima di ogni DDL P.IVA/CF duplicati, CF oltre 16 caratteri e riferimenti orfani e si ferma con l'elenco (le DDL MySQL fanno commit implicito: un errore a metà lascerebbe lo schema da sistemare a mano). Le FK verso `suppliers`/`utilizer` si leggono da `information_schema` perché `InitialSchema` ne crea alcune (CONSIP, fatture, utenze, contratti immobiliari) che il DB locale non ha; idem l'indice UNIQUE `REL_4865…` su `consip_agreement.supplier_id` (vecchio OneToOne), che la migration elimina. Prima del rilascio: backup, poi verificare i log di avvio.

Rifiniture aperte (dalla revisione finale, rimandate):

- salvataggio parziale del contratto immobiliare se `party_ids` contiene una parte non valida (`super.update` prima di `resolveParties`);
- la ricerca `q` dei soggetti cerca anche nel CF: un Lettore può dedurre per tentativi un CF oscurato;
- picker del fornitore (contratti, CONSIP) con tutti i soggetti giuridici finché la pulizia non è finita;
- eliminazione di un soggetto collegato senza avviso (sparisce da fatture e contratti);
- `down()` della migration fragile se due fornitori hanno la stessa ragione sociale (`suppliers.company_name` UNIQUE);
- filtro utenze per parte: la sottoquery non esclude gli immobili eliminati.

Gotcha emersi:

- **Ripristino dalla UI non fa nulla in tutta l'app**: `AbstractComponent.onRestore` manda `deleted:false`, ma `AbstractEntity` lo esclude in serializzazione (`@Exclude({toPlainOnly})`) e il PATCH parte vuoto. Preesistente.
- **`updated_by` esposto con `otp`/`otp_expiry`** di `SystemUser` (nessun `select:false`/`@Exclude`) in tutti gli endpoint che lo joinano: rischio sul reset password, da sistemare a parte. Preesistente.
- Un `down()` che altera dati (es. suffisso ` #id` per rendere unica la ragione sociale) viene ricopiato dal successivo `up()`: testare sempre il ciclo up → down → up confrontando i dati, non solo i conteggi.
- Dopo la rimozione di `backend/tools` l'output di `tsc` in dev è passato da `dist/src/` a `dist/`: la build incrementale ha lasciato un `dist` misto e la migration nuova non partiva all'avvio. Rimedio: `rm -rf dist *.tsbuildinfo` + restart (procedura già in CLAUDE.md). La produzione non ne risente (l'immagine copia solo `src/`).

Proposta dell'utente: riunire controparti (`utilizer`) e fornitori (`suppliers`) in un'unica anagrafica **Soggetti terzi**, persona fisica o giuridica.

- `utilizer` (212 attive su 314) è un minestrone: nel campo `name` convivono soggetti veri ("SIRIO S.r.l.", persone fisiche), luoghi e impianti ("SEMAFORO INC. VIA CHIARINI…", "FONTANA IN AREA VERDE RECINTATA", "cabina enel su area comunale"), note di lavoro ("NO recenti fatture corrispondenti - verificare stato utenza…") e usi ("manifestazioni estive"). Campi: `name`, `description`, `tax_code`, `contacts` (testo libero).
- `suppliers` (13): `supplier_id` (sigla inserita a mano, es. "ACA", "ACA_TERZI": è l'"id inserito dall'utente" segnalato), P.IVA, CF, ragione sociale, indirizzo, città, CAP, email, PEC. Usato da contratti di fornitura e convenzioni CONSIP.

Schema indicativo: tipo (fisica/giuridica), denominazione o cognome+nome, CF, P.IVA (solo giuridica), indirizzo, contatti, note; ruoli (fornitore / controparte) derivati dai collegamenti, non da un flag; `supplier_id` diventa una "sigla" facoltativa. Da decidere prima: cosa è una controparte, dove vanno i valori che non sono soggetti (impianti/immobili, note), campi minimi. Poi censimento delle righe, migrazione con conferma dell'utente sui casi dubbi, migration che preservi gli id referenziati. La scheda Fornitori si rifà come scheda Soggetto terzo (voce 14).

## 10. Tipologie contrattuali ARERA (al posto delle finalità d'uso)

Fatto in v1.8.0: spec `docs/superpowers/specs/2026-10-02-tipologie-arera-design.md`. Disalimentabilità diventata sì/no/non noto. Per il gas, oltre alla tipologia di cliente TIVG, la **categoria d'uso** C1–C5/T1–T2 (riscaldamento, cottura e acqua calda, uso tecnologico…: è quella del campo Access "tipologia uso contatore"), con anomalia "Utenze gas attive senza categoria d'uso". **Valorizzazione** sul DB locale, una lista alla volta con conferma. Fatto (2026-10-03): 230 valori da Access (luce 197: BT altri usi 119, BT illuminazione pubblica 77, MT altri usi 1; gas 28 come categoria d'uso: C3 20, C2 6, T2 1, C1 1; acqua 5 domestico residente); restano 9 utenze acqua con descrizioni del servizio o casette, da decidere con le bollette ACA. Da fare: proposte per gruppi sulle altre. Partenza: 239 valori dal campo Access "tipologia uso contatore" (i 28 del gas vanno nella categoria d'uso) (`UTENZE.accdb`, abbinati per `utility_id`), poi proposte per gruppi (impianti IP/colonnine, tensione, acqua non disalimentabile, fontane e casette, tipologia nelle bollette ACA); il resto resta nell'anomalia "Utenze attive senza tipologia ARERA". Il testo più sotto è il censimento di partenza.

`purpose` (21 voci attive) è spazzatura: valori di test ("ACME", "ACME100", "LoremIpsum"), quasi-duplicati, descrizioni di impianto, un `use_type` GENERIC/SPECIFIC inutile; è legata al tipo utenza (`utility_type_purpose`), non all'utenza. Serve solo a indicare la tipologia contrattuale, che è definita da ARERA: diventa un **enum fisso per tipo utenza**, assegnato all'utenza.

- Acqua (TICSI, delibera 665/2017): uso domestico (residente / non residente / condominiale), industriale, artigianale e commerciale, agricolo e zootecnico, pubblico non disalimentabile, pubblico disalimentabile, altri usi.
- Gas (TIVG art. 2.3): domestico, condominio uso domestico, attività di servizio pubblico, usi diversi.
- Luce (TIT, da verificare sul testo vigente): BT usi domestici, BT illuminazione pubblica, BT altri usi, MT illuminazione pubblica, MT altri usi.
- Internet: nessuna tipologia.

"Pubblico non disalimentabile" coincide con il campo testo `disconnection_ability`: decidere se lo sostituisce o lo affianca. Passi: corrispondenza vecchia finalità → tipologia con conferma sui casi dubbi, colonna enum su `utilities`, rimozione di `purpose`, `utility_type_purpose` e della pagina Finalità d'uso.

## 11. Aggregati utenze (da eliminare)

Fatto in v1.8.1: spec `docs/superpowers/specs/2026-10-03-eliminazione-aggregati-utenze-design.md`. Aggregati rimossi (tabella, colonna, pagina); nell'elenco utenze i filtri "Funzione immobile" e "Tipo impianto" sugli oggetti collegati. Dati sul DB locale (2026-10-03): funzione immobile assegnata a 118 immobili partendo dal vecchio aggregato immobili; ne restano 7 senza funzione (casi dubbi lasciati vuoti); le 10 utenze SPRAR fuori dal capitolo 15048 hanno la nota "Ex aggregato Access: SPRAR" e vanno girate alla ragioneria per il capitolo. Il testo sotto è il censimento di partenza.

22 categorie libere ereditate da Access, assegnate a 632 utenze su ~664, che duplicano informazioni ora presenti altrove: cosa alimenta (scuole 106, fontane/casette 59, semafori 13, pompe 16, sport 29, colonnine 10 → classificazione immobile e tipi d'impianto), stato ("contatori non individuati / non attivi" 48 → fornitura attiva, contatore rimosso), finanziamento ("SPRAR" 38 → capitolo di spesa), residui generici ("punto presa diversi usi" 68, "appartamenti, garage…" 16). Usi nel codice: `aggregator_id_fk` (DTO utenza), filtro e colonna tabella utenze, select nella scheda utenza, pagina Aggregati, importatori. Passi: verificare che ogni informazione sia ricavabile altrove (es. utenze "fontane" collegate al loro impianto), trasferire ciò che manca, poi rimuovere tutto con una migration; decidere con cosa sostituire il filtro per categoria.

## 12. Costi a carico calcolato

Fatto in v1.8.1: spec `docs/superpowers/specs/2026-10-03-costi-a-carico-calcolato-design.md`. Al posto della lista libera: sull'utenza "Volturata a/il" (soggetto terzo, data facoltativa), e uno stato calcolato dai contratti immobiliari attivi concessi dal Comune: Comune, Da volturare (contratto con "Utenze da volturare" ma voltura non fatta: paga il Comune), Volturata, Da riprendere (volturata a chi non ha più un contratto attivo). Anomalie "Utenze da volturare" e "Utenze volturate da riprendere" (solo forniture attive); tab Utenze nella scheda del contratto immobiliare; tab Controparti della scheda utenza rimosso. Dati: nessuna voltura registrata sul pregresso (le utenze "concessionario" con contratto erano tutte cessate; le 25 "concessionario" attive sono linee Open Fiber, convenzione gratuita, restano Comune). Restano da verificare le 8 utenze attive "Da volturare" (Azienda Speciale, Polisportiva palaroma). Il testo sotto è il censimento di partenza.

`costs_borne_by` (7 valori: "comune" 471, "COMUNE C/O ENGIE" 129, "concessionario" 48, "azienda speciale" 7, "GUARDIA COSTIERA" 6, "asl" 2, un nominativo con "Il Comune rimborsa" 1) diventa un valore **calcolato**: paga il Comune, oppure il soggetto terzo se l'utenza è collegata a un immobile con contratto immobiliare attivo che gli assegna le utenze. Impianti tutti del Comune (da confermare): utenza solo su impianti = Comune. "C/O ENGIE" è un'informazione del contratto di fornitura (gestione calore); il caso "il Comune rimborsa" richiede una decisione (terzo stato o nota). Candidato flag: `utilities_to_be_taken_over` ("Utenze da volturare") del contratto immobiliare. Prima di migrare: mostrare le incoerenze (utenze "comune" su immobili con contratto attivo e viceversa).

Di conseguenza sparisce il tab **Controparti** della scheda utenza (finalità → voce 10; controparti = stessa informazione del pagatore): al suo posto un riquadro "A carico di" nel Riepilogo con badge e link al contratto immobiliare che lo determina.

## 13. Schede entità: rifiniture

Dalla revisione finale di v1.7.1 (schede con Riepilogo e tab), non bloccanti:

- ~~immobile → tab Impianti: ripristinare la colonna "Posizione"~~ (fatto in v1.11.2);
- ~~immobile → Riepilogo: anteprima Utenze come conteggio per tipo, non elenco~~ (fatto in v1.11.2);
- ~~liste del padre non aggiornate dopo il salvataggio di una scheda figlia (contratto immobiliare `openAsset`/`openGrant`, tabella utenze `navigateToAsset`, colonna Utenze del tab Impianti dell'immobile)~~ (fatto in v1.11.2);
- ~~errori di salvataggio via `EntityNavigatorService` solo in console: mostrare un toast~~ (fatto in v1.8.0);
- ~~contratto con decorrenza futura: badge "In corso" vs barra "Non ancora iniziato"~~ (fatto in v1.11.2);
- ~~titolo scheda impianto che non segue il form~~ (fatto in v1.11.2);
- ~~permesso di modifica dell'impianto da `readOnly` del navigatore, altre schede da `isEditorRole`: unificare~~ (fatto in v1.11.2);
- ~~`todayIso`/`toIsoDate` importati da `pages/` dentro `core/`: spostarli~~ (fatto in v1.11.2);
- ~~riallineamento solo sul figlio diretto: con catene di 2+ livelli il Salva della scheda in fondo può ripristinare collegamenti cambiati più in alto~~ (fatto in v1.11.2: utenza e impianto rileggono dal server tutti i legami utenza ↔ impianto alla chiusura di qualsiasi scheda figlia, anche annullata; provato utenza → immobile → impianto);
- verifica E2E delle ultime correzioni (gruppi dati per tipo dell'impianto, rinnovo del contratto immobiliare, mappa in sola lettura per il Lettore), fatte con sola compilazione e CI: ancora da fare.

Dalla revisione finale di v1.8.1 (aggregati e volture), non bloccanti:

- ~~date dei contratti di fornitura che avanzano di un giorno a ogni Salva~~ (confermato e corretto 2026-10-05: lettura come giorno locale in `contract-edit-dialog`). Stessa verifica su fatture e convenzioni CONSIP, che hanno il problema opposto: il backend tiene i primi 10 caratteri di `toISOString()`, e una data scelta dal datepicker veniva salvata il giorno prima; anche i filtri per intervallo spostavano gli estremi di un giorno. Convenzione unica: il frontend invia il giorno locale `AAAA-MM-GG` (`@DateOnly()` in `core/helpers/date.helper.ts`), il backend lo tiene così com'è (`@DateOnly()` nei DTO, `DateHelper.dateOnly` nei filtri; `NormalizeDate` eliminato). Nessun contratto locale risulta già spostato (date coerenti, modifiche solo da import); per le fatture non è verificabile (audit log senza modifiche di data), le scadenze CONSIP sono vuote;
- ~~FK `FK_utilities_transferred_to` (migration `AddUtilityTransfer`) senza `foreignKeyConstraintName` nella `@JoinColumn` di `transferredTo`: `migration:generate` la proporrà come drift (drop + add)~~ (fatto in v1.11.2);
- ~~filtro utenze `grant_id` (tab Utenze del contratto immobiliare) non esclude gli immobili cancellati~~ (fatto in v1.11.2);
- ~~"Segna volturata oggi" resta visibile dopo il clic fino al Salva~~ (fatto in v1.11.2);
- ~~tab Utenze del contratto immobiliare: le utenze cessate risultano "Da volturare" (la dashboard conta solo le attive)~~ (fatto in v1.11.2);
- ~~creazione di un'utenza dal form non provata in E2E dopo la rimozione di "Costi a carico"~~ (provata in v1.11.2 dalla scheda impianto).

Dal confronto `Utility` backend/frontend dopo v1.9.1 (2026-10-05; campi allineati, nessun residuo dei campi eliminati), non bloccanti:

- ~~`remainingDays` in `frontend/src/app/pages/utilities/entity/utility.entity.ts` dichiarato e mai usato: toglierlo~~ (fatto in v1.11.2);
- ~~`IUtility` (`utility.interface.ts`) più povero della classe `Utility` e usato solo da lei~~ (eliminata in v1.11.2, restano `CostInfo`/`MaintenanceInfo`).

Dalla revisione finale di v1.11.1 (creazione al volo dalle schede), non bloccanti:

- ~~contratto di fornitura: se la convenzione CONSIP creata dal "+" ha un fornitore creato a sua volta dentro la convenzione (o una persona fuori dall'elenco fornitori), il contratto prende quel fornitore ma la select mostra ancora l'etichetta del precedente finché non si ricarica; lo stesso, per un istante, in ogni `setValue` prima del ricaricamento delle opzioni. Ricaricare i fornitori anche dopo la convenzione, o svuotare l'etichetta se l'id non è tra le opzioni~~ (fatto in v1.11.2: fornitori ricaricati anche dopo la convenzione);
- ~~`FilterableSelect`: digitare testo libero azzera già il valore (`userInteracted`), quindi dopo "Crea «…»" e Annulla il campo resta vuoto, non "com'era"; il commento nel codice dice il contrario. Correggere il commento o salvare e ripristinare il valore~~ (fatto in v1.11.2: commento corretto);
- ~~`EntityNavigatorService.createAssetFunction`: se il PATCH della tipologia fallisce, la funzione resta creata ma orfana (toast d'errore, nessuna selezione); se la tipologia non si trova nell'elenco, il PATCH manda `function_ids` con la sola funzione nuova e toglierebbe le altre ammesse non usate. Uscire senza PATCH se la tipologia manca~~ (fatto in v1.11.2: niente PATCH se la tipologia non c'è; resta il caso del PATCH fallito);
- ~~dialog impianto: `dialogRef` ancora tipizzato `boolean` ma chiude con `Plant | null` (anche `plants.component.ts`); funziona perché i chiamanti guardano solo la truthiness, allineare i tipi~~ (fatto in v1.11.2: tipi allineati);
- ~~dialog impegno: il capitolo creato dal "+" finisce in fondo a `data.chapterOptions` (array del contratto, non riordinato): al prossimo impegno compare in coda~~ (fatto in v1.11.2: elenco riordinato);
- ~~soggetto creato con "Crea «testo»": il testo va in `company_name`; se si passa a persona fisica il campo nascosto resta valorizzato e viene inviato. Svuotarlo al cambio tipo~~ (fatto in v1.11.2: il Salva non invia i campi del tipo non scelto);
- ~~`?selectedId` non apre la scheda su Soggetti terzi (E2E: aprire dalla riga)~~ (fatto in v1.11.2);
- ~~non provati in E2E fino al salvataggio: nuova utenza dall'impianto, nuova fattura dall'utenza~~ (provati in v1.11.2: il backend ricava il fornitore dal contratto; la nuova utenza da contratto immobiliare e impianto partiva senza immobili/impianti, corretto).

## 14. Schede di fornitori, capitoli, fatture

Stesso modello delle schede di v1.7.1: Fornitori fatto con la voce 9 (scheda Soggetto terzo); Capitoli di spesa (51, 105 righe di spesa storica) → Riepilogo + tab Utenze, Spesa storica, Fatture; Fatture (185) → Riepilogo + collegamenti navigabili, in vista del nuovo modello per l'import massivo (voce 6).

## 15. UI e identità

- ~~**Elenchi uniformi** e **filtri coerenti**~~ (fatto in v1.11.0, con segnalazioni per elenco e filtri avanzati a sezioni; spec `docs/superpowers/specs/2026-10-05-elenchi-uniformi-design.md`): filtri dichiarati per pagina, max 3 in linea, "Filtri avanzati" generico, chip dei filtri attivi, righe 25/50/100 ricordate, toolbar uguale. Resta: Impianti con tabella propria (stessa barra e paginatore); filtro "Stato utenza" del vecchio dialog mai funzionante, non riportato.
- **Dark mode automatico** (`prefers-color-scheme`): tema Material scuro, token colore (già presenti per le schede) ridefiniti, via i colori inline (39 file) e gli esadecimali fissi in `styles.scss` (~40); attenzione a Leaflet.
- **Sidebar**: gruppi, voci, icone, voce attiva, versione compressa.
- **Nuovo nome**: "UtenzePA" non rappresenta più il patrimonio. Candidati (convenzione team: suffisso "PA"): **PatrimonioPA** (consigliato; rischio confusione con la rilevazione MEF "Patrimonio della PA"), **BeniComuniPA** (più distintivo), ImmobiliPA (troppo stretto). Cercare omonimi su Developers Italia e GitHub. Impatti: `publiccode.yml`, immagini GHCR e `release.yml`, `docker-compose*.yml` (`name: utenzepa`, nomi container usati in CLAUDE.md), branding, README, repo GitHub, nomi file dei backup. Decidere il nome prima di toccare l'UI.

## 16. Dashboard e mappa

Per ultime, quando dati e UI sono a posto. **Mappa**: non si tocca finché non ci sono i complessi (voce 4) e i dati catastali (voce 2). **Dashboard**: oggi card indipendenti con stili propri (anomalie, contratti immobiliari, verifiche impianti…); ripensare indicatori per area (patrimonio, utenze, contratti, spesa), anomalie come lista di cose da fare con link alla scheda, coerenza con badge e colori delle schede, dark mode.

## 17. Impegni di spesa (contratto ↔ capitolo)

Fatto in v1.10.0 con la voce 6: impegno = contratto di fornitura + capitolo + esercizio, numero e importo facoltativi; tab "Impegni e capitoli" nella scheda contratto (riepilogo calcolato per capitolo: utenze, impegnato, speso); nella scheda utenza i capitoli impegnati sui contratti aperti compaiono in cima al select (nessun blocco), con anomalia per i contratti che hanno impegni. Sul DB locale 12 impegni ACA (6 capitoli × 2025–2026) senza numero né importo: da completare con la ragioneria. Il testo sotto è il censimento di partenza.

Oggi il capitolo sta solo sull'utenza (`utilities.budget_chapter_code_fk`); il contratto di fornitura non ne ha. Non si può spostare sul contratto e derivarlo: lo stesso contratto copre utenze su capitoli diversi (al 2026-10-03, utenze attive: un contratto da 160 utenze su 15 capitoli, uno da 105 su 7, uno da 36 su 13). Il capitolo dipende da cosa serve l'utenza (scuola, uffici, SPRAR, illuminazione), non dal fornitore.

Nessuna entità "impegno" esiste nel codice. Le più vicine: `budget_chapter_spending` (spesa storica per capitolo e anno, senza contratto), fatture N-N con i capitoli (senza importo per capitolo).

Decisione utente (2026-10-03): entrambe le cose.

1. **Impegno di spesa** come entità: contratto di fornitura, capitolo, esercizio, numero impegno (della ragioneria), importo impegnato, note. Il capitolo dell'utenza si sceglie tra quelli impegnati sui suoi contratti (il dato resta sull'utenza, il contratto fa da vincolo). In futuro la fattura si aggancia all'impegno invece che al capitolo nudo (voce 6), e la spesa per impegno si calcola dalle fatture.
2. **Riepilogo capitoli** nella scheda del contratto di fornitura: capitoli delle sue utenze, calcolato e mai salvato.

Da chiarire prima del design: se i dati degli impegni (numero, anno, importo) sono disponibili dalla ragioneria o dal gestionale contabile, o se per ora basta l'elenco contratto ↔ capitoli. Da fare insieme o subito dopo la voce 6 (fatture): toccano lo stesso modello della spesa. Problema dati collegato: 254 utenze senza capitolo (125 attive del contratto 10, tutte senza), 25 utenze Open Fiber sul capitolo fittizio "N/A".

**Gotcha, forniture gratuite (Open Fiber)** — risolto in v1.13.0: tipologia del contratto "A titolo gratuito" (select con Ordinario / Escluso da CIG), capitolo facoltativo sull'utenza con segnalazione "Utenze attive senza capitolo di spesa" (escluse quelle di un contratto gratuito in corso); sul DB locale contratto 615 gratuito, capitolo tolto dalle 26 utenze, capitolo 254 cancellato. Testo originale: il contratto di fornitura con Open Fiber (id 615, senza CIG, 25 utenze, linee in convenzione gratuita) non ha costi per il Comune, ma il capitolo è obbligatorio sull'utenza (`budget_chapter_code_fk` richiesto da DTO e scheda). Per salvarle è stato creato un capitolo fittizio: `budget_chapters` id 254, codice "N/A", articolo 0, "CONCESSIONE GRATUITA - NESSUN COSTO A CARICO DEL COMUNE", tipo fornitura `SPRAR_UTILITIES` (l'unico compatibile con ogni tipo di utenza nella regola capitolo ↔ tipo, non perché siano SPRAR); al 2026-10-05 lo usano 26 utenze. Conseguenze: il capitolo compare negli elenchi, nei filtri e nei riepiloghi di spesa come se fosse vero, e "tipo fornitura SPRAR" è falso. Da fare: flag "a titolo gratuito" sul contratto di fornitura (o sull'utenza) che rende il capitolo facoltativo e lo esclude da spesa, impegni e anomalie; poi togliere il capitolo fittizio dalle utenze e dal DB (sul DB locale, produzione via export). Non trattare "N/A" come capitolo reale nei report.

## 18. Pulizia entità e incongruenze del modello

Analisi dello schema e dei dati sul DB locale (2026-10-03), ragionando su come andrebbe modellato il dominio. Conteggi su righe non cancellate.

**Da eliminare (morte o duplicate):**

- tabella `fk_test`: vuota, nessuna entity, residuo di prove;
- `aca_keys`: 0 righe, nessuna UI; salverebbe username e password del portale ACA in chiaro per utenza. Eliminare;
- **aggregati immobili** (`asset_aggregators`, colonna `assets.asset_type_id`): duplicano la funzione dell'immobile (183 immobili su 190 hanno la funzione; 7 hanno solo l'aggregato). Usati ancora da icone mappa e filtri (~20 file frontend): passare a funzione/natura, poi rimuoverli come gli aggregati utenze (voce 11). Tocca la mappa (voce 16): solo sostituzione dell'icona, non ridisegno;
- **gestori manutenzione** (`maintenance_managers`, `utilities.maintenance_management_id_fk`, 638 utenze): lista libera ereditata come i vecchi costi a carico. Valori: "comune" 409, "conversion e lighting" 125, ACA 69, "concessionario" 16, e soggetti veri (Engie, società sportive, bike sharing, EGAM). È un soggetto terzo, e il rapporto è un contratto di servizio/manutenzione (voce 7). Decidere se basta un soggetto terzo sull'utenza (o sull'impianto) o se aspettare la voce 7;
- `invoice_budget_chapter`: 20 righe tutte orfane (fatture inesistenti, nessuna FK), nessuna fattura vera ha un capitolo. Collegamento da ripensare con le voci 6 e 17;
- `utility_types`: tabella di 4 righe che rispecchia l'enum `hard_type` (acqua, gas, luce, connettività). Bassa priorità: tocca molto codice per poco guadagno.

**Campi doppi o ambigui:**

- utenza: `supplier_address` (328) è in realtà l'indirizzo di fornitura e duplica quello dell'immobile; coordinate proprie (119) oltre a quelle di immobile e impianto;
- utenza: tre testi liberi (`notes` 523, `additional_notes` 107, `specifications` 81). Unificare o dare un significato a ciascuno;
- utenza: `security_deposit` a 0,00 per 554 utenze (default): "nessun deposito" e "non noto" sono indistinguibili;
- utenza: `utility_code` valorizzato per acqua (177/183) e connettività, quasi mai per gas e luce: verificare cosa rappresenta (codice cliente del fornitore?) e rinominarlo;
- capitolo: `supply_type` mescola tipi di fornitura e finanziamento (`SPRAR_UTILITIES`);
- immobile: `associated_building` valorizzato su tutti i 190 come testo libero ("Edificio con 6 alloggi…", "SPRAR", "Locali in affitto"): è un complesso in embrione (voce 4) mescolato a funzione e titolo di possesso;
- catasto in due posti: immobile (foglio/particella/subalterno/categoria/rendita, 58 con foglio) e contratto immobiliare (`cadastral_ref` testo, 59). Da risolvere con la voce 2;
- contratto di fornitura: `consip_order` (37) e `order_number` (1) per lo stesso concetto; date di fornitura valorizzate solo su 18 contratti su 42;
- contratto immobiliare: campi ereditati dalle concessioni poco usati (`usage_type` 6, `department` 22, `concession_act` 27 su 126); 62 contratti senza immobile (già in anomalia).

**Sane, nessun intervento:** soggetti terzi, impianti e tabelle per tipo, consumi, foto (polimorfiche per tipo e id), impostazioni, audit log, utenze per contratto (lo storico dei rinnovi Consip spiega le utenze con 5–7 contratti).

Decisione utente (2026-10-03): si parte da questa voce; i gestori manutenzione si sostituiscono con i contratti di manutenzione (voce 7, assorbita qui).

**Parte 1 fatta in v1.9.0** (spec `docs/superpowers/specs/2026-10-03-pulizia-entita-manutenzione-design.md`): eliminati `fk_test`, `aca_keys`, aggregati immobili (mappa e icone solo dalla funzione) e gestori manutenzione; FK su `invoice_budget_chapter` (aggiunte solo se mancano); "Manutenzione a carico di" calcolata dalle spunte "Manutenzione inclusa" (contratto di fornitura) e "Manutenzione a carico della controparte" (contratto immobiliare): Fornitore / Controparte / Comune; anomalia "Immobili senza natura o funzione". Dati sul DB locale (2026-10-03): natura assegnata a 177 immobili (125 ricavati dalla funzione, 47 decisi con l'utente, 5 dei 7 con solo l'aggregato), 229 utenze con la nota `Ex gestore manutenzione Access: <valore>`, spunta sul contratto Engie del servizio luce (125 utenze "Fornitore"), 20 righe orfane di `invoice_budget_chapter` cancellate. Restano 6 immobili da classificare (2 segnaposto "ex contatore disattivato" senza natura né funzione). Restano per la parte 2 i campi doppi elencati sopra.

**Parte 2 fatta in v1.9.1** (spec `docs/superpowers/specs/2026-10-03-campi-doppi-design.md`): note aggiuntive e specifiche unite in `notes` (177 utenze), deposito cauzionale nullable (554 zeri → non noto), `utility_code` → "Codice cliente fornitore", numero ordine unico (`order_number` eliminato, il contratto 640 spostato in `consip_order`, etichetta "Numero ordine (ODA)"), 91 indirizzi di fornitura uguali a quello di immobile/impianto svuotati, una sola relazione fattura-capitoli. Restano fuori: `budget_chapters.supply_type` (voce 17), `utility_types`, `associated_building` (voce 4), catasto (voce 2). `schema:log` propone ancora DROP/ADD delle FK di `invoice_budget_chapter` e due indici `IDX_…` (servirebbe una migration di soli indici).

Dalla revisione finale di v1.9.1, non bloccanti: commento di `SecurityDepositNullable` ("gli 0 esistenti diventano null") impreciso, la conversione è stata un intervento sui dati; scheda soggetto terzo, colonna "Ordine" invece di "Numero ordine (ODA)"; righe vuote doppie nei template di elenco contratti e utenze; chi aveva salvato la colonna "Numero Ordine" nell'elenco contratti deve riattivare "Numero ordine (ODA)" a mano; export del deposito non formattato quando MySQL restituisce il decimale come stringa (preesistente).

Dalla revisione finale di v1.9.0, non bloccanti:

- immobile con natura ma senza funzione: si può svuotare di nuovo la natura (né la scheda né `assertClassification` lo impediscono; preesistente);
- immobile con funzione ma senza natura: non si salva (il controllo `function_id` disabilitato viene comunque inviato da `getRawValue()`, 400 "Selezionare la tipologia prima della funzione"); nessun immobile in questo stato oggi;
- scheda utenza: il riquadro Manutenzione (come "A carico di") è un'istantanea, non si aggiorna dopo aver cambiato la spunta su un contratto aperto dalla scheda stessa;
- `InvoiceBudgetChapterFk.down()` vuoto: in rollback le FK vanno tolte a mano se servisse.

Gotcha emersi dall'analisi:

- `information_schema.TABLES.TABLE_ROWS` è una stima e conta anche le righe cancellate (es. `contracts` 662 righe, 42 non cancellate; `utilizer_grant` 567, 126; `assets` 477, 190 dopo il passaggio a impianti): contare sempre con `COUNT(*) ... WHERE deleted = 0`;
- l'aggregato immobili sta nella colonna `assets.asset_type_id`, non in una `*_aggregator_id_fk`: il nome non dice cosa contiene;
- `utilities.water_concession` è una colonna `date`: `NULLIF(col, '')` in MySQL dà errore 1525 ("Incorrect DATE value") e blocca l'intera query, usare `IS NOT NULL`;
- `invoice_budget_chapter` non ha FK verso `invoices`: le righe restano orfane quando le fatture vengono rinumerate o cancellate (oggi puntano a id 1–2, le fatture partono da 741);
- utenze collegate a 5–7 contratti di fornitura: non è un errore, sono i rinnovi Consip successivi (storico); per "il contratto attuale" va usato quello non chiuso.

## 19. Allegati di contratti, immobili e impianti

Richiesta utente (2026-10-05): caricare allegati generici (contratto firmato, determina, ordine ODA, verbali, planimetrie, corrispondenza) sulle schede dei contratti di fornitura e dei contratti immobiliari, con un tab "Allegati" nella scheda. Estesa (2026-10-05) a immobili e impianti: certificazioni (agibilità, prevenzione incendi, conformità impianti), verbali di verifica e manutenzione, planimetrie, visure e atti catastali, schede tecniche.

Base esistente: le foto (`apis/photos/`) sono già polimorfiche (`entity_type` + `entity_id`, oggi immobile, utenza, impianto), salvate su disco nel volume `photos_data` e già incluse in backup e ripristino (`BackupService`). Da approfondire:

- entità nuova `attachments` con lo stesso schema polimorfico (`entity_type` = `contract` / `utilizer_grant` / `asset` / `plant`, poi estendibile) invece di allargare le foto: tipi di file diversi (PDF, documenti, fogli di calcolo, immagini, email `.eml`/`.msg`), nessuna conversione HEIC, nessun limite "10 per entità";
- metadati: nome originale, descrizione, categoria facoltativa per tipo di entità (contratti: contratto, determina, ordine, verbale; immobili e impianti: certificazione, verbale di verifica, planimetria, visura, scheda tecnica; sempre "altro"), data del documento, chi e quando ha caricato;
- limiti: dimensione massima configurabile (le foto hanno `PHOTO_MAX_SIZE_MB`), tipi ammessi (whitelist MIME + estensione), body-parser e proxy di produzione da dimensionare;
- archiviazione: stessa cartella/volume delle foto o volume dedicato; backup e ripristino da estendere, dimensione dei backup;
- permessi: caricamento e cancellazione per Admin/Operatore, lettura per tutti; cancellazione logica come le foto;
- scadenze: certificazioni e verifiche periodiche degli impianti hanno una validità; valutare una data di scadenza facoltativa sull'allegato e un'anomalia "documento scaduto" (dashboard e segnalazioni degli elenchi);
- tab "Allegati" con lo stesso componente in tutte e quattro le schede; nelle schede immobile e impianto convive con il tab Foto;
- eventuale estensione futura a fatture (PDF allegato della fattura elettronica, vedi gotcha FatturaPA della voce 6) e utenze.

## 20. Assestato dei capitoli e disponibilità

Richiesta utente (2026-10-06), partendo dalla schermata "Competenza" del gestionale di contabilità (per capitolo ed esercizio). Dati da riportare, inseriti a mano per capitolo + esercizio:

- **assestato** (obbligatorio): il dato che manca. Calcolati, mai salvati: disponibilità = assestato − impegni (impegni della voce 17), spesa fatturata dell'esercizio (`apis/spending/`), avviso quando impegni o spesa presunta (consumo stimato) superano l'assestato (anomalia per dashboard e segnalazioni dell'elenco capitoli);
- **stanziamento iniziale** (facoltativo): solo per vedere le variazioni nell'anno;
- **mandati** (opzione, numero e importo): riscontro tra pagato e fatture registrate (12 mandati contro 11 fatture = fattura mancante). Costa un inserimento manuale in più: da decidere.

Fuori: FPV, impegni prenotati, pre-impegni, pre-liquidazioni, economie, riaccertamenti, cassa, previsione definitiva dell'anno precedente (contabilità della ragioneria; la spesa degli anni passati è già nella spesa storica, `budget_chapter_spending`).

Da approfondire: tabella dedicata per capitolo + esercizio o colonne su `budget_chapter_spending` (oggi una riga per anno con importo e note); tab della scheda capitolo (oggi "Spesa storica") che mostri per esercizio assestato, impegnato, fatturato e disponibilità.

## Fuori scope (decisioni prese)

- **Condomini**: non è ciò che serve (2026-10-01).
- **Registro agibilità 1986–2023**: edilizia privata (SUE), non patrimonio comunale.
- **Pratiche lavori** (CUP, gare, SAL, espropri): archivio progetti; al massimo in futuro un elenco "interventi per immobile".
- **Assegnatari case comunali "canoni 2017"** (305 righe con nucleo familiare): non si importano, dati personali eccedenti; basta il report da 45 righe con oscuramento (voce 1).
- **Incassi/pagamenti dei canoni**: il registro contratti non gestisce rate né pagamenti.
