# Campi doppi e ambigui — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unire le note dell'utenza, rendere il deposito cauzionale "non noto", rinominare `utility_code` in UI, unificare il numero d'ordine, svuotare gli indirizzi di fornitura duplicati, allineare la doppia `@JoinTable` di `invoice_budget_chapter`. Release v1.9.1.

**Architecture:** Dati sistemati one-shot sul DB locale (SQL nello scratchpad, mai nel repo) prima delle migration; migration solo schema con controllo preliminare leggibile. Frontend: rimozione campi e nuove etichette.

**Tech Stack:** NestJS 11 + TypeORM/MySQL 8, Angular 22 + Material, jest.

**Spec:** `docs/superpowers/specs/2026-10-03-campi-doppi-design.md`

## Global Constraints

- Niente dati personali in doc/test/commit. SQL dati solo nello scratchpad, una lista alla volta con conferma dell'utente.
- Bozze migration in `backend/.scratch/`, spostate in `src/database/migrations/` a contenuto finale.
- jest `--maxWorkers=2` nel container, comandi Docker uno alla volta. Mai `git add .`/`-A`: elencare i file (il repo ha file `.txt` non tracciati in `frontend/src/app/pages/map/`).
- Errori 400 con messaggio italiano, mai 409.
- Etichette: "Codice cliente fornitore" (`utility_code`), "Numero ordine (ODA)" (`consip_order`), "Indirizzo Fornitura" invariato.
- `publiccode.yml`: `softwareVersion: "v1.9.1"`.

## Review Focus

1. Utenza salvata dalla scheda con deposito vuoto: deve arrivare `null`, non `0` né stringa vuota (DTO `IsNumber` + `IsOptional`), e restare vuota alla riapertura → Task 2 E2E.
2. Contratto "corrente" proiettato sull'utenza (`withCurrentContractFields` copia `order_number`): dopo il drop nessun campo `undefined` in elenco/export utenze → Task 3.
3. Produzione con colonne ancora valorizzate: le migration si fermano con messaggio prima di ogni DDL → test Task 1/3.
4. Filtri utenze/contratti che usavano `order_number`, `additional_notes`, `specifications`: tolti dai DTO search (altrimenti 400 `forbidNonWhitelisted` da query param salvati) → Task 1/3.
5. Fatture: rimossa una delle due `@JoinTable`, le fatture caricano ancora i capitoli dove servono → Task 4.

---

### Task 1: Note dell'utenza unite

**Files:** `backend/src/apis/utility/{entity/utility.entity.ts,dto/create-utility.dto.ts,dto/update-utility.dto.ts,dto/search-utility.dto.ts}`; frontend `pages/utilities/{entity/utility.entity.ts,entity/utility.interface.ts,utility-edit-dialog.component.ts,.html,data-table-utilities.component.ts,.html,utility-filter-dialog.component.ts,.html,search-utilities.component.ts}`; create `backend/src/database/migrations/1792600000000-MergeUtilityNotes.ts`, test `backend/src/database/merge-utility-notes.migration.spec.ts`.

- [ ] **Step 1: Dato one-shot (DB locale, conferma utente)**: `UPDATE utilities SET notes = CONCAT_WS('\n', NULLIF(TRIM(notes),''), IF(NULLIF(TRIM(additional_notes),'') IS NULL, NULL, CONCAT('Note aggiuntive: ', TRIM(additional_notes))), IF(NULLIF(TRIM(specifications),'') IS NULL, NULL, CONCAT('Specifiche: ', TRIM(specifications)))), additional_notes = NULL, specifications = NULL, update_date = update_date WHERE NULLIF(TRIM(additional_notes),'') IS NOT NULL OR NULLIF(TRIM(specifications),'') IS NOT NULL;` — attese ~170 righe; verificare 2 esempi.
- [ ] **Step 2: Test migration (fallisce: modulo mancante)**

```ts
import { MergeUtilityNotes1792600000000 } from './migrations/1792600000000-MergeUtilityNotes';

const runner = (left: number) => {
  const ddl: string[] = [];
  const query = jest.fn(async (sql: string) => {
    if (sql.startsWith('SELECT')) return [{ left }];
    ddl.push(sql);
    return [];
  });
  return { q: { query } as never, ddl };
};

describe('MergeUtilityNotes', () => {
  it('con colonne vuote fa drop di entrambe', async () => {
    const { q, ddl } = runner(0);
    await new MergeUtilityNotes1792600000000().up(q);
    expect(ddl.join(' ')).toContain('DROP COLUMN `additional_notes`');
    expect(ddl.join(' ')).toContain('DROP COLUMN `specifications`');
  });
  it('con valori ancora presenti si ferma prima di ogni DDL', async () => {
    const { q, ddl } = runner(3);
    await expect(new MergeUtilityNotes1792600000000().up(q)).rejects.toThrow('3 utenze');
    expect(ddl).toHaveLength(0);
  });
});
```

Run: `docker exec utenzepa-api-1 pnpm exec jest src/database/merge-utility-notes.migration.spec.ts --maxWorkers=2` → FAIL.
- [ ] **Step 3: Migration**

```ts
import { MigrationInterface, QueryRunner } from 'typeorm';

// Note dell'utenza unite in `notes` (roadmap voce 18 parte 2): il contenuto di
// additional_notes e specifications va spostato prima (intervento sui dati).
export class MergeUtilityNotes1792600000000 implements MigrationInterface {
  name = 'MergeUtilityNotes1792600000000';

  public async up(q: QueryRunner): Promise<void> {
    const [{ left }]: { left: number | string }[] = await q.query(
      "SELECT COUNT(*) AS `left` FROM `utilities` WHERE NULLIF(TRIM(`additional_notes`), '') IS NOT NULL OR NULLIF(TRIM(`specifications`), '') IS NOT NULL",
    );
    if (Number(left) > 0) {
      throw new Error(
        `utilities: ${Number(left)} utenze con note aggiuntive o specifiche. Spostarle in notes prima di rilanciare la migration.`,
      );
    }
    await q.query('ALTER TABLE `utilities` DROP COLUMN `additional_notes`');
    await q.query('ALTER TABLE `utilities` DROP COLUMN `specifications`');
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE `utilities` ADD `specifications` text NULL');
    await q.query('ALTER TABLE `utilities` ADD `additional_notes` text NULL');
  }
}
```

Prima di spostarla: verificare con `SHOW COLUMNS FROM utilities LIKE 'additional_notes'` / `'specifications'` il tipo reale e usarlo nel `down()`.
- [ ] **Step 4: Codice**: togliere `additional_notes` e `specifications` da entity, DTO (anche search), scheda, colonne/elenco/export, filtri, search component. `grep -rn "additional_notes\|specifications" backend/src frontend/src/app --include=*.ts --include=*.html | grep -v migrations` → vuoto.
- [ ] **Step 5: Verifica**: test migration PASS; `jest src/apis/utility`; `type-check`; log `ng serve` "generation complete"; migration applicata (`SHOW COLUMNS`).
- [ ] **Step 6: Commit** `feat: note dell'utenza unite in un solo campo`.

### Task 2: Deposito cauzionale "non noto" e etichette

**Files:** `backend/src/apis/utility/entity/utility.entity.ts`, DTO create/update, `utility.service.spec.ts` se usa `security_deposit: 0`; frontend scheda/elenco/filtri utenze; `pages/assets/asset-edit-dialog.component.ts`, `pages/plants/plant-edit-dialog.component.ts`, `pages/utilities/utility.service.ts` (etichette `utility_code`); create `1792700000000-SecurityDepositNullable.ts`.

- [ ] **Step 1: Entity**: `@Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })` `security_deposit: number | null;` (commento: null = non noto). DTO: `@IsOptional()` + `@IsNumber()` + `@Min(0)`, accettare `null` (`@ValidateIf((_, v) => v !== null)`).
- [ ] **Step 2: Migration**

```ts
import { MigrationInterface, QueryRunner } from 'typeorm';

// Deposito cauzionale: null = non noto (prima 0 di default, indistinguibile da
// "nessun deposito"). Gli 0 esistenti diventano null.
export class SecurityDepositNullable1792700000000 implements MigrationInterface {
  name = 'SecurityDepositNullable1792700000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE `utilities` MODIFY `security_deposit` decimal(10,2) NULL DEFAULT NULL');
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query('UPDATE `utilities` SET `security_deposit` = 0 WHERE `security_deposit` IS NULL');
    await q.query('ALTER TABLE `utilities` MODIFY `security_deposit` decimal(10,2) NOT NULL DEFAULT 0');
  }
}
```

Dopo l'esecuzione, dato one-shot (DB locale, conferma utente): `UPDATE utilities SET security_deposit = NULL, update_date = update_date WHERE security_deposit = 0;` (attese 554).
- [ ] **Step 3: Frontend**: campo deposito vuoto = `null` nel form (`[this.data.item.security_deposit ?? null]`, input type number); elenco/export: vuoto se null. Etichetta `utility_code` → "Codice cliente fornitore" in scheda utenza, elenco, filtri, export e nelle tabelle utenze di immobile/impianto.
- [ ] **Step 4: Verifica**: `jest src/apis/utility`, `type-check`, compile; E2E: utenza con deposito vuoto → Salva → riapri vuoto; DB `NULL`.
- [ ] **Step 5: Commit** `feat: deposito cauzionale non noto e codice cliente fornitore`.

### Task 3: Numero ordine unico

**Files:** `backend/src/apis/contracts/{entity/contract.entity.ts,dto/create-contract.dto.ts,dto/update-contract.dto.ts,contracts.service.spec.ts}`, `backend/src/apis/utility/{utility.service.ts,utility.service.spec.ts,dto/search-utility.dto.ts}`; frontend `pages/contracts/*` (scheda, elenco, filtri, search, entity, interface), `pages/third-parties/third-party-edit-dialog.component.ts`, `pages/utilities/{data-table-utilities.component.ts,.html,entity/utility.entity.ts,search-utilities.component.ts,utility-filter-dialog.component.ts,.html}`; create `1792800000000-DropContractOrderNumber.ts` + spec `backend/src/database/drop-contract-order-number.migration.spec.ts`.

- [ ] **Step 1: Dato one-shot (conferma utente)**: `UPDATE contracts SET consip_order = order_number, update_date = update_date WHERE NULLIF(TRIM(order_number),'') IS NOT NULL AND NULLIF(TRIM(consip_order),'') IS NULL; UPDATE contracts SET order_number = NULL, update_date = update_date WHERE NULLIF(TRIM(order_number),'') IS NOT NULL AND consip_order = order_number;` (atteso: contratto 640). Se restano righe con entrambi diversi: fermarsi e chiedere.
- [ ] **Step 2: Test migration** (stessa struttura del Task 1: `runner(left)`, con 0 → `DROP COLUMN \`order_number\``, con 2 → rejects `'2 contratti'`, nessuna DDL). Run → FAIL.
- [ ] **Step 3: Migration**

```ts
import { MigrationInterface, QueryRunner } from 'typeorm';

// Numero ordine unico (roadmap voce 18 parte 2): order_number duplicava
// consip_order. Il valore va spostato prima (intervento sui dati).
export class DropContractOrderNumber1792800000000 implements MigrationInterface {
  name = 'DropContractOrderNumber1792800000000';

  public async up(q: QueryRunner): Promise<void> {
    const [{ left }]: { left: number | string }[] = await q.query(
      "SELECT COUNT(*) AS `left` FROM `contracts` WHERE NULLIF(TRIM(`order_number`), '') IS NOT NULL",
    );
    if (Number(left) > 0) {
      throw new Error(
        `contracts: ${Number(left)} contratti con order_number. Spostarlo in consip_order prima di rilanciare la migration.`,
      );
    }
    await q.query('ALTER TABLE `contracts` DROP COLUMN `order_number`');
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE `contracts` ADD `order_number` varchar(100) NULL');
  }
}
```

Verificare il tipo reale con `SHOW COLUMNS FROM contracts LIKE 'order_number'` per il `down()`.
- [ ] **Step 4: Codice**: togliere `order_number` ovunque (entity, DTO, `withCurrentContractFields` in `utility.service.ts`, search DTO utenze, spec, frontend contratti/utenze/soggetti terzi); etichetta di `consip_order` → "Numero ordine (ODA)" in scheda, elenco, filtri, export. `grep -rn "\border_number\b" backend/src frontend/src/app --include=*.ts --include=*.html | grep -v migrations` → vuoto.
- [ ] **Step 5: Verifica**: test migration PASS, `jest src/apis/contracts src/apis/utility`, `type-check`, compile, migration applicata.
- [ ] **Step 6: Commit** `feat: numero ordine unico sul contratto di fornitura`.

### Task 4: Indirizzi di fornitura duplicati e `@JoinTable` delle fatture

**Files:** `backend/src/apis/invoices/entity/invoice.entity.ts` (e i suoi usi di `budget_chapters`/`budgetChapters`).

- [ ] **Step 1: Dato one-shot (conferma utente, lista prima di aggiornare)**: elencare le utenze con `supplier_address` valorizzato collegate a un immobile o impianto il cui indirizzo coincide (normalizzato: `LOWER`, togliere prefissi `via `, `viale `, `piazza `, `v.le `, spazi doppi; confronto con `assets.address`/`plants.address`); mostrare conteggio + 10 esempi all'utente; dopo conferma `UPDATE utilities SET supplier_address = NULL, update_date = update_date WHERE id IN (...)`.
- [ ] **Step 2: `@JoinTable` doppia**: `grep -rn "budget_chapters\|budgetChapters" backend/src frontend/src/app --include=*.ts --include=*.html`; tenere una sola relazione (quella usata dal service/frontend), rimuovere l'altra; poi `schema:log` (CLI, vedi CLAUDE.md) non deve più proporre DROP/ADD delle FK di `invoice_budget_chapter`. Se le propone ancora, ledger e lasciare.
- [ ] **Step 3: Verifica**: `jest src/apis/invoices`, `type-check`; E2E fattura con capitoli si apre.
- [ ] **Step 4: Commit** `fix: una sola relazione fattura-capitoli`.

### Task 5: Verifica finale, documentazione, versione

- [ ] **Step 1**: ciclo `migration:revert` ×3 → `migration:run` (vedi piano v1.9.0); rifare `security_deposit = NULL` dopo il run (il down rimette 0).
- [ ] **Step 2**: jest moduli toccati, lint (scartare rumore), `pnpm run build` frontend, E2E Playwright (utente temporaneo da cancellare): scheda utenza (note unite visibili, deposito vuoto, "Codice cliente fornitore"), scheda contratto ("Numero ordine (ODA)", niente "Numero ordine" doppio), Salva utenza e contratto senza 400, elenchi ed export.
- [ ] **Step 3**: `CLAUDE.md`: gotcha "migration che si fermano su dati puliti solo in locale: importare il DB locale in produzione *prima* di aggiornare le immagini (successo in v1.9.0 con `InvoiceBudgetChapterFk`)"; nota note unite / deposito null / numero ordine unico. Roadmap voce 18: parte 2 fatta, esito dati. `publiccode.yml` v1.9.1.
- [ ] **Step 4: Commit** `docs: CLAUDE.md, roadmap e versione v1.9.1`.
