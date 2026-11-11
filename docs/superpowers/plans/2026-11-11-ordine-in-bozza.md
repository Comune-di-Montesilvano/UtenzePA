# Ordine in bozza — piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** un contratto di fornitura può essere una bozza (ordine non ancora emesso, CIG facoltativo, date previste obbligatorie) che non vale come contratto in nessun controllo esistente e servirà solo al calcolo del fabbisogno.

**Architecture:** una colonna `contracts.draft`; le regole della bozza in una funzione pura (`contract-draft.ts`) usata dal service; un frammento SQL condiviso `NOT_DRAFT_SQL` aggiunto a ogni query che cerca un contratto «valido»; nel frontend un campo sul form, un badge e l'esclusione delle bozze dai tre punti che leggono i contratti aperti.

**Tech Stack:** NestJS 11 + TypeORM su MySQL 8, Angular 22 + Angular Material, jest (backend), Vitest (frontend).

**Spec:** `docs/superpowers/specs/2026-11-11-fabbisogno-convenzione-design.md`, sezione «Ordine in bozza». Questo piano copre solo la prima delle due PR del design; il fabbisogno ha un piano suo, da scrivere dopo il merge di questa.

## Global Constraints

- Rilascio **v1.55.0** (minor: c'è una migration): `softwareVersion` e `releaseDate` in `publiccode.yml` nella stessa PR. Il fabbisogno diventa v1.56.0.
- Una bozza **non è un contratto valido**: non copre l'utenza, non entra nei controlli di sovrapposizione, CIG mancante, manutenzione a carico, capitoli impegnati sul contratto, e l'import (PEC e contabilità) non la sceglie mai.
- Gli impegni **si possono** collegare a una bozza.
- Un contratto vero non torna bozza. Le date di fornitura sono obbligatorie sulla bozza.
- Conflitti e validazioni: sempre **400** con messaggio per la UI, mai 409.
- Nessun dato dell'ente nel codice; nei test solo id e nomi fittizi.
- Migration scritta in uno scratch path e spostata in `backend/src/database/migrations/` solo a contenuto finale; poi `rm -rf dist tsconfig.build.tsbuildinfo` + `docker restart utenzepa-api-1` e verifica della riga in `migrations`.
- Comandi Docker uno alla volta. jest sempre con `--maxWorkers=2`, solo i file toccati; la suite intera la fa la CI.
- Sorgenti CRLF: modifiche con Edit, mai `sed -i`; prima di `git add` controllare `git diff --numstat` e scartare i file con solo rumore di fine riga. Mai `git add .`.
- Ogni modifica visibile all'utente aggiorna `frontend/public/guida/guida.md` nella stessa PR, con la data in testa.

## Review Focus

1. **Bozza sull'unica copertura dell'utenza**: un'utenza attiva collegata solo a una bozza deve restare nella segnalazione «senza contratto di fornitura valido» (Task 2).
2. **Bozza e contratto vero sulla stessa utenza nello stesso periodo**: nessuna segnalazione di contratti sovrapposti, è il caso d'uso normale (Task 2).
3. **Bozza con un CIG già scritto**: l'import PEC e l'import della contabilità non devono agganciarle fatture né impegni per CIG (Task 3).
4. **Bozza creata come rinnovo** (`replaces_contract_id`): il contratto precedente non va chiuso finché l'ordine non è emesso (Task 1).
5. **Promozione senza CIG**: togliere la spunta Bozza su un contratto Ordinario senza CIG deve dare il solito errore di CIG obbligatorio, non salvare (Task 1).

---

### Task 1: colonna `draft` e regole della bozza

**Files:**
- Create: `backend/src/apis/contracts/contract-draft.ts`, `backend/src/apis/contracts/contract-draft.spec.ts`
- Create: `backend/src/database/migrations/1796600000000-ContractDraft.ts` (dallo scratch path)
- Modify: `backend/src/apis/contracts/entity/contract.entity.ts`, `dto/create-contract.dto.ts`, `dto/update-contract.dto.ts`, `dto/search-contract.dto.ts`, `contracts.service.ts`
- Test: `backend/src/apis/contracts/contract-draft.spec.ts`, `backend/src/apis/contracts/contracts.service.spec.ts`

**Interfaces:**
- Produces: `Contract.draft: boolean` (colonna `draft tinyint NOT NULL DEFAULT 0`); filtro di ricerca `draft?: boolean` (con `Transform` esplicito come `deleted`, mai `@Type(() => Boolean)`);
  ```ts
  // contract-draft.ts
  export const NOT_DRAFT_SQL = (alias: string): string => `${alias}.draft = 0`;
  export interface DraftState { draft?: boolean | null; closed?: boolean | null; supply_start_date?: string | null; supply_expiry_date?: string | null }
  /** Messaggio d'errore per la UI, o null se lo stato è ammesso. `before` = stato salvato (assente in creazione). */
  export function draftError(next: DraftState, before?: Pick<DraftState, 'draft'>): string | null;
  ```

- [ ] **Step 1: test della funzione pura** in `contract-draft.spec.ts`

```ts
const dates = { supply_start_date: '2027-01-01', supply_expiry_date: '2027-12-31' };
it('ammette un contratto non in bozza senza date', () => expect(draftError({ draft: false })).toBeNull());
it('ammette una bozza con le due date', () => expect(draftError({ draft: true, ...dates })).toBeNull());
it('chiede le date alla bozza', () => {
  const msg = 'Una bozza deve avere le date di fornitura previste (inizio e scadenza).';
  expect(draftError({ draft: true, supply_start_date: '2027-01-01' })).toBe(msg);
  expect(draftError({ draft: true })).toBe(msg);
});
it('rifiuta una bozza chiusa', () =>
  expect(draftError({ draft: true, closed: true, ...dates })).toBe('Una bozza non può essere chiusa: eliminala oppure togli la spunta Bozza.'));
it('rifiuta il ritorno in bozza', () =>
  expect(draftError({ draft: true, ...dates }, { draft: false })).toBe('Un contratto già emesso non può tornare in bozza.'));
it('ammette la promozione', () => expect(draftError({ draft: false, ...dates }, { draft: true })).toBeNull());
it('NOT_DRAFT_SQL usa l\'alias', () => expect(NOT_DRAFT_SQL('c')).toBe('c.draft = 0'));
```

- [ ] **Step 2: eseguire, deve fallire** — `docker exec utenzepa-api-1 sh -c "cd /usr/src/app && pnpm exec jest src/apis/contracts/contract-draft.spec.ts --maxWorkers=2"` → FAIL (modulo inesistente).

- [ ] **Step 3: implementare `contract-draft.ts`** con le firme sopra. Ordine dei controlli: ritorno in bozza, chiusa, date.

- [ ] **Step 4: test del service** in `contracts.service.spec.ts`, nello stile dei mock già presenti nel file:
  - `create` con `{ draft: true, contract_kind: STANDARD, cig_contract: '' , ...dates }` non lancia (niente «CIG obbligatorio»);
  - `create` con `{ draft: true }` senza date → `BadRequestException` col messaggio delle date;
  - `create` con `{ draft: true, replaces_contract_id: 7, ...dates }` → il contratto 7 **non** viene salvato né chiuso (nessun `manager.save` sul precedente, nessun audit UPDATE);
  - `update` di un contratto con `draft: false` salvato, dto `{ draft: true }` → 400 «Un contratto già emesso non può tornare in bozza.»;
  - `update` di una bozza Ordinaria senza CIG con dto `{ draft: false }` → 400 col messaggio esistente di CIG obbligatorio;
  - `update` di una bozza con dto `{ supply_start_date: null }` → 400 col messaggio delle date (si valuta lo stato risultante: dto sopra il salvato).

- [ ] **Step 5: eseguire, devono fallire** — stesso comando sul file `contracts.service.spec.ts`.

- [ ] **Step 6: entity, DTO e service.**
  - Entity: `@Column({ type: 'boolean', default: false }) draft: boolean;`.
  - DTO create/update: `@IsOptional() @IsBoolean() draft?: boolean;`. Search: `draft?: boolean` con `Transform`.
  - `ContractsService.create`/`update`: calcolare lo stato risultante (dto sopra `before`), `draftError(...)` → `BadRequestException`; `assertCigPresent` saltato se lo stato risultante è bozza; `assertCigAvailable` invariato (un CIG scritto su una bozza resta univoco); in `create`, se bozza, `replaces_contract_id` non chiude il precedente (il rinnovo si completa a mano dopo l'emissione). `findAll`: filtro `draft`.

- [ ] **Step 7: migration** `ContractDraft1796600000000`: `up` = `ALTER TABLE contracts ADD draft tinyint NOT NULL DEFAULT 0`, `down` = `DROP COLUMN draft`. Scriverla nello scratch path, spostarla, poi `rm -rf dist tsconfig.build.tsbuildinfo` e `docker restart utenzepa-api-1`.

- [ ] **Step 8: verifiche** — i due spec PASS; `SELECT name FROM migrations ORDER BY id DESC LIMIT 1` = `ContractDraft1796600000000`; `schema:log` (comando in `docs/claude/backend.md`) senza statement su `contracts`.

- [ ] **Step 9: commit** — `feat(contracts): ordine in bozza, colonna e regole` (file elencati uno a uno).

---

### Task 2: la bozza fuori dai controlli sul contratto valido

**Files:**
- Modify: `backend/src/apis/anomalies/anomalies.service.ts`, `backend/src/apis/utility/utility.service.ts`, `backend/src/apis/utility/maintenance-status.ts`, `backend/src/apis/consip-agreement/consip-agreement.service.ts`
- Test: `backend/src/apis/anomalies/anomalies.service.spec.ts`, lo spec di `maintenance-status` (se esiste accanto al file, altrimenti crearlo)

**Interfaces:**
- Consumes: `NOT_DRAFT_SQL(alias)` e `Contract.draft` dal Task 1.
- Produces: chiave nuova in `GET /anomalies`: `contracts_draft_overdue: { id: number; cig_contract: string | null; supply_start_date: string }[]`; `draft` tra i campi dei contratti restituiti da `GET /consip-agreement/:id`.

Dove aggiungere `NOT_DRAFT_SQL` (riferimenti di riga alla v1.54.1):

| File | Punto | Cosa |
|---|---|---|
| `anomalies.service.ts:31` | costante del contratto in corso | aggiungere alla condizione: copre «senza contratto valido» e «solo contratti senza CIG» |
| `anomalies.service.ts:248` | contratti senza CIG | escludere le bozze |
| `anomalies.service.ts:284,286` | contratti sovrapposti | escludere su `c1` e `c2` |
| `anomalies.service.ts:457` | capitolo non impegnato sul contratto | escludere |
| `anomalies.service.ts:297` | CIG duplicati | **invariato** (un CIG scritto resta univoco) |
| `utility.service.ts:154,195` | contratto corrente dell'utenza | escludere |
| `maintenance-status.ts:53,79` | manutenzione inclusa (JS e SQL gemelli) | escludere; `draft?: boolean \| number \| null` nel tipo del contratto |

Restano invariati di proposito: collegamento impegni ↔ contratti (`budget-commitments/`), `third-parties.service.ts:109` (ruolo fornitore), `spending.service.ts`.

- [ ] **Step 1: test** — in `anomalies.service.spec.ts` aggiungere il mock posizionale della query nuova **in fondo**, aggiornare `toHaveBeenCalledTimes` del test «aggrega le 5 categorie», e un test che la risposta contiene `contracts_draft_overdue` con le righe del mock. Nello spec di `maintenance-status`: un contratto `{ maintenance_included: true, draft: true }` non dà «Fornitore»; lo stesso con `draft: false` sì.

- [ ] **Step 2: eseguire, devono fallire** — `docker exec utenzepa-api-1 sh -c "cd /usr/src/app && pnpm exec jest src/apis/anomalies src/apis/utility/maintenance-status --maxWorkers=2"`.

- [ ] **Step 3: applicare la tabella** e aggiungere in fondo a `getAnomalies()` la query `contracts_draft_overdue`: contratti con `deleted = 0 AND draft = 1 AND supply_start_date < CURDATE()`, ordinati per data.

- [ ] **Step 4: eseguire, devono passare.**

- [ ] **Step 5: prova sui dati** (Review Focus 1 e 2) — sul DB locale mettere `draft = 1` a un contratto in corso con utenze, chiamare `GET /anomalies` (utente temporaneo, `docs/claude/testing-e2e.md`) e controllare: le sue utenze senza altri contratti compaiono in «senza contratto valido»; nessuna nuova voce in «contratti sovrapposti». Poi rimettere `draft = 0` e cancellare l'utente temporaneo e le sue righe di accesso in `audit_logs`.

- [ ] **Step 6: commit** — `feat(contracts): bozze fuori dai controlli sul contratto valido, segnalazione bozze scadute`.

---

### Task 3: la bozza invisibile agli import

**Files:**
- Modify: `backend/src/apis/invoice-import/invoice-matcher.service.ts`, `backend/src/apis/invoice-import/invoice-import.service.ts`, `backend/src/apis/accounting-import/accounting-data.service.ts`, `accounting-invoice.service.ts`, `link-applier.service.ts`
- Test: gli spec accanto a questi file che verificano il testo o l'esito delle query toccate

**Interfaces:**
- Consumes: `NOT_DRAFT_SQL(alias)` dal Task 1.

| File | Query | Cosa |
|---|---|---|
| `invoice-matcher.service.ts` | `m_contract_ref`, `m_contract`, `m_header_contract` | escludere le bozze: nessuna fattura si aggancia a una bozza, nemmeno per CIG |
| `invoice-matcher.service.ts:69-70` | abbinamento dell'utenza per codice cliente | **invariato** (riguarda l'utenza, non il contratto) |
| `invoice-import.service.ts:94,103` | perimetro: fornitore con contratto di fornitura | escludere: una bozza da sola non mette un fornitore in perimetro |
| `accounting-data.service.ts:18` | stesso perimetro per la contabilità | escludere |
| `accounting-invoice.service.ts:24` (`a_contracts`), `link-applier.service.ts:17` (`l_contracts`) | contratti per CIG | escludere |

- [ ] **Step 1: test** — per ogni query toccata, nello spec esistente del file: dove lo spec controlla il testo SQL, `expect(sql).toContain('draft = 0')`; dove usa mock per marcatore (`/* m_contract */` ecc.), un caso in cui l'unico contratto col CIG della fattura è una bozza → nessun contratto abbinato (stesso esito di «CIG non trovato»). Se un file non ha spec per quella query, aggiungere il solo controllo sul testo esportando la costante SQL.

- [ ] **Step 2: eseguire, devono fallire** — `docker exec utenzepa-api-1 sh -c "cd /usr/src/app && pnpm exec jest src/apis/invoice-import src/apis/accounting-import --maxWorkers=2"`.

- [ ] **Step 3: applicare la tabella.**

- [ ] **Step 4: eseguire, devono passare.**

- [ ] **Step 5: commit** — `feat(contracts): bozze escluse dall'import fatture e dalla contabilità`.

---

### Task 4: frontend

**Files:**
- Modify: `frontend/src/app/pages/contracts/entity/contract.entity.ts`, `entity/contract.interface.ts`, `contract-edit-dialog.component.ts`, `contract-edit-dialog.component.html`, `contracts-filters.ts`, `data-table-contracts.component.ts`
- Modify: `frontend/src/app/core/helpers/entity-status.ts`, `frontend/src/app/pages/utilities/utility-edit-dialog.component.ts`, `frontend/src/app/pages/consip-agreement/consip-agreement-sheet.component.ts`, `frontend/src/app/pages/commitments/commitment-sheet.component.ts`
- Test: lo spec di `entity-status` (crearlo se manca), Vitest

**Interfaces:**
- Consumes: campo `draft` nelle risposte dei contratti, filtro `draft` e chiave `contracts_draft_overdue` di `GET /anomalies` (Task 1 e 2).

- [ ] **Step 1: test** dello stato del contratto in `entity-status`: un contratto `{draft: true}` dà etichetta `Bozza` (prima di ogni altro stato, anche con scadenza passata); un contratto `{draft: true, cig_contract: ''}` **non** produce l'avviso di CIG mancante (`entity-status.ts:204`).

- [ ] **Step 2: eseguire, deve fallire** — `docker exec utenzepa-frontend-1 sh -c "pnpm exec ng test --watch=false --include=src/app/core/helpers/entity-status.spec.ts"`.

- [ ] **Step 3: implementare.**
  - `Contract`: `draft?: boolean`; nel payload di salvataggio; il metodo a `contract.entity.ts:48` (contratto in corso) dà `false` per le bozze.
  - `entity-status.ts`: badge `Bozza` (un tono già esistente, icona `edit_note`), prima del controllo `closed`; niente avviso CIG sulle bozze.
  - Dialog: checkbox **Bozza (ordine non ancora emesso)** nel tab dei dati. Con la spunta: il validatore `cigRequired` non scatta, le due date di fornitura diventano obbligatorie (errore sul campo + pallino rosso sul tab, come gli altri campi obbligatori), il campo «chiuso» è disabilitato. Su un contratto salvato non in bozza la checkbox è disabilitata. Togliere la spunta riattiva il validatore del CIG.
  - Elenco: filtro `draft` («Bozza», sì/no, in «Filtri avanzati»), colonna stato col badge, segnalazione **Bozze scadute** in `CONTRACT_SIGNALS` sulla chiave `contracts_draft_overdue`.
  - `utility-edit-dialog.component.ts:341,346,602`: i contratti «aperti» escludono le bozze (una bozza gratuita non rende facoltativo il capitolo, una bozza non è il contratto corrente).
  - Schede convenzione e impegno, colonna Stato dei contratti: `Bozza` prima di `Chiuso`/`Aperto`.

- [ ] **Step 4: eseguire** — spec PASS; `docker exec utenzepa-frontend-1 sh -c "pnpm exec ng build --configuration production"` senza errori (i template non li vede `tsc`); `pnpm run lint` senza errori nuovi.

- [ ] **Step 5: commit** — `feat(contracts): bozza in scheda, elenco e segnalazioni`.

---

### Task 5: guida, versione, prova nel browser, PR

**Files:**
- Modify: `frontend/public/guida/guida.md`, `publiccode.yml`, `docs/roadmap-patrimonio.md`

- [ ] **Step 1: guida** — data in testa; in «Contratti di fornitura» (Regole e riferimenti) un paragrafo sulla bozza: a cosa serve (utenze note il cui ordine non è ancora emesso), cosa non fa (non copre l'utenza, non riceve fatture), come diventa ordine (togliere la spunta e inserire il CIG), che le date previste sono obbligatorie; in «Segnalazioni per elenco», riga Contratti di fornitura: «Bozze scadute (ordine da emettere o da eliminare)». Nessun titolo rinominato. `docker exec utenzepa-frontend-1 sh -c "node scripts/check-guida.mjs"` → nessun errore.

- [ ] **Step 2: versione e roadmap** — `publiccode.yml`: `softwareVersion: 1.55.0`, `releaseDate` di oggi. Roadmap, voce 24: «ordine in bozza fatto in v1.55.0; fabbisogno da fare (v1.56.0)».

- [ ] **Step 3: prova nel browser** (Playwright dall'host, utente temporaneo, `docs/claude/testing-e2e.md`; prima `docker restart utenzepa-frontend-1` e attendere «bundle generation complete»): creare una bozza senza CIG con «Collega le utenze di un contratto» → salvataggio riuscito, badge Bozza in scheda ed elenco; togliere la spunta senza CIG → errore di CIG obbligatorio; inserire il CIG → salvato come contratto normale; riaprirlo → checkbox Bozza disabilitata. Poi eliminare i dati di prova, l'utente temporaneo e le sue righe di accesso in `audit_logs`.

- [ ] **Step 4: commit e PR** — `docs: guida e versione per l'ordine in bozza (v1.55.0)`; `git commit` in background (hook husky lenti). PR verso `main` con: cosa cambia, elenco delle query toccate e di quelle lasciate invariate di proposito, esito delle prove dei Task 2 e 5. Nota di rilascio: nessun dato da sistemare prima dell'aggiornamento.
