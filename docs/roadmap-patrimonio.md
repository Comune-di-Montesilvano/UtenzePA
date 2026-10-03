# Roadmap: estensione del perimetro di UtenzePA al patrimonio

Aggiornata: 2026-10-02

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
| 6 | Fatture per utenza | da approfondire |
| 7 | Contratti di servizio e manutenzione | da approfondire |
| 8 | Permessi di scrittura granulari | da approfondire |
| 9 | Soggetti terzi (controparti + fornitori) | fatto, v1.8.0 (pulizia dati fatta sul DB locale; restano CF delle persone, P.IVA Open Fiber, 2 locatori SPRAR) |
| 10 | Tipologie contrattuali ARERA (al posto delle finalità d'uso) | fatto, v1.8.0 (valorizzazione delle tipologie sul DB locale da fare) |
| 11 | Aggregati utenze (da eliminare) | da approfondire |
| 12 | Costi a carico calcolato | da approfondire |
| 13 | Schede entità: rifiniture | da fare |
| 14 | Schede di fornitori, capitoli, fatture | da fare |
| 15 | UI e identità (elenchi, filtri, dark mode, sidebar, nome) | da approfondire |
| 16 | Dashboard e mappa | per ultime |

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

Oggi le fatture si legano a contratto e capitolo, non all'utenza. Fonte pronta: fatture ACA 2025–2026 (490 fatture, `.audit-w/aca_fatture_2025_2026.json`). Serve `utility_id_fk` sulla fattura per avere spesa reale per utenza/immobile e anomalie "fattura su utenza cessata". Rimandata dall'utente (si è fatta solo la pulizia dati).

In previsione delle **utility di importazione massiva** (fattura elettronica XML FatturaPA o tracciati dei fornitori), il modello va ripensato: oggi `invoices` ha numero, data, protocollo, imponibile, morosità, FK al contratto di fornitura e N-N con i capitoli, ma non utenza e periodo. Servono righe fattura per POD/PDR (una fattura del fornitore copre molte utenze) con periodo dal/al, consumo e importo; aggancio a consumi (`utility_consumptions`) e spesa per capitolo; abbinamento del fornitore per P.IVA (voce 9) invece che per `supplier_id`; POD normalizzato a 14 caratteri; deduplica per numero fattura + fornitore; anteprima con errori prima del salvataggio.

## 7. Contratti di servizio e manutenzione

Fonte: `W:\PATRIMONIO\2_ UTENZE\2_UFFICIO ASSOCIATO GESTIONE INTEGRATA ENERGIA\adempimenti servizi\costo storico\Attività di competenza e costo storico .xlsx`: per ambito (impianti elettrici, termici, idrosanitari, ascensori, fontane, semafori, illuminazione pubblica, sollevamenti, videosorveglianza) ditta, costo 2022–2024, scadenza, determina. Da collegare a impianti (voce 3) e immobili.

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

22 categorie libere ereditate da Access, assegnate a 632 utenze su ~664, che duplicano informazioni ora presenti altrove: cosa alimenta (scuole 106, fontane/casette 59, semafori 13, pompe 16, sport 29, colonnine 10 → classificazione immobile e tipi d'impianto), stato ("contatori non individuati / non attivi" 48 → fornitura attiva, contatore rimosso), finanziamento ("SPRAR" 38 → capitolo di spesa), residui generici ("punto presa diversi usi" 68, "appartamenti, garage…" 16). Usi nel codice: `aggregator_id_fk` (DTO utenza), filtro e colonna tabella utenze, select nella scheda utenza, pagina Aggregati, importatori. Passi: verificare che ogni informazione sia ricavabile altrove (es. utenze "fontane" collegate al loro impianto), trasferire ciò che manca, poi rimuovere tutto con una migration; decidere con cosa sostituire il filtro per categoria.

## 12. Costi a carico calcolato

`costs_borne_by` (7 valori: "comune" 471, "COMUNE C/O ENGIE" 129, "concessionario" 48, "azienda speciale" 7, "GUARDIA COSTIERA" 6, "asl" 2, un nominativo con "Il Comune rimborsa" 1) diventa un valore **calcolato**: paga il Comune, oppure il soggetto terzo se l'utenza è collegata a un immobile con contratto immobiliare attivo che gli assegna le utenze. Impianti tutti del Comune (da confermare): utenza solo su impianti = Comune. "C/O ENGIE" è un'informazione del contratto di fornitura (gestione calore); il caso "il Comune rimborsa" richiede una decisione (terzo stato o nota). Candidato flag: `utilities_to_be_taken_over` ("Utenze da volturare") del contratto immobiliare. Prima di migrare: mostrare le incoerenze (utenze "comune" su immobili con contratto attivo e viceversa).

Di conseguenza sparisce il tab **Controparti** della scheda utenza (finalità → voce 10; controparti = stessa informazione del pagatore): al suo posto un riquadro "A carico di" nel Riepilogo con badge e link al contratto immobiliare che lo determina.

## 13. Schede entità: rifiniture

Dalla revisione finale di v1.7.1 (schede con Riepilogo e tab), non bloccanti:

- immobile → tab Impianti: ripristinare la colonna "Posizione";
- immobile → Riepilogo: anteprima Utenze come conteggio per tipo, non elenco;
- liste del padre non aggiornate dopo il salvataggio di una scheda figlia (contratto immobiliare `openAsset`/`openGrant`, tabella utenze `navigateToAsset`, colonna Utenze del tab Impianti dell'immobile);
- ~~errori di salvataggio via `EntityNavigatorService` solo in console: mostrare un toast~~ (fatto in v1.8.0);
- contratto con decorrenza futura: badge "In corso" vs barra "Non ancora iniziato";
- titolo scheda impianto che non segue il form;
- permesso di modifica dell'impianto da `readOnly` del navigatore, altre schede da `isEditorRole`: unificare;
- `todayIso`/`toIsoDate` importati da `pages/` dentro `core/`: spostarli;
- riallineamento solo sul figlio diretto: con catene di 2+ livelli il Salva della scheda in fondo può ripristinare collegamenti cambiati più in alto;
- verifica E2E delle ultime correzioni (gruppi dati per tipo dell'impianto, rinnovo del contratto immobiliare, mappa in sola lettura per il Lettore), fatte con sola compilazione e CI.

## 14. Schede di fornitori, capitoli, fatture

Stesso modello delle schede di v1.7.1: Fornitori fatto con la voce 9 (scheda Soggetto terzo); Capitoli di spesa (51, 105 righe di spesa storica) → Riepilogo + tab Utenze, Spesa storica, Fatture; Fatture (185) → Riepilogo + collegamenti navigabili, in vista del nuovo modello per l'import massivo (voce 6).

## 15. UI e identità

- **Elenchi uniformi**: oggi titoli, ricerca, filtri, conteggio risultati, paginazione, azioni ed export cambiano da pagina a pagina; quasi tutte estendono `AbstractDataTableComponent`, Impianti ha tabella e filtri propri. Un unico layout lista per tutte le entità.
- **Filtri coerenti**: stessi controlli per lo stesso tipo di dato, filtri attivi visibili e rimovibili.
- **Dark mode automatico** (`prefers-color-scheme`): tema Material scuro, token colore (già presenti per le schede) ridefiniti, via i colori inline (39 file) e gli esadecimali fissi in `styles.scss` (~40); attenzione a Leaflet.
- **Sidebar**: gruppi, voci, icone, voce attiva, versione compressa.
- **Nuovo nome**: "UtenzePA" non rappresenta più il patrimonio. Candidati (convenzione team: suffisso "PA"): **PatrimonioPA** (consigliato; rischio confusione con la rilevazione MEF "Patrimonio della PA"), **BeniComuniPA** (più distintivo), ImmobiliPA (troppo stretto). Cercare omonimi su Developers Italia e GitHub. Impatti: `publiccode.yml`, immagini GHCR e `release.yml`, `docker-compose*.yml` (`name: utenzepa`, nomi container usati in CLAUDE.md), branding, README, repo GitHub, nomi file dei backup. Decidere il nome prima di toccare l'UI.

## 16. Dashboard e mappa

Per ultime, quando dati e UI sono a posto. **Mappa**: non si tocca finché non ci sono i complessi (voce 4) e i dati catastali (voce 2). **Dashboard**: oggi card indipendenti con stili propri (anomalie, contratti immobiliari, verifiche impianti…); ripensare indicatori per area (patrimonio, utenze, contratti, spesa), anomalie come lista di cose da fare con link alla scheda, coerenza con badge e colori delle schede, dark mode.

## Fuori scope (decisioni prese)

- **Condomini**: non è ciò che serve (2026-10-01).
- **Registro agibilità 1986–2023**: edilizia privata (SUE), non patrimonio comunale.
- **Pratiche lavori** (CUP, gare, SAL, espropri): archivio progetti; al massimo in futuro un elenco "interventi per immobile".
- **Assegnatari case comunali "canoni 2017"** (305 righe con nucleo familiare): non si importano, dati personali eccedenti; basta il report da 45 righe con oscuramento (voce 1).
- **Incassi/pagamenti dei canoni**: il registro contratti non gestisce rate né pagamenti.
