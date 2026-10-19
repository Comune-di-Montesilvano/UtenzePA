# Import fatture da PEC SDI — Parte 1: motore di import e stato SDI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** lettura automatica della PEC SDI ogni 15 minuti, registro dei messaggi, collegamento alle fatture già presenti, stato SDI (ricevuta/accettata/rifiutata/decorsi i termini) con le rifiutate fuori dalla spesa, XML e PDF a video, interruttore del motore.

**Architecture:** modulo backend `invoice-import` (client IMAP sottile + funzioni pure di parsing SDI + service orchestratore registrato come cron) che scrive un registro `sdi_messages` e i campi SDI su `invoices`. L'identificazione della fattura usa i campi **obbligatori dello schema FatturaPA** (cedente, numero, data), uguali per tutti i fornitori: i pattern per fornitore servono solo per righe/utenze/consumi e arrivano nella **Parte 2** (piano separato: pattern, editor, creazione/arricchimento, consumi collegati, segnalazioni di differenza). In Parte 1 una fattura in perimetro non presente nel DB resta nel registro «in attesa»; la rimozione dei consumi delle rifiutate arriva con il collegamento riga → rilevazione della Parte 2 (oggi le rilevazioni `INVOICE` non sono collegate alle righe).

**Tech Stack:** NestJS 11 + TypeORM (MySQL 8), Angular 22 + Material; nuove dipendenze backend `imapflow`, `mailparser`, `fast-xml-parser` (tutte CommonJS).

**Spec:** `docs/superpowers/specs/2026-10-19-import-fatture-pec-design.md`

## Global Constraints

- Sola lettura su IMAP: apertura con `readOnly: true`, solo fetch; mai flag, move, delete.
- Variabili d'ambiente: `PEC_IMAP_HOST`, `PEC_IMAP_PORT` (default 993), `PEC_IMAP_TLS` (default `true`), `PEC_IMAP_USER`, `PEC_IMAP_PASSWORD`, `INVOICE_IMPORT_DISABLED` (`true` = motore forzato spento), `INVOICE_IMPORT_CRON` (default `*/15 * * * *`, `Europe/Rome`). Senza host/utente/password: motore «non configurato», nessun errore.
- Perimetro: soggetto terzo non cancellato con `vat_number` uguale a `IdFiscaleIVA/IdCodice` del cedente **e** fornitore di almeno un contratto di fornitura non cancellato.
- Stati SDI (enum `SdiStatus`, colonna `invoices.sdi_status`): `RECEIVED`, `ACCEPTED`, `REJECTED`, `DEADLINE_PASSED`; `NULL` = fattura senza messaggio SDI. Etichette UI: «Ricevuta», «Accettata», «Rifiutata», «Decorsi i termini».
- Rifiutata = fuori da ogni somma di spesa: condizione unica `NOT_REJECTED_SQL` (Task 3) in tutti i punti che leggono `invoices`.
- Scritture di sistema su `invoices` senza toccare «Ultima modifica»: `update_date: () => '\`update_date\`'`.
- Errori verso l'utente in italiano, sempre 400 (mai 409, mai 5xx voluti).
- Nessun file salvato: XML e PDF solo letti al momento dalla casella.
- Nessun dato reale nei test/fixture: P.IVA, POD e nomi fittizi.
- Sorgenti CRLF: modifiche preservando `\r\n`.
- Migration: scratch path, poi `backend/src/database/migrations/1795000000000-InvoiceImport.ts`; verificare la riga in `migrations`, `schema:log` pulito sulle tabelle toccate.
- jest: `MSYS_NO_PATHCONV=1 docker exec utenzepa-api-1 pnpm exec jest <path> --maxWorkers=2`, solo i file rilevanti.
- Dipendenze: dopo `pnpm add` nel container `chown -R 1000:1000 node_modules .pnpm-store`; verificare che lo spec jest le carichi (pacchetti ESM-only rompono jest, vedi `docs/claude/dependencies.md`).
- Versione `publiccode.yml`: `v1.35.0`. Guida aggiornata con data in testa. Mai `git add .`/`-A`.

## Review Focus

- Fattura firmata `.xml.p7m` codificata in **base64** invece che DER: va estratta lo stesso (test in Task 1).
- **Esito che arriva prima del collegamento** (EC/DT su una fattura ancora «in attesa» o collegata in un giro successivo): lo stato si ricalcola da tutti i messaggi del registro con lo stesso `IdentificativoSdI` al momento del collegamento (test in Task 5).
- **`UIDVALIDITY` cambiata** o messaggio già letto: nessun doppione nel registro (chiave unica `message_id` + `file_name`) e nessun doppio collegamento (test in Task 5).
- **IMAP che cade a metà giro**: `last_uid` avanza solo fino all'ultimo messaggio elaborato, errore salvato nello stato, il giro dopo riprende da lì (test in Task 5).
- **EC02 poi SE** (esito di rifiuto scartato dallo SDI): la fattura torna a contare nella spesa e compare tra le segnalazioni «esito scartato» (test in Task 3 e Task 6).

---

### Task 1: Parsing dei file SDI (funzioni pure)

**Files:**
- Create: `backend/src/apis/invoice-import/sdi/p7m.ts`, `backend/src/apis/invoice-import/sdi/sdi-files.ts`
- Create: `backend/src/apis/invoice-import/sdi/fixtures/` (XML fittizi + `fattura-firmata.xml.p7m` generata, vedi Step 1)
- Test: `backend/src/apis/invoice-import/sdi/sdi-files.spec.ts`
- Modify: `backend/package.json` (`imapflow`, `mailparser`, `fast-xml-parser@4`, `@types/mailparser` dev)

**Interfaces:**
- Produces:
  - `export function extractP7m(data: Buffer): Buffer` — contenuto firmato (eContent di SignedData). Accetta DER e base64 (anche con a capo). Lancia `Error('p7m illeggibile')`.
  - `export type SdiFileKind = 'INVOICE' | 'MT' | 'EC' | 'DT' | 'SE' | 'OTHER'`
  - `export function sdiFileKind(fileName: string): SdiFileKind` — `IT<11-16 alfanum>_<1-5 alfanum>.xml[.p7m]` = INVOICE; `<nome fattura>_(MT|EC|DT|SE)_<3 cifre>.xml` = quel tipo; RC/MC/NS/NE/AT e resto = OTHER.
  - `export interface InvoiceHeader { supplierVat: string; supplierName: string; documents: { type: string; number: string; date: string; total: number | null }[] }` (date `AAAA-MM-GG`, una voce per `FatturaElettronicaBody`)
  - `export function parseInvoiceHeader(xml: Buffer): InvoiceHeader` — `CedentePrestatore/DatiAnagrafici/IdFiscaleIVA/IdCodice`, `Anagrafica/Denominazione` (o Cognome + Nome), `DatiGeneraliDocumento/{TipoDocumento,Numero,Data,ImportoTotaleDocumento}`. Namespace ignorati.
  - `export function parseNotification(xml: Buffer): { sdiIdentifier: string; outcome: 'EC01' | 'EC02' | null; invoiceFileName: string | null }` — `IdentificativoSdI`, `Esito` (solo EC), `NomeFile` (MT).
  - `export function extractPdf(xml: Buffer): { name: string; data: Buffer } | null` — primo `Allegati` con `FormatoAttachment` PDF o nome `.pdf`, `Attachment` base64 decodificato.

- [ ] **Step 1: fixture.** XML FatturaPA minimale fittizio (cedente `IT01234567897` «Fornitore Prova S.p.A.», numero `FPR 1/26`, data `2026-07-10`, totale `122.00`, un allegato PDF base64 di poche righe), un MT, un EC01, un EC02, un DT, un SE, tutti con `IdentificativoSdI` `99000000001`. P7m generata e committata:
  `openssl req -x509 -newkey rsa:2048 -nodes -subj "/CN=prova" -keyout k.pem -out c.pem -days 1` poi `openssl cms -sign -nodetach -binary -in fattura.xml -signer c.pem -inkey k.pem -outform DER -out fattura-firmata.xml.p7m` (chiave e certificato non committati); copia base64 `fattura-firmata-b64.xml.p7m` con `base64 -w 76`.
- [ ] **Step 2: test che falliscono** in `sdi-files.spec.ts`:
  - `extractP7m: DER` e `extractP7m: base64` → buffer uguale a `fattura.xml`; `extractP7m(Buffer.from('xx'))` lancia `p7m illeggibile`.
  - `sdiFileKind`: `IT01234567897_a1B2c.xml` → INVOICE; `IT01234567897_a1B2c.xml.p7m` → INVOICE; `IT01234567897_a1B2c_EC_001.xml` → EC; `…_MT_001.xml` → MT; `…_DT_001.xml` → DT; `…_SE_001.xml` → SE; `…_RC_001.xml` → OTHER; `daticert.xml` → OTHER.
  - `parseInvoiceHeader(fattura.xml)` → `{supplierVat:'01234567897', supplierName:'Fornitore Prova S.p.A.', documents:[{type:'TD01', number:'FPR 1/26', date:'2026-07-10', total:122}]}`; XML con due body → due documenti.
  - `parseNotification`: EC01 → `{sdiIdentifier:'99000000001', outcome:'EC01', invoiceFileName:null}`; MT → `invoiceFileName:'IT01234567897_a1B2c.xml.p7m'`; DT → `outcome:null`.
  - `extractPdf(fattura.xml)` → nome e contenuto attesi; XML senza `Allegati` → `null`.
- [ ] **Step 3:** jest su `src/apis/invoice-import/sdi` → FAIL.
- [ ] **Step 4: implementazione.** `fast-xml-parser` con `removeNSPrefix: true`, `parseTagValue: false` (numeri come stringhe: P.IVA e numeri fattura con zeri iniziali), `isArray` per `FatturaElettronicaBody`/`Allegati`. `extractP7m` senza dipendenze: lettore ASN.1 BER minimo (lunghezze definite e indefinite) che scende `ContentInfo → [0] SignedData → encapContentInfo → [0] eContent` e concatena gli OCTET STRING anche se costruiti.
- [ ] **Step 5:** jest → PASS.
- [ ] **Step 6: commit** `feat(invoice-import): parsing dei file SDI e delle buste p7m`.

### Task 2: Messaggio PEC → file SDI

**Files:**
- Create: `backend/src/apis/invoice-import/sdi/pec-message.ts`
- Test: `backend/src/apis/invoice-import/sdi/pec-message.spec.ts`

**Interfaces:**
- Consumes: `sdiFileKind`, `extractP7m` (Task 1).
- Produces:
  - `export interface SdiFile { kind: SdiFileKind; fileName: string; content: Buffer }` (`content` = XML in chiaro, p7m già estratta)
  - `export interface PecMessage { messageId: string; date: Date | null; subject: string; files: SdiFile[] }`
  - `export async function parsePecMessage(raw: Buffer): Promise<PecMessage>` — tutti gli allegati SDI anche dentro `message/rfc822` annidati (busta PEC `postacert.eml`, ricevute di consegna con il messaggio originale); scarta `OTHER`; un file con lo stesso nome compare una sola volta.

- [ ] **Step 1: test che falliscono** con eml costruiti nel test (stringhe MIME, fixture del Task 1 come allegati):
  - `busta PEC con fattura p7m e MT` → due file (INVOICE con `content` = XML in chiaro, MT), `messageId` dell'intestazione esterna.
  - `ricevuta di consegna con EC annidato in message/rfc822` → un file EC.
  - `newsletter senza allegati SDI` → `files: []`.
  - `p7m illeggibile` → il file è saltato, il messaggio resta valido (nessuna eccezione).
- [ ] **Step 2:** jest → FAIL.
- [ ] **Step 3: implementazione** con `simpleParser` di `mailparser`; per ogni allegato `message/rfc822` ricorsione sul suo contenuto.
- [ ] **Step 4:** jest → PASS.
- [ ] **Step 5: commit** `feat(invoice-import): estrazione dei file SDI dai messaggi PEC`.

### Task 3: Stato SDI derivato e rifiutate fuori dalla spesa

**Files:**
- Create: `backend/src/apis/invoices/enum/sdi-status.enum.ts`, `backend/src/apis/invoices/sdi-status.ts`
- Test: `backend/src/apis/invoices/sdi-status.spec.ts`
- Modify: `backend/src/apis/spending/spending.service.ts` (`LINES`), `backend/src/apis/spending/chapter-year.ts` (`CHAPTER_LINES`), `backend/src/apis/anomalies/anomalies.service.ts` (query righe senza utenza e fuori periodo), `backend/src/apis/invoices/invoice.service.ts` (`getMonthlyCosts`), i rispettivi spec

**Interfaces:**
- Produces:
  - `export enum SdiStatus { RECEIVED = 'RECEIVED', ACCEPTED = 'ACCEPTED', REJECTED = 'REJECTED', DEADLINE_PASSED = 'DEADLINE_PASSED' }`
  - `export interface SdiEvent { kind: 'INVOICE' | 'EC' | 'DT' | 'SE'; outcome: 'EC01' | 'EC02' | null; at: Date }`
  - `export function deriveSdiStatus(events: SdiEvent[]): { status: SdiStatus | null; outcomeDiscarded: boolean }`
  - `export const NOT_REJECTED_SQL = (alias: string) => string` → `(${alias}.sdi_status IS NULL OR ${alias}.sdi_status <> 'REJECTED')`

Regola di `deriveSdiStatus` (eventi in ordine di `at`): nessun evento `INVOICE` → `null`; ultimo EC valido decide (EC01 → ACCEPTED, EC02 → REJECTED); un SE annulla l'EC che lo precede (torna allo stato senza esito, `outcomeDiscarded = true` finché non arriva un EC successivo); senza EC valido: DT → DEADLINE_PASSED, altrimenti RECEIVED.

- [ ] **Step 1: test che falliscono:** solo INVOICE → RECEIVED; INVOICE+EC01 → ACCEPTED; INVOICE+EC02 → REJECTED; INVOICE+DT → DEADLINE_PASSED; INVOICE+EC02+SE → RECEIVED con `outcomeDiscarded:true`; INVOICE+EC02+SE+EC01 → ACCEPTED, `outcomeDiscarded:false`; INVOICE+DT+EC02+SE → DEADLINE_PASSED, `outcomeDiscarded:true`; eventi fuori ordine nell'array → stesso risultato; nessun INVOICE → `null`. Negli spec di spending/chapter-year/anomalies/invoice: la query generata contiene `NOT_REJECTED_SQL('i')` (o l'alias del query builder per `getMonthlyCosts`).
- [ ] **Step 2:** jest sui file toccati → FAIL.
- [ ] **Step 3: implementazione.** `NOT_REJECTED_SQL` aggiunto alle condizioni di `JOIN invoices i` nei quattro punti e a `getMonthlyCosts`.
- [ ] **Step 4:** jest → PASS.
- [ ] **Step 5: commit** `feat(invoices): stato SDI e fatture rifiutate escluse dalla spesa`.

### Task 4: Modello dati e migration

**Files:**
- Create: `backend/src/apis/invoice-import/entity/sdi-message.entity.ts`, `backend/src/apis/invoice-import/entity/invoice-import-state.entity.ts`, `backend/src/apis/invoice-import/enum/sdi-message-status.enum.ts`
- Modify: `backend/src/apis/invoices/entity/invoice.entity.ts`
- Create: `backend/src/database/migrations/1795000000000-InvoiceImport.ts`

**Interfaces:**
- Produces:
  - `invoices`: `sdi_identifier varchar(20) NULL` (indice, non unico: un file può contenere più fatture), `sdi_status enum(SdiStatus) NULL`, `sdi_outcome_discarded boolean NOT NULL DEFAULT false`.
  - `sdi_messages` (`SdiMessage`): `id`, `uid_validity bigint`, `uid bigint`, `message_id varchar(255)`, `received_at datetime NULL`, `kind enum('INVOICE','EC','DT','SE')`, `file_name varchar(255)`, `sdi_identifier varchar(20) NULL` (indice), `outcome varchar(4) NULL`, `supplier_vat varchar(16) NULL`, `supplier_id_fk int NULL` (FK `third_parties`), `document_number varchar(255) NULL`, `document_date date NULL`, `status enum(SdiMessageStatus)`, `error varchar(500) NULL`, `create_date`, `update_date`; `UNIQUE(message_id, file_name)`. MT non ha riga propria: il suo `IdentificativoSdI` finisce sulla riga INVOICE dello stesso messaggio.
  - `export enum SdiMessageStatus { LINKED = 'LINKED', PENDING = 'PENDING', OUT_OF_SCOPE = 'OUT_OF_SCOPE', NOTIFICATION = 'NOTIFICATION', ERROR = 'ERROR' }` (PENDING = in perimetro ma fattura non presente: la Parte 2 la crea).
  - `invoice_import_state` (`InvoiceImportState`, singleton id 1 come `app_settings`): `enabled boolean NOT NULL DEFAULT false`, `uid_validity bigint NULL`, `last_uid bigint NULL`, `last_run_at datetime NULL`, `last_success_at datetime NULL`, `last_error varchar(500) NULL`. Migration inserisce la riga id 1 con `enabled = 0` (si accende a mano dopo il rilascio).

- [ ] **Step 1:** entity; `migration:generate` nel container (comando in `docs/claude/backend.md`) in scratch path, tenuti solo gli statement di queste tabelle/colonne + `INSERT` della riga di stato; `down` speculare.
- [ ] **Step 2:** spostata in `src/database/migrations/`; riga presente in `migrations` (altrimenti `docker restart utenzepa-api-1`); `schema:log` senza statement su `invoices`, `sdi_messages`, `invoice_import_state`; ciclo `migration:revert` → riavvio → riga di nuovo presente.
- [ ] **Step 3: commit** `feat(invoice-import): registro messaggi SDI e stato del motore`.

### Task 5: Motore di import

**Files:**
- Create: `backend/src/apis/invoice-import/pec-imap.client.ts`, `backend/src/apis/invoice-import/invoice-import.service.ts`, `backend/src/apis/invoice-import/invoice-import.controller.ts`, `backend/src/apis/invoice-import/dto/update-invoice-import.dto.ts`, `backend/src/apis/invoice-import/invoice-import.module.ts`
- Modify: `backend/src/app.module.ts`, `docker-compose.yml`, `docker-compose.override.yml`, `.env.example`
- Test: `backend/src/apis/invoice-import/invoice-import.service.spec.ts`, `backend/src/apis/invoice-import/pec-imap.client.spec.ts`

**Interfaces:**
- Consumes: `parsePecMessage` (Task 2), `parseInvoiceHeader`, `parseNotification` (Task 1), `deriveSdiStatus` (Task 3), entity del Task 4.
- Produces:
  - `export function imapConfigFromEnv(env: NodeJS.ProcessEnv): ImapConfig | null` (`null` se manca host, utente o password).
  - `export interface PecMailbox { open(): Promise<{ uidValidity: number }>; fetchSince(lastUid: number): AsyncIterable<{ uid: number; raw: Buffer }>; fetchRaw(uidValidity: number, uid: number, messageId: string): Promise<Buffer | null>; close(): Promise<void> }` — implementazione `ImapPecMailbox` con `imapflow` (`mailboxOpen('INBOX', { readOnly: true })`, `fetch({uid: '<last+1>:*'}, {source: true}, {uid: true})`; `fetchRaw` cerca per UID se `uidValidity` coincide, altrimenti `search({header: {'message-id': …}})`).
  - Token di iniezione `PEC_MAILBOX_FACTORY` (`() => PecMailbox`), così lo spec usa una casella finta.
  - `InvoiceImportService.runOnce(): Promise<{ processed: number; linked: number; pending: number }>`; `getStatus(): Promise<InvoiceImportStatus>` (`{configured, forcedOff, enabled, running, last_run_at, last_success_at, last_error, counts: Record<SdiMessageStatus, number>}`); `setEnabled(enabled: boolean, userId: number)`.
  - REST (prefisso `invoice-import`): `GET /status` (Admin), `PATCH /` body `{enabled: boolean}` (Admin), `POST /run` (Admin; 400 «Import non configurato.» / «Import spento.» / «Import già in corso.»).

Comportamento di `runOnce`:
1. Esce subito (senza toccare lo stato) se non configurato, `INVOICE_IMPORT_DISABLED=true`, `enabled = false`, `maintenance.active`, o un giro è già in corso (flag in memoria).
2. `open()`; se `uidValidity` diverso da quello salvato → `last_uid = 0` (rilettura; i doppioni sono evitati dalla chiave unica).
3. Per ogni messaggio in ordine di UID: `parsePecMessage`; per ogni file INVOICE: header → fornitore in perimetro? no → riga `OUT_OF_SCOPE`; sì → per ogni documento cerca `invoices` non cancellata con stesso `supplier_id_fk`, `invoice_id` = numero, `invoice_date` = data → trovata: `sdi_identifier` (dall'MT dello stesso messaggio, altrimenti dal numero nell'oggetto «Invio File <n>»; se manca anche quello la riga va in `ERROR` «Identificativo SDI mancante» e la fattura non si tocca) e riga `LINKED`; non trovata: riga `PENDING`. EC/DT/SE → riga `NOTIFICATION` con `sdi_identifier` e `outcome`. Poi, per ogni `sdi_identifier` toccato, ricalcolo dello stato di tutte le fatture con quell'identificativo da tutte le righe del registro (`deriveSdiStatus`), scritto senza toccare `update_date`.
4. Dopo ogni messaggio elaborato salva `last_uid`; a fine giro `last_success_at`, `last_error = null`. Eccezione: `last_error` (primi 500 caratteri), `last_run_at`, nessun avanzamento oltre l'ultimo messaggio completato. `close()` sempre.

Cron nel modulo (come `utility-consumptions.module.ts`): `new CronJob(process.env.INVOICE_IMPORT_CRON ?? '*/15 * * * *', () => this.service.runOnce(), null, false, 'Europe/Rome')`, nome `invoice-import`.

- [ ] **Step 1: test che falliscono** (casella finta che restituisce eml costruiti come nel Task 2, repository mock come gli altri spec):
  - `imapConfigFromEnv`: completo → config con porta 993 e TLS true di default; senza password → `null`.
  - `non configurato / spento / forzato spento / in manutenzione` → nessuna chiamata a `open()`.
  - `fattura di fornitore fuori perimetro` → riga `OUT_OF_SCOPE`, nessuna fattura toccata.
  - `fattura presente` → `invoices.sdi_identifier = '99000000001'`, `sdi_status = RECEIVED`, riga `LINKED`; `update` senza `update_date`.
  - `fattura assente` → riga `PENDING`.
  - `EC02 arrivato prima del collegamento` (giro 1: solo ricevuta EC02; giro 2: fattura) → dopo il giro 2 `sdi_status = REJECTED`.
  - `stesso messaggio riletto (uidValidity cambiata)` → nessuna riga nuova, collegamento invariato.
  - `errore a metà` (la casella lancia al terzo messaggio) → `last_uid` = uid del secondo, `last_error` valorizzato, `last_success_at` invariato.
  - `giro già in corso` → la seconda chiamata esce senza `open()`.
- [ ] **Step 2:** jest → FAIL.
- [ ] **Step 3: implementazione** secondo le interfacce. Variabili d'ambiente aggiunte al servizio `api` in entrambi i compose (`PEC_IMAP_HOST=${PEC_IMAP_HOST:-}` ecc., `INVOICE_IMPORT_DISABLED=${INVOICE_IMPORT_DISABLED:-false}`; in `docker-compose.override.yml` default `true`) e documentate in `.env.example`.
- [ ] **Step 4:** jest → PASS.
- [ ] **Step 5: prova reale in locale** con le credenziali di `.env.pec` copiate in `.env` e `INVOICE_IMPORT_DISABLED=false`: `POST /invoice-import/run` con utente Admin temporaneo (login via API) → `GET /status` con conteggi coerenti con l'analisi (`LINKED` ≈ 502 su DB locale, `NOTIFICATION` ≈ 1.345); stati: almeno una fattura `REJECTED` e una `ACCEPTED`. Poi `INVOICE_IMPORT_DISABLED=true` di nuovo.
- [ ] **Step 6: commit** `feat(invoice-import): motore di lettura della PEC SDI`.

### Task 6: XML/PDF a video e segnalazioni

**Files:**
- Modify: `backend/src/apis/invoice-import/invoice-import.service.ts`, `backend/src/apis/invoices/invoice.controller.ts`, `backend/src/apis/anomalies/anomalies.service.ts`
- Test: `backend/src/apis/invoice-import/invoice-import.service.spec.ts`, `backend/src/apis/anomalies/anomalies.service.spec.ts`

**Interfaces:**
- Consumes: `PecMailbox.fetchRaw`, `parsePecMessage`, `extractPdf`.
- Produces:
  - `InvoiceImportService.getDocument(invoiceId: number, type: 'xml' | 'pdf'): Promise<{ contentType: string; data: Buffer }>` — dalla riga `LINKED` della fattura; 400 «Fattura senza messaggio SDI.» o «Non più disponibile sulla PEC: cercare la fattura nel protocollo.».
  - `GET /invoices/:id/sdi-document?type=xml|pdf` (Admin, Operatore, Lettore), `Content-Disposition: inline`.
  - Anomalie aggiunte **in fondo** a `getAnomalies()` (la spec usa mock posizionali):
    - `invoice_import_stalled: AnomalyList<{ last_success_at: string | null; last_error: string | null }>` — un elemento se configurato, non forzato spento, `enabled` e `last_success_at` più vecchio di 2 ore (o nullo con `last_run_at` valorizzato).
    - `invoice_import_pending: AnomalyList<{ id: number; supplier: string; number: string; date: string }>` — righe `PENDING`.
    - `invoice_sdi_outcome_discarded: AnomalyList<{ invoice_id: number; number: string }>` — fatture con `sdi_outcome_discarded = true`.

- [ ] **Step 1: test che falliscono:** `getDocument` xml → XML in chiaro (`application/xml`); pdf → `application/pdf` dal `Allegati`; messaggio sparito (`fetchRaw` → `null`) → 400 col messaggio del protocollo; fattura senza riga → 400. Anomalie: tre nuove liste coi casi presente/assente (mock aggiunti in coda).
- [ ] **Step 2:** jest → FAIL. **Step 3:** implementazione. **Step 4:** jest → PASS.
- [ ] **Step 5: commit** `feat(invoice-import): XML e PDF dalla PEC e segnalazioni dell'import`.

### Task 7: Frontend

**Files:**
- Create: `frontend/src/app/pages/backup-import/invoice-import-tab.component.ts`, `frontend/src/app/pages/backup-import/invoice-import.service.ts`, `frontend/src/app/pages/invoices/sdi-document-dialog.component.ts`, `frontend/src/app/pages/invoices/sdi-status.ts`
- Modify: `frontend/src/app/pages/backup-import/backup-import.component.html`/`.ts`, `frontend/src/app/pages/invoices/invoices-filters.ts`, `data-table-invoices.component.*`, `invoice-edit-dialog.component.*`, `pages/invoices/entity/*` (campi `sdi_status`, `sdi_identifier`), `backend/src/apis/invoices/dto/search-invoice.dto.ts` + `invoice.service.ts` (filtro `sdi_status`, valore `NONE` = `IS NULL`), `frontend/src/app/pages/dashboard/anomalies-card.component.ts`

**Interfaces:**
- Consumes: REST dei Task 5–6.
- Produces: `SDI_STATUS_LABELS: Record<SdiStatus, string>` in `pages/invoices/sdi-status.ts` (gemello del backend).

- [ ] **Step 1: tab «Import fatture»** in Backup e manutenzione (solo Admin): stato (non configurato / forzato spento / acceso / spento), interruttore (`PATCH`), «Esegui ora» (`POST /run`, poi ricarica), ultimo giro, ultimo successo, ultimo errore, conteggi per stato del registro; testo che ricorda di spegnere il motore prima di export/import del DB.
- [ ] **Step 2: elenco fatture:** colonna «Stato SDI» (badge, vuoto se `null`), filtro select «Stato SDI» (le quattro etichette + «Senza messaggio SDI»), segnalazione `invoice_sdi_outcome_discarded` in `INVOICE_SIGNALS` («Esito scartato dallo SDI»).
- [ ] **Step 3: scheda fattura:** badge di stato nell'intestazione (toni: Rifiutata = errore, Accettata = successo, Decorsi i termini = neutro, Ricevuta = info, solo token `--tone-*`); con `sdi_identifier`: bottoni «Vedi XML» e «Vedi PDF» che aprono `sdi-document-dialog` (`MatDialog` con `maxWidth`, XML in `<pre>`, PDF in `<iframe>` da object URL di una richiesta `HttpClient` `responseType: 'blob'`, revocato alla chiusura); errore 400 mostrato nel dialog col messaggio del backend.
- [ ] **Step 4: dashboard:** voci nel riquadro anomalie per `invoice_import_stalled` («Import fatture fermo»), `invoice_import_pending` («Fatture PEC in attesa di import»), `invoice_sdi_outcome_discarded`.
- [ ] **Step 5:** `docker exec utenzepa-frontend-1 pnpm run build` → ok; Playwright: tab Import fatture visibile con i conteggi del Task 5; elenco filtrato per «Rifiutata»; scheda di una rifiutata con badge, XML e PDF a video; scheda spesa dell'utenza di quella fattura senza il suo importo.
- [ ] **Step 6: commit** `feat(invoices): stato SDI, XML e PDF a video, pannello import fatture`.

### Task 8: Guida, documentazione e rilascio

**Files:**
- Modify: `frontend/public/guida/guida.md`, `docs/roadmap-patrimonio.md` (voce 6: Parte 1 fatta, Parte 2 da fare), `CLAUDE.md` (modulo `invoice-import` nell'elenco `src/apis/`, riga di dominio sull'import PEC e su `NOT_REJECTED_SQL`), `publiccode.yml` (`v1.35.0`, data)

- [ ] **Step 1: guida** (data in testa): sezione import fatture da PEC (cosa fa, ogni 15 minuti, sola lettura), stati SDI, «Vedi XML/PDF» e «Non più disponibile sulla PEC», pannello Import fatture e interruttore (spegnere prima di export/import del DB), segnalazioni; FAQ «La fattura rifiutata non compare nella spesa». Voce `GUIDA_PER_PAGINA` se il titolo citato cambia.
- [ ] **Step 2:** `docker exec utenzepa-frontend-1 pnpm run build` → ok (`check-guida`).
- [ ] **Step 3: commit** `docs: guida e roadmap import fatture da PEC (v1.35.0)`.
- [ ] **Step 4: note di rilascio** (nel corpo della PR): aprire TCP 993 in uscita dal server di produzione verso `mbox.cert.legalmail.it`; valorizzare `PEC_IMAP_*`; accendere il motore dal pannello dopo il primo avvio; il primo giro legge tutta la casella (circa 3 mesi).
