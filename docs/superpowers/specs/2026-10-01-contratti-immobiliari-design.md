# Contratti immobiliari (unificazione Concessioni) — design

Data: 2026-10-01

## Obiettivo

Trasformare il modulo **Concessioni** in un registro unico dei **contratti immobiliari** del Comune: locazioni, concessioni, comodati, assegnazioni di alloggi, occupazioni di suolo, sia **attivi** (il Comune incassa) sia **passivi** (il Comune paga). Registro + scadenzario: anagrafica contratto, canone, scadenze, rinnovo tacito con preavviso, avvisi in dashboard, totali entrate/uscite.

Fuori scope (roadmap complessiva in `docs/roadmap-patrimonio.md`):

- incassi/pagamenti e rate (nessuna gestione contabile dei canoni);
- condomini;
- complessi (gruppi di edifici): giro successivo, questo design prepara solo il dato (abbinamento istituto–plesso nel report di migrazione).

## Contesto

Oggi `utilizer_grant` (UI "Concessioni", 480 righe da Access) mescola quattro cose:

| Gruppo | Esempi | Righe (circa) |
|---|---|---|
| Contratti veri | Azienda Speciale (45, 38 con atto), SPRAR (13), mobilità elettrica (7), Egenia casette acqua, parchi, associazioni, parrocchia, centro anziani | 90 |
| Destinazione d'uso interna | Pubblica illuminazione (125), cabine Enel, pompe di sollevamento, fontane, semafori, colonnine taxi, videosorveglianza, pannelli | 170 |
| Note di verifica utenza | "VERIFICARE", "NO recenti fatture … chiesta disattivazione Heracomm" | 25 |
| Istituti scolastici | Direzione didattica, I.C. Delfico/Rodari/Silone/Villa Verrocchio | 15 |

Solo il primo gruppo è un contratto. Gli altri sono promiscuità dovute all'uso della tabella per indicare "chi usa l'utenza".

Bug esistente: `grant_date` ed `expire_date` sono dichiarati `@CreateDateColumn` in `utilizer-grant.entity.ts`, quindi `grant_date` vale l'istante di import per tutte le 480 righe (data finta). Va corretto in questo giro.

Fonti per l'import iniziale (`W:\PATRIMONIO\4_IMMOBILIARE`, già convertite in `.audit-w/immobiliare/excel/`):

| Fonte | Righe | Contenuto |
|---|---|---|
| `04_ LOCAZIONI_E_CONCESSIONI/ATTIVE/2021_da Bonetti/Locazioni attive.ods` | 73 | nominativo + repertorio, stipula, scadenza, canone, sede, stato (RESO/Legale/Deceduto) |
| `04_ LOCAZIONI_E_CONCESSIONI/PASSIVE/2021_da BONETTI/Locazioni passive.ods` | 22 | proprietario, destinazione, canone + periodicità, IVA, stipula, decorrenza, scadenza, superficie, catasto, settore, contatti |
| `02_FABBRICATI/02_APPARTAMENTI E CASE COMUNALI AZIENDA/SPRAR/COPIA ELENCO IMMOBILI SPRAR.ods` | 16 | locatore, repertorio, stipula, scadenza, indirizzo, catasto, canone annuo, contatti |
| `federalismo demaniale/verifica contratti/ELENCO BENI DEMANIALI.ods` | 25 | codice scheda, n. contratto, data, tipologia, contraente, foglio/particella, oggetto, durata, scadenza, canone annuo |
| `02_FABBRICATI/02_APPARTAMENTI E CASE COMUNALI AZIENDA/1_CASE COMUNALI_ AZIENDA SPECIALE/IMMOBILI CONCESSI A AZIENDA/Politica della Casa REPORT CASE COMUNALI.ods` | 45 | alloggio, assegnatario, tipo contratto (definitivo/parcheggio/custodia) |
| `02_FABBRICATI/ALTRI FABBRICATI/MERCATINO ITTICO/concessione spazi/situazione aprile 2026.xlsx` | ~10 | box del mercatino ittico: numero, lettera planimetria, ultimo concessionario, tipo autorizzazione, numero concessione |
| `03_AREE_STRADE_e_P.ILL/2_ DEMANIO e ATTRAVERSAMENTI al 24.10.2022/CANONI E ATTRAVERSAMENTI/CANONI DEMANIO IDRICO/` (`Canoni idrici_UTENZE.xlsx`, `2011/canoni idrici 2011.xls`, `2021/VERIFICA DEBITO OTTOBRE/pagamenti 20211_2020.xlsx`) | ~40 | concessioni demaniali idriche e attraversamenti verso la Regione Abruzzo (passive): ente, autorizzazione, annualità, pagamenti |
| `02_FABBRICATI/ALTRI FABBRICATI/AUTOPARCO/autoparco via Danubio/1_CONTRATTO 2024/` (`adeguamento istat/Cartel1.xlsx`, `contratto/spese registrazione/Prospetto spese contrattuali.xlsx`) | 1 contratto | locazione passiva autoparco via Danubio: decorrenza, canone, IVA, adeguamento ISTAT, spese di registrazione |

**Esclusa**: `ALLOGGIPROPRIETA'_canoni 2017.xlsx` (305 assegnatari con nucleo familiare): dati personali eccedenti, non si importa (decisione 2026-10-01).

## Decisioni

- **Unificazione**: nessuna entità nuova parallela. Si estendono `utilizer_grant` (contratto) e `utilizer` (controparte). I nomi delle tabelle DB restano invariati per non toccare join e import esistenti; cambiano entity/UI.
- UI: menu **"Contratti immobiliari"** (sostituisce "Concessioni"), anagrafica **"Controparti"** (sostituisce "Utilizzatori").
- Registro + scadenzario, niente pagamenti.
- Rinnovo tacito con durata del rinnovo e preavviso.
- Soglie avvisi: disdetta entro **60 giorni**, scadenza entro **4 mesi** (stessa soglia dei contratti di fornitura).
- Immobile **facoltativo** sul contratto (import di contratti non abbinabili con certezza); molti-a-molti con gli immobili.
- Codice fiscale della controparte oscurato **dal backend** per il ruolo Lettore (decisione 2026-10-02); permessi di scrittura granulari in un giro successivo.
- Pulizia della tabella esistente con soft delete + report, mai cancellazioni fisiche.

## Schema DB

### `utilizer` → controparte

Colonne aggiunte:

| colonna | tipo | note |
|---|---|---|
| `tax_code` | varchar(16), nullable | codice fiscale o partita IVA |
| `contacts` | text, nullable | telefoni, email, referente (testo libero, come nelle fonti) |

`name` e `description` invariati.

### `utilizer_grant` → contratto immobiliare

Colonne esistenti:

| colonna | destino |
|---|---|
| `concession_act` | resta: estremi dell'atto (delibera/determina/repertorio) |
| `utilities_to_be_taken_over` | resta: "utenze da volturare" |
| `usage_type` | resta come testo libero di dettaglio |
| `grant_date` | rinominata `start_date`, tipo `date`, nullable; valori esistenti azzerati (finti, vedi Contesto) |
| `expire_date` | rinominata `end_date`, tipo `date`, nullable; valori esistenti conservati se diversi da `create_date` |
| `asset_id_fk` | migrata nella join `utilizer_grant_assets`, poi rimossa |
| `utilizer_id_fk` | resta: controparte (obbligatoria) |

Colonne aggiunte:

| colonna | tipo | note |
|---|---|---|
| `direction` | enum(`ACTIVE`,`PASSIVE`), default `ACTIVE` | attivo = il Comune incassa |
| `kind` | enum(`LEASE`,`CONCESSION`,`LOAN_FOR_USE`,`HOUSING_ASSIGNMENT`,`LAND_OCCUPATION`), default `CONCESSION` | locazione, concessione, comodato, assegnazione alloggio, occupazione suolo |
| `subject` | varchar(500), nullable | oggetto / destinazione d'uso |
| `rent_amount` | decimal(12,2), nullable | importo per periodo |
| `rent_period` | enum(`MONTHLY`,`BIMONTHLY`,`QUARTERLY`,`SEMIANNUAL`,`ANNUAL`,`ONE_OFF`), nullable | |
| `vat_applicable` | boolean, default false | |
| `tacit_renewal` | boolean, default false | |
| `renewal_months` | int, nullable | durata di ogni rinnovo (es. 48 nel 4+4); obbligatorio se `tacit_renewal` |
| `notice_months` | int, nullable | preavviso di disdetta; obbligatorio se `tacit_renewal` |
| `status` | enum(`ACTIVE`,`RETURNED`,`TERMINATED`,`DISPUTED`), default `ACTIVE` | stato dichiarato: attivo, restituito, cessato, in contenzioso |
| `registration_ref` | varchar(255), nullable | repertorio / registrazione Agenzia Entrate |
| `cadastral_ref` | varchar(255), nullable | testo, es. "Fg. 7 – Part. 54 – Sub 21" |
| `area_sqm` | decimal(10,2), nullable | superficie, se indicata |
| `department` | varchar(50), nullable | settore (LLPP, Amm, PM, …) |
| `parent_contract_id` | int, nullable, FK `utilizer_grant.id` | contratto padre (es. assegnazione alloggio sotto la locazione passiva o la concessione all'Azienda Speciale) |
| `notes` | text, nullable | |

Validazioni (DTO + service):

- `rent_amount` e `rent_period` entrambi presenti o entrambi assenti;
- `tacit_renewal = true` ⇒ `end_date`, `renewal_months > 0`, `notice_months >= 0` obbligatori;
- `end_date >= start_date` se entrambe presenti;
- `parent_contract_id` diverso da sé stesso e senza cicli (un solo livello di profondità basta: un padre non può avere a sua volta un padre).

### Nuova tabella `utilizer_grant_assets`

| colonna | tipo |
|---|---|
| `utilizer_grant_id` | int, FK, PK |
| `asset_id` | int, FK, PK |

Popolata dalla migration con l'attuale `asset_id_fk`. Le join in `UtilitiesService`/`AssetsService` (`assets.utilizerGrants`) passano dal molti-a-uno alla join table.

## Valori calcolati (backend, non persistiti)

Funzioni pure in un helper dedicato, testate unitariamente:

- **Canone annuo**: `rent_amount × moltiplicatore(rent_period)` — mensile 12, bimestrale 6, trimestrale 4, semestrale 2, annuale 1, una tantum 0 (escluso dai totali annui). Assente se manca il canone.
- **Scadenza effettiva**: se `tacit_renewal` e `end_date < oggi`, `end_date + k × renewal_months` con il minimo `k` che porta la data a `>= oggi`; altrimenti `end_date`.
- **Termine disdetta**: solo con `tacit_renewal`: scadenza effettiva − `notice_months`.
- **Stato mostrato**:
  1. `RETURNED`, `TERMINATED`, `DISPUTED` dichiarati vincono;
  2. scadenza effettiva < oggi → `EXPIRED`;
  3. scadenza effettiva entro 4 mesi → `EXPIRING`;
  4. altrimenti `ACTIVE` (anche senza scadenza).

Restituiti in ogni riga dell'API: `annual_rent`, `effective_end_date`, `notice_deadline`, `computed_status`.

## Pulizia delle righe esistenti

Script one-off (Python in `.audit-w/contratti/`, fuori dal repo perché tratta dati reali, come gli import precedenti) con report JSON, in sola lettura su richiesta (`--dry-run`) e rieseguibile:

| Gruppo | Riconoscimento | Azione |
|---|---|---|
| Contratti veri | controparte reale (Azienda Speciale, SPRAR, associazioni, concessionari, parrocchie) o atto presente | restano; `kind` = `CONCESSION` (SPRAR: `LEASE`, `PASSIVE`); `direction` = `ACTIVE` salvo SPRAR |
| Destinazione d'uso | controparte = etichetta tecnica (pubblica illuminazione, cabine, pompe, fontane, semafori, taxi, videosorveglianza, pannelli) | soft delete; se la funzione dell'immobile è vuota la si imposta dalla mappa etichetta→`asset_functions` |
| Note di verifica | controparte che inizia con "VERIFICARE" / "NO recenti fatture" | soft delete; il testo viene accodato alle note delle utenze dell'immobile |
| Istituti scolastici | controparte = direzione didattica / istituto comprensivo / scuola | soft delete; abbinamento istituto–plesso salvato nel report (servirà ai complessi) |

La classificazione è una **mappa esplicita controparte → gruppo** nel codice dello script (circa 40 controparti distinte, elencate e verificate a mano), non un'euristica. Le controparti rimaste senza contratti vengono soft-deleted.

## Import iniziale

Script one-off (stessa posizione e pattern della pulizia), eseguito dopo di essa.

| Fonte | Mappatura |
|---|---|
| Locazioni attive | `ACTIVE`, `LEASE` (alloggi) — repertorio da "Nominativo - Rep. N" in `registration_ref`; stato: RESO → `RETURNED`, Deceduto/a → `TERMINATED`, Legale → `DISPUTED`; canone mensile |
| Locazioni passive | `PASSIVE`, `LEASE` — canone + periodicità dalla colonna, IVA, superficie, catasto, settore, contatti |
| SPRAR | `PASSIVE`, `LEASE`, canone annuo — arricchisce le concessioni SPRAR esistenti abbinate per indirizzo invece di duplicarle |
| Beni demaniali | `ACTIVE`, `LEASE`/`LAND_OCCUPATION` dalla tipologia, canone annuo, scadenza dalla colonna periodo, `registration_ref` = codice scheda + n. contratto |
| Case comunali | `ACTIVE`, `HOUSING_ASSIGNMENT`, figlie (`parent_contract_id`) della concessione all'Azienda Speciale per lo stesso edificio |
| Mercatino ittico | `ACTIVE`, `CONCESSION`, un contratto per box attualmente concesso, `subject` = box + lettera planimetria, `registration_ref` = numero concessione; tutti sull'immobile del mercatino |
| Canoni demaniali idrici | `PASSIVE`, `CONCESSION` (attraversamenti: `LAND_OCCUPATION`), controparte Regione Abruzzo, canone annuo dall'ultima annualità nota, `registration_ref` = estremi autorizzazione |
| Autoparco via Danubio | `PASSIVE`, `LEASE`, canone aggiornato con l'ultimo adeguamento ISTAT del prospetto, IVA |

Abbinamento immobile: indirizzo normalizzato e/o foglio+particella (`assets.sheet`/`parcel`). Nessun abbinamento forzato: se non è univoco, contratto importato senza immobile + riga in Excel "da abbinare".

Dati vecchi (fonti 2021–2023): importati così come sono, nessuno stato inventato; lo stato calcolato e la dashboard li segnalano.

## API

`utilizer-grant` (path invariati) — CRUD esistente esteso con i nuovi campi; `asset_ids: number[]` al posto di `asset_id_fk`; filtri aggiuntivi: `direction`, `kind`, `computed_status`, `alert` (`notice` = disdetta entro 60 gg, `expiring`, `expired_active`), `department`, `asset_id`.

Endpoint riepilogo `GET utilizer-grant/summary`: conteggi avvisi + totali annui entrate/uscite dei contratti con stato mostrato `ACTIVE`/`EXPIRING`.

Ruolo Lettore, oscuramento lato backend (lista, dettaglio e ovunque la controparte compaia annidata, es. utenze/immobili con `utilizerGrants`):

- `tax_code`: sempre `null` per i ruoli diversi da Admin/Operatore;
- nome e contatti: visibili.

## UI

- Menu Patrimonio: "Contratti immobiliari" (route invariata del vecchio modulo Concessioni) e, nelle Impostazioni, "Controparti" (ex Utilizzatori).
- **Elenco**: stesso schema Contratti di fornitura (tabella, scelta colonne, CSV, filtri). Colonne default: direzione (badge Entrata/Uscita), tipo, controparte, immobili, oggetto, canone annuo, scadenza effettiva, termine disdetta, stato mostrato (badge colorato). Totali in testa (entrate, uscite, saldo) sui contratti filtrati. Query param `?alert=notice|expiring|expired_active` per i link dalla dashboard.
- **Dialog contratto**, tab:
  - *Dati*: direzione, tipo, stato, controparte; oggetto, settore, atto; canone + periodicità (canone annuo calcolato sotto), IVA; decorrenza, scadenza, rinnovo tacito (mostra durata rinnovo e preavviso), utenze da volturare; registrazione, catasto, superficie, note;
  - *Immobili*: selezione multipla + contratto padre + elenco contratti figli;
  - *Storico*: audit log.
- **Dialog immobile**: tab "Contratti immobiliari" (sostituisce "Concessioni" se presente) con i contratti dell'immobile e "Nuovo contratto" con l'immobile precompilato.
- **Dashboard**: card "Contratti immobiliari" accanto ai contratti di fornitura: disdette da inviare entro 60 giorni, in scadenza entro 4 mesi (senza rinnovo tacito), scaduti ma dichiarati attivi, totali annui. Ogni voce apre l'elenco filtrato.
- **Anomalie**: nuova voce "contratti immobiliari senza immobile".

## Test

- Unit: helper valori calcolati (moltiplicatori, rinnovo tacito su più cicli, termine disdetta, precedenza stati, date al limite: oggi, fine mese, 29 febbraio).
- Unit: validazioni DTO/service (canone a coppia, rinnovo senza durata, ciclo padre).
- Unit: oscuramento del codice fiscale per il ruolo Lettore, anche annidato.
- Unit: mappa di classificazione della pulizia (ogni controparte distinta finisce in un gruppo; nessuna non classificata).
- Migration provata su copia del DB locale: 480 righe, join table popolata, `start_date` azzerata, `end_date` conservata.
- E2E Playwright: creazione contratto con rinnovo tacito, comparsa in dashboard "disdetta entro 60 giorni", filtro dall'avviso, vista Lettore senza codice fiscale.

## Rilascio

Minor (migration con modifiche a tabella esistente). Ordine in produzione: deploy (migration) → script pulizia → script import → verifica report. Gli script girano sul DB locale e arrivano in produzione con l'export/import già previsto, come per gli altri import di questa fase.
