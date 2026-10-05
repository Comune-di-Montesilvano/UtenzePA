# Fatture per utenza e impegni di spesa — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fatture con righe per utenza, impegni di spesa (contratto + capitolo + esercizio), spesa calcolata per utenza/immobile/capitolo, tre anomalie nuove, e caricamento una tantum delle fatture ACA 2025–2026 sul DB locale.

**Architecture:** `invoices` resta la testata (aggiunge fornitore e totale documento), nuova tabella `invoice_lines` sostituita in blocco a ogni salvataggio, nuova `budget_commitments` con modulo CRUD annidato sotto il contratto. La spesa si calcola con query aggregate in un modulo `spending` di sola lettura. Frontend: tab nuovi nelle schede esistenti (contratto, utenza, immobile) e fattura convertita in scheda `entity-sheet` con tab Righe.

**Tech Stack:** NestJS 11 + TypeORM 1.x su MySQL 8, Jest; Angular 22 standalone + Angular Material 22, class-transformer.

**Spec:** `docs/superpowers/specs/2026-10-05-fatture-per-utenza-impegni-design.md`

## Global Constraints

- Branch: `feat/fatture-per-utenza-impegni` (già creato, contiene la spec). Release prevista v1.10.0.
- Comandi backend sempre nel container: `MSYS_NO_PATHCONV=1 docker exec utenzepa-api-1 sh -c "pnpm exec jest <path> --maxWorkers=2"`; type-check `pnpm run type-check`. Mai la suite intera in locale (instabilità Docker/WSL2): la CI fa da gate.
- Frontend: verifica di compilazione con `docker logs --since 60s utenzepa-frontend-1 2>&1 | grep -E "✘|generation"`; nessun Karma.
- Comandi Docker uno alla volta, mai in parallelo/background multipli.
- Migration: scrivere il file fuori da `src/database/migrations/` (es. `/tmp` o scratchpad) e spostarlo nel path definitivo solo a contenuto finale (il watcher la esegue appena compare). Spec delle migration fuori da `migrations/` (in `src/database/`).
- Date: convenzione unica `AAAA-MM-GG`. Backend `@DateOnly()` (`@/common/decorators/date-only.decorator`), filtri con `DateHelper.dateOnly`. Frontend `@DateOnly()` (`core/helpers/date.helper.ts`) sulle entity o `toIsoDate` (`pages/utilities/consumptions/consumption.model.ts`) nei payload; in lettura dei form `new Date(y, m - 1, d)`.
- Conflitti/duplicati: sempre `BadRequestException` (400) con messaggio in italiano, mai 409.
- Service frontend che non estendono `AbstractService`: header `Authorization: Bearer` a mano.
- Righe passate a `app-linked-table`: campi cache, mai getter.
- Schede: `openSheet()`/`sheetDialogConfig()`, tab con `aria-label` = etichetta, "Scollega"/"Elimina" con conferma.
- Nessun dato personale (nomi, CF, P.IVA reali) in codice, test, commit o doc: solo id o nomi fittizi.
- `git add` sempre con file espliciti, mai `-A`/`.`. Commit Conventional Commits, chiusi da `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Dati: solo sul DB locale, script fuori dal repo in `.audit-w/`; la produzione si allinea con export/import del DB locale.
- Importi: righe `amount` IVA inclusa; testata `total_amount` IVA inclusa, `net_amount_excl_vat` imponibile facoltativo.

## Review Focus

1. **Fattura ACA salvata dalla UI senza protocollo né imponibile**: oggi `protocol_number` e `net_amount_excl_vat` sono `@IsNotEmpty` nei DTO e obbligatori nel form; le 490 fatture ACA non li hanno. Atteso: il Salva funziona. → test DTO in Task 3, form senza `Validators.required` in Task 8.
2. **PATCH della testata senza `lines`** (es. solo note): atteso righe invariate, non cancellate. → test in Task 3.
3. **Riga con impegno di un altro contratto o impegno cancellato**: atteso 400 leggibile con il numero di riga, nessuna scrittura parziale. → test in Task 3.
4. **Dashboard "costi del mese" con fatture senza imponibile**: oggi somma `net_amount_excl_vat` (null per ACA → 0) e usa `getMonth()` 0-based contro `MONTH()` 1-based. Atteso: somma `COALESCE(total_amount, net_amount_excl_vat)` del mese corrente vero. → test in Task 3.
5. **Eliminare un impegno usato da righe**: atteso 400 "Impegno usato da N righe fattura", nessun soft delete. → test in Task 2.

---

## File Structure

Backend (`backend/src/`):
- `apis/budget-commitments/entity/budget-commitment.entity.ts` — entity impegno.
- `apis/budget-commitments/dto/{create,update}-budget-commitment.dto.ts`.
- `apis/budget-commitments/budget-commitments.{service,controller,module}.ts` + `.service.spec.ts`.
- `apis/invoices/entity/invoice-line.entity.ts` — entity riga.
- `apis/invoices/dto/invoice-line.dto.ts` — DTO riga (annidato).
- `apis/invoices/entity/invoice.entity.ts`, `dto/*.ts`, `invoice.service.ts`, `invoice.service.spec.ts`, `invoie.module.ts` — modifiche.
- `apis/invoices/entity/invoice_budget_chapter.entity.ts` — eliminato.
- `apis/budget-chapters/entity/budgetChapter.entity.ts` — tolta relazione `invoices`.
- `apis/spending/spending.{service,controller,module}.ts` + `.service.spec.ts` — spesa calcolata.
- `apis/anomalies/anomalies.service.ts` + spec — tre anomalie.
- `database/migrations/1792900000000-FatturePerUtenzaImpegni.ts` + `database/fatture-per-utenza-impegni.migration.spec.ts`.
- `app.module.ts` — registra `BudgetCommitmentsModule`, `SpendingModule`.

Frontend (`frontend/src/app/`):
- `pages/contracts/commitments/commitment.model.ts`, `commitment.service.ts`, `commitment-edit-dialog.component.ts`, `contract-commitments-tab.component.ts`.
- `pages/invoices/entity/invoice.entity.ts`, `invoice-line.model.ts` — modello.
- `pages/invoices/invoice-edit-dialog.component.{ts,html}` — scheda con tab Righe.
- `pages/invoices/invoice-lines-tab.component.ts` — tabella righe modificabile.
- `pages/invoices/data-table-invoices.component.{ts,html}`, `invoice-filter-dialog.component.*` — colonne/filtri.
- `pages/spending/spending.service.ts` + `spending.model.ts`.
- `pages/utilities/utility-invoices-tab.component.ts` — tab Fatture dell'utenza.
- `pages/utilities/utility-edit-dialog.component.{ts,html}` — tab + capitoli impegnati.
- `pages/assets/asset-edit-dialog.component.{ts,html}` — riquadro spesa.
- `pages/contracts/contract-edit-dialog.component.{ts,html}` — tab Impegni e capitoli.
- `core/services/entity-navigator.service.ts` — `openInvoice()`.
- `pages/dashboard/anomalies-card.component.ts` — tre pannelli.

Dati (fuori repo): `.audit-w/aca_fatture_carico.py` → genera `.audit-w/aca_fatture_carico.sql`.

---

### Task 1: Schema — entity, migration, rimozione `invoice_budget_chapter`

**Files:**
- Create: `backend/src/apis/budget-commitments/entity/budget-commitment.entity.ts`
- Create: `backend/src/apis/invoices/entity/invoice-line.entity.ts`
- Modify: `backend/src/apis/invoices/entity/invoice.entity.ts`
- Modify: `backend/src/apis/budget-chapters/entity/budgetChapter.entity.ts:68-69`
- Delete: `backend/src/apis/invoices/entity/invoice_budget_chapter.entity.ts`
- Create: `backend/src/database/migrations/1792900000000-FatturePerUtenzaImpegni.ts`
- Test: `backend/src/database/fatture-per-utenza-impegni.migration.spec.ts`

**Interfaces:**
- Produces: `BudgetCommitment` (`id, contract_id_fk, budget_chapter_id_fk, fiscal_year, commitment_number, amount, notes, contract, budgetChapter`, audit), `InvoiceLine` (`id, invoice_id_fk, amount, utility_id_fk, commitment_id_fk, period_start, period_end, consumption, supply_code, description, invoice, utility, commitment`), `Invoice.supplier_id_fk`, `Invoice.supplier`, `Invoice.total_amount`, `Invoice.lines`.

- [ ] **Step 1: Write the failing migration spec**

```ts
// backend/src/database/fatture-per-utenza-impegni.migration.spec.ts
import { FatturePerUtenzaImpegni1792900000000 } from './migrations/1792900000000-FatturePerUtenzaImpegni';

// QueryRunner simulato: risponde alla SELECT di controllo, registra le DDL.
const runner = (ibcRows: number) => {
  const ddl: string[] = [];
  const query = jest.fn(async (sql: string) => {
    if (sql.includes('AS n FROM `invoice_budget_chapter`')) return [{ n: ibcRows }];
    ddl.push(sql);
    return [];
  });
  return { q: { query } as never, ddl };
};

describe('FatturePerUtenzaImpegni', () => {
  const m = new FatturePerUtenzaImpegni1792900000000();

  it('crea impegni e righe, aggiunge fornitore e totale, toglie invoice_budget_chapter', async () => {
    const { q, ddl } = runner(0);
    await m.up(q);
    const all = ddl.join('\n');
    expect(all).toContain('CREATE TABLE `budget_commitments`');
    expect(all).toContain('CREATE TABLE `invoice_lines`');
    expect(all).toContain('ADD `supplier_id_fk` int NULL');
    expect(all).toContain('ADD `total_amount` decimal(18,2) NULL');
    expect(all).toContain('MODIFY `net_amount_excl_vat` decimal(18,2) NULL');
    expect(all).toContain('DROP TABLE `invoice_budget_chapter`');
    expect(all).toContain('ON DELETE CASCADE');
  });

  it('si ferma prima di ogni DDL se invoice_budget_chapter ha righe', async () => {
    const { q, ddl } = runner(4);
    await expect(m.up(q)).rejects.toThrow('invoice_budget_chapter: 4 righe');
    expect(ddl).toHaveLength(0);
  });

  it('down ricrea invoice_budget_chapter e rimette l’imponibile NOT NULL', async () => {
    const { q, ddl } = runner(0);
    await m.down(q);
    const all = ddl.join('\n');
    expect(all).toContain('CREATE TABLE `invoice_budget_chapter`');
    expect(all).toContain('UPDATE `invoices` SET `net_amount_excl_vat` = 0 WHERE `net_amount_excl_vat` IS NULL');
    expect(all).toContain("MODIFY `net_amount_excl_vat` decimal(18,2) NOT NULL DEFAULT '0.00'");
    expect(all).toContain('DROP TABLE `invoice_lines`');
    expect(all).toContain('DROP TABLE `budget_commitments`');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `MSYS_NO_PATHCONV=1 docker exec utenzepa-api-1 sh -c "pnpm exec jest src/database/fatture-per-utenza-impegni.migration.spec.ts --maxWorkers=2"`
Expected: FAIL, "Cannot find module './migrations/1792900000000-FatturePerUtenzaImpegni'".

- [ ] **Step 3: Write the migration in a scratch path, then move it**

Scrivere il file in `/tmp/1792900000000-FatturePerUtenzaImpegni.ts` (o nello scratchpad), poi `mv` in `backend/src/database/migrations/` solo quando il contenuto è questo:

```ts
import { MigrationInterface, QueryRunner } from 'typeorm';

// Fatture per utenza e impegni di spesa (roadmap voci 6 e 17). Solo schema:
// invoice_budget_chapter (mai usata) si toglie, il capitolo arriva
// dall'impegno della riga. Controllo prima di ogni DDL (commit implicito).
export class FatturePerUtenzaImpegni1792900000000 implements MigrationInterface {
  name = 'FatturePerUtenzaImpegni1792900000000';

  public async up(q: QueryRunner): Promise<void> {
    const [{ n }]: { n: number | string }[] = await q.query(
      'SELECT COUNT(*) AS n FROM `invoice_budget_chapter`',
    );
    if (Number(n) > 0) {
      throw new Error(
        `invoice_budget_chapter: ${Number(n)} righe. Ricollegarle come righe fattura con impegno (o cancellarle) prima di rilanciare la migration.`,
      );
    }
    await q.query(
      'CREATE TABLE `budget_commitments` (' +
        '`id` int NOT NULL AUTO_INCREMENT, ' +
        '`contract_id_fk` int NOT NULL, ' +
        '`budget_chapter_id_fk` int NOT NULL, ' +
        '`fiscal_year` int NOT NULL, ' +
        '`commitment_number` varchar(50) NULL, ' +
        '`amount` decimal(14,2) NULL, ' +
        '`notes` text NULL, ' +
        '`create_date` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), ' +
        '`update_date` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), ' +
        '`created_by_user_id` int NOT NULL, ' +
        '`updated_by_user_id` int NOT NULL, ' +
        '`deleted` tinyint NOT NULL DEFAULT 0, ' +
        'INDEX `IDX_budget_commitments_contract` (`contract_id_fk`, `deleted`), ' +
        'PRIMARY KEY (`id`), ' +
        'CONSTRAINT `FK_budget_commitments_contract` FOREIGN KEY (`contract_id_fk`) REFERENCES `contracts`(`id`), ' +
        'CONSTRAINT `FK_budget_commitments_chapter` FOREIGN KEY (`budget_chapter_id_fk`) REFERENCES `budget_chapters`(`id`), ' +
        'CONSTRAINT `FK_budget_commitments_created_by` FOREIGN KEY (`created_by_user_id`) REFERENCES `system_users`(`id`), ' +
        'CONSTRAINT `FK_budget_commitments_updated_by` FOREIGN KEY (`updated_by_user_id`) REFERENCES `system_users`(`id`)' +
        ') ENGINE=InnoDB',
    );
    await q.query(
      'CREATE TABLE `invoice_lines` (' +
        '`id` int NOT NULL AUTO_INCREMENT, ' +
        '`invoice_id_fk` int NOT NULL, ' +
        '`amount` decimal(14,2) NOT NULL, ' +
        '`utility_id_fk` int NULL, ' +
        '`commitment_id_fk` int NULL, ' +
        '`period_start` date NULL, ' +
        '`period_end` date NULL, ' +
        '`consumption` decimal(14,3) NULL, ' +
        '`supply_code` varchar(50) NULL, ' +
        '`description` varchar(255) NULL, ' +
        'INDEX `IDX_invoice_lines_utility` (`utility_id_fk`), ' +
        'PRIMARY KEY (`id`), ' +
        'CONSTRAINT `FK_invoice_lines_invoice` FOREIGN KEY (`invoice_id_fk`) REFERENCES `invoices`(`id`) ON DELETE CASCADE, ' +
        'CONSTRAINT `FK_invoice_lines_utility` FOREIGN KEY (`utility_id_fk`) REFERENCES `utilities`(`id`), ' +
        'CONSTRAINT `FK_invoice_lines_commitment` FOREIGN KEY (`commitment_id_fk`) REFERENCES `budget_commitments`(`id`)' +
        ') ENGINE=InnoDB',
    );
    await q.query('ALTER TABLE `invoices` ADD `supplier_id_fk` int NULL');
    await q.query(
      'ALTER TABLE `invoices` ADD CONSTRAINT `FK_invoices_supplier` FOREIGN KEY (`supplier_id_fk`) REFERENCES `third_parties`(`id`)',
    );
    await q.query('ALTER TABLE `invoices` ADD `total_amount` decimal(18,2) NULL');
    await q.query('ALTER TABLE `invoices` MODIFY `net_amount_excl_vat` decimal(18,2) NULL');
    await q.query('DROP TABLE `invoice_budget_chapter`');
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(
      'CREATE TABLE `invoice_budget_chapter` (' +
        '`invoice_id` int NOT NULL, `budget_chapter_id` int NOT NULL, ' +
        'INDEX `FK_9cffdf1bcf101d43271ac87c53d` (`budget_chapter_id`), ' +
        'PRIMARY KEY (`invoice_id`, `budget_chapter_id`), ' +
        'CONSTRAINT `FK_891310b3d845fe3f7d00346e65b` FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON DELETE CASCADE, ' +
        'CONSTRAINT `FK_9cffdf1bcf101d43271ac87c53d` FOREIGN KEY (`budget_chapter_id`) REFERENCES `budget_chapters`(`id`) ON DELETE CASCADE' +
        ') ENGINE=InnoDB',
    );
    await q.query('UPDATE `invoices` SET `net_amount_excl_vat` = 0 WHERE `net_amount_excl_vat` IS NULL');
    await q.query(
      "ALTER TABLE `invoices` MODIFY `net_amount_excl_vat` decimal(18,2) NOT NULL DEFAULT '0.00'",
    );
    await q.query('ALTER TABLE `invoices` DROP COLUMN `total_amount`');
    await q.query('ALTER TABLE `invoices` DROP FOREIGN KEY `FK_invoices_supplier`');
    await q.query('ALTER TABLE `invoices` DROP COLUMN `supplier_id_fk`');
    await q.query('DROP TABLE `invoice_lines`');
    await q.query('DROP TABLE `budget_commitments`');
  }
}
```

- [ ] **Step 4: Run the spec to verify it passes**

Run: `MSYS_NO_PATHCONV=1 docker exec utenzepa-api-1 sh -c "pnpm exec jest src/database/fatture-per-utenza-impegni.migration.spec.ts --maxWorkers=2"`
Expected: PASS (3 test). Il watcher avrà già applicato la migration: `docker logs --since 120s utenzepa-api-1 2>&1 | grep -iE "FatturePer|error"` non deve mostrare errori.

- [ ] **Step 5: Entities**

`backend/src/apis/budget-commitments/entity/budget-commitment.entity.ts`:

```ts
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Contract } from '@apis/contracts/entity/contract.entity';
import { BudgetChapter } from '@apis/budget-chapters/entity/budgetChapter.entity';
import { SystemUser } from '@apis/system-users/entity/system-user.entity';

// Impegno di spesa: capitolo impegnato su un contratto di fornitura per un
// esercizio. Numero e importo arrivano dalla ragioneria, facoltativi.
@Entity('budget_commitments')
@Index('IDX_budget_commitments_contract', ['contract_id_fk', 'deleted'])
export class BudgetCommitment {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'int' })
  contract_id_fk: number;

  @Column({ type: 'int' })
  budget_chapter_id_fk: number;

  @Column({ type: 'int' })
  fiscal_year: number;

  @Column({ length: 50, nullable: true })
  commitment_number: string | null;

  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true })
  amount: number | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn({ type: 'timestamp' })
  create_date: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  update_date: Date;

  @Column({ name: 'created_by_user_id' })
  created_by_user_id: number;

  @Column({ name: 'updated_by_user_id' })
  updated_by_user_id: number;

  @Column({ type: 'boolean', default: false })
  deleted: boolean;

  @ManyToOne(() => Contract, { nullable: false })
  @JoinColumn({ name: 'contract_id_fk', foreignKeyConstraintName: 'FK_budget_commitments_contract' })
  contract: Contract;

  @ManyToOne(() => BudgetChapter, { nullable: false })
  @JoinColumn({ name: 'budget_chapter_id_fk', foreignKeyConstraintName: 'FK_budget_commitments_chapter' })
  budgetChapter: BudgetChapter;

  @ManyToOne(() => SystemUser)
  @JoinColumn({ name: 'created_by_user_id', foreignKeyConstraintName: 'FK_budget_commitments_created_by' })
  created_by: SystemUser;

  @ManyToOne(() => SystemUser)
  @JoinColumn({ name: 'updated_by_user_id', foreignKeyConstraintName: 'FK_budget_commitments_updated_by' })
  updated_by: SystemUser;
}
```

`backend/src/apis/invoices/entity/invoice-line.entity.ts`:

```ts
import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Invoice } from './invoice.entity';
import { Utility } from '@apis/utility/entity/utility.entity';
import { BudgetCommitment } from '@apis/budget-commitments/entity/budget-commitment.entity';

// Riga di fattura: tutto facoltativo tranne l'importo (IVA inclusa), perché
// ogni fornitore struttura le fatture a modo suo. Si sostituiscono in blocco
// a ogni salvataggio della fattura: niente audit né soft delete.
@Entity('invoice_lines')
@Index('IDX_invoice_lines_utility', ['utility_id_fk'])
export class InvoiceLine {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'int' })
  invoice_id_fk: number;

  @Column({ type: 'decimal', precision: 14, scale: 2 })
  amount: number;

  @Column({ type: 'int', nullable: true })
  utility_id_fk: number | null;

  @Column({ type: 'int', nullable: true })
  commitment_id_fk: number | null;

  @Column({ type: 'date', nullable: true })
  period_start: string | null;

  @Column({ type: 'date', nullable: true })
  period_end: string | null;

  @Column({ type: 'decimal', precision: 14, scale: 3, nullable: true })
  consumption: number | null;

  @Column({ length: 50, nullable: true })
  supply_code: string | null;

  @Column({ length: 255, nullable: true })
  description: string | null;

  @ManyToOne(() => Invoice, (i) => i.lines, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'invoice_id_fk', foreignKeyConstraintName: 'FK_invoice_lines_invoice' })
  invoice: Invoice;

  @ManyToOne(() => Utility)
  @JoinColumn({ name: 'utility_id_fk', foreignKeyConstraintName: 'FK_invoice_lines_utility' })
  utility: Utility | null;

  @ManyToOne(() => BudgetCommitment)
  @JoinColumn({ name: 'commitment_id_fk', foreignKeyConstraintName: 'FK_invoice_lines_commitment' })
  commitment: BudgetCommitment | null;
}
```

In `invoice.entity.ts`: rimuovere import di `ManyToMany`, `JoinTable`, `BudgetChapter`, `InvoiceBudgetChapter`; rimuovere le proprietà `budget_chapters` e `invoiceBudgetChapters`; cambiare `net_amount_excl_vat` e aggiungere i campi nuovi:

```ts
  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  net_amount_excl_vat: number | null;

  // Totale documento IVA inclusa (es. fatture ACA, dove l'imponibile non c'è).
  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  total_amount: number | null;

  // Fornitore della fattura: per l'import si abbina per P.IVA anche senza
  // contratto; se manca, il service lo prende dal contratto.
  @Column({ type: 'int', nullable: true })
  supplier_id_fk: number | null;

  @ManyToOne(() => ThirdParty)
  @JoinColumn({ name: 'supplier_id_fk', foreignKeyConstraintName: 'FK_invoices_supplier' })
  supplier: ThirdParty | null;

  @OneToMany(() => InvoiceLine, (l) => l.invoice)
  lines: InvoiceLine[];
```

con `import { ThirdParty } from '@apis/third-parties/entity/third-party.entity';` e `import { InvoiceLine } from './invoice-line.entity';`.

In `budgetChapter.entity.ts` rimuovere righe 68-69 (`@ManyToMany(() => Invoice …) invoices`) e gli import `ManyToMany`/`Invoice` se non più usati. Cancellare `invoice_budget_chapter.entity.ts` con `git rm`.

- [ ] **Step 6: Verify schema drift is empty for these tables**

Run: `MSYS_NO_PATHCONV=1 docker exec utenzepa-api-1 sh -c "node -r ts-node/register -r tsconfig-paths/register node_modules/typeorm/cli.js schema:log -d src/database/data-source.ts 2>&1 | grep -iE 'budget_commitments|invoice_lines|invoices' | head -20"`
Expected: nessuno statement su `budget_commitments`, `invoice_lines`, `invoices.supplier_id_fk/total_amount/net_amount_excl_vat` (drift preesistente su altre tabelle ignorato). Se compaiono indici/FK con nomi diversi, allineare `foreignKeyConstraintName`/nomi indice nell'entity, non la migration.

- [ ] **Step 7: Commit**

```bash
git add backend/src/database/migrations/1792900000000-FatturePerUtenzaImpegni.ts backend/src/database/fatture-per-utenza-impegni.migration.spec.ts backend/src/apis/budget-commitments/entity/budget-commitment.entity.ts backend/src/apis/invoices/entity/invoice-line.entity.ts backend/src/apis/invoices/entity/invoice.entity.ts backend/src/apis/budget-chapters/entity/budgetChapter.entity.ts
git rm -q backend/src/apis/invoices/entity/invoice_budget_chapter.entity.ts
git commit -m "feat: schema per impegni di spesa e righe fattura"
```

(Il service fatture non compila ancora finché non c'è il Task 3: lanciare `type-check` solo dopo il Task 3. Se l'hook di pre-commit esegue tsc e fallisce, fare i Task 1 e 3 in un unico commit.)

---

### Task 2: Modulo impegni di spesa

**Files:**
- Create: `backend/src/apis/budget-commitments/dto/create-budget-commitment.dto.ts`
- Create: `backend/src/apis/budget-commitments/dto/update-budget-commitment.dto.ts`
- Create: `backend/src/apis/budget-commitments/budget-commitments.service.ts`
- Create: `backend/src/apis/budget-commitments/budget-commitments.controller.ts`
- Create: `backend/src/apis/budget-commitments/budget-commitments.module.ts`
- Modify: `backend/src/app.module.ts` (import + `imports: [...]`)
- Test: `backend/src/apis/budget-commitments/budget-commitments.service.spec.ts`

**Interfaces:**
- Consumes: `BudgetCommitment` (Task 1), `InvoiceLine` (Task 1), `BaseService` (`@apis/shared/base.service`).
- Produces: `GET/POST /contracts/:contractId/commitments`, `PATCH/DELETE /commitments/:id`; `BudgetCommitmentsService.findByContract(contractId): Promise<BudgetCommitment[]>` (con `budgetChapter`), `createForContract(contractId, dto, userId)`, `update(id, dto, userId)`, `remove(id, userId)`.

- [ ] **Step 1: Write the failing tests**

```ts
// backend/src/apis/budget-commitments/budget-commitments.service.spec.ts
import { BadRequestException } from '@nestjs/common';
import { BudgetCommitmentsService } from './budget-commitments.service';

describe('BudgetCommitmentsService', () => {
  let service: BudgetCommitmentsService;
  let repo: { find: jest.Mock; findOne: jest.Mock; create: jest.Mock; save: jest.Mock };
  let contractRepo: { findOne: jest.Mock };
  let chapterRepo: { findOne: jest.Mock };
  let lineRepo: { count: jest.Mock };

  beforeEach(() => {
    repo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      create: jest.fn((d) => d),
      save: jest.fn(async (d) => ({ id: 50, ...d })),
    };
    contractRepo = { findOne: jest.fn().mockResolvedValue({ id: 1, deleted: false }) };
    chapterRepo = { findOne: jest.fn().mockResolvedValue({ id: 7, deleted: false }) };
    lineRepo = { count: jest.fn().mockResolvedValue(0) };
    service = new BudgetCommitmentsService(
      repo as never,
      contractRepo as never,
      chapterRepo as never,
      lineRepo as never,
    );
  });

  it('elenca gli impegni del contratto dall’esercizio più recente, importo numerico', async () => {
    repo.find.mockResolvedValue([
      { id: 1, fiscal_year: 2025, amount: '100.00', budgetChapter: { chapter_code: '11428', article: 0 } },
      { id: 2, fiscal_year: 2026, amount: null, budgetChapter: { chapter_code: '11428', article: 0 } },
    ]);
    const rows = await service.findByContract(1);
    expect(rows.map((r) => r.fiscal_year)).toEqual([2026, 2025]);
    expect(rows[1].amount).toBe(100);
    expect(rows[0].amount).toBeNull();
  });

  it('crea un impegno sul contratto', async () => {
    await service.createForContract(1, { budget_chapter_id_fk: 7, fiscal_year: 2026 }, 3);
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ contract_id_fk: 1, budget_chapter_id_fk: 7, fiscal_year: 2026, created_by_user_id: 3 }),
    );
  });

  it('rifiuta un doppione contratto + capitolo + esercizio', async () => {
    repo.find.mockResolvedValue([{ id: 9, budget_chapter_id_fk: 7, fiscal_year: 2026 }]);
    await expect(
      service.createForContract(1, { budget_chapter_id_fk: 7, fiscal_year: 2026 }, 3),
    ).rejects.toThrow('Impegno già presente per questo capitolo ed esercizio');
  });

  it('rifiuta contratto o capitolo inesistenti', async () => {
    contractRepo.findOne.mockResolvedValue(null);
    await expect(
      service.createForContract(1, { budget_chapter_id_fk: 7, fiscal_year: 2026 }, 3),
    ).rejects.toThrow(BadRequestException);
    contractRepo.findOne.mockResolvedValue({ id: 1 });
    chapterRepo.findOne.mockResolvedValue(null);
    await expect(
      service.createForContract(1, { budget_chapter_id_fk: 7, fiscal_year: 2026 }, 3),
    ).rejects.toThrow('Capitolo non trovato');
  });

  it('modifica: il doppione si controlla escludendo se stesso', async () => {
    repo.findOne.mockResolvedValue({ id: 9, contract_id_fk: 1, budget_chapter_id_fk: 7, fiscal_year: 2025, deleted: false });
    repo.find.mockResolvedValue([{ id: 9, budget_chapter_id_fk: 7, fiscal_year: 2025 }]);
    await expect(service.update(9, { notes: 'x' }, 3)).resolves.toBeDefined();
    repo.find.mockResolvedValue([
      { id: 9, budget_chapter_id_fk: 7, fiscal_year: 2025 },
      { id: 10, budget_chapter_id_fk: 7, fiscal_year: 2026 },
    ]);
    await expect(service.update(9, { fiscal_year: 2026 }, 3)).rejects.toThrow('Impegno già presente');
  });

  it('non elimina un impegno usato da righe fattura', async () => {
    repo.findOne.mockResolvedValue({ id: 9, deleted: false });
    lineRepo.count.mockResolvedValue(3);
    await expect(service.remove(9, 3)).rejects.toThrow('Impegno usato da 3 righe fattura');
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('elimina (soft) un impegno non usato', async () => {
    repo.findOne.mockResolvedValue({ id: 9, deleted: false });
    await service.remove(9, 3);
    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ id: 9, deleted: true, updated_by_user_id: 3 }));
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `MSYS_NO_PATHCONV=1 docker exec utenzepa-api-1 sh -c "pnpm exec jest src/apis/budget-commitments --maxWorkers=2"`
Expected: FAIL, modulo `./budget-commitments.service` non trovato.

- [ ] **Step 3: DTOs**

```ts
// dto/create-budget-commitment.dto.ts
import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, ValidateIf } from 'class-validator';

export class CreateBudgetCommitmentDto {
  @Type(() => Number)
  @IsInt({ message: 'Capitolo obbligatorio.' })
  budget_chapter_id_fk: number;

  @Type(() => Number)
  @IsInt({ message: 'Esercizio non valido.' })
  @Min(2000)
  @Max(2100)
  fiscal_year: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  commitment_number?: string | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount?: number | null;

  @IsOptional()
  @IsString()
  notes?: string | null;
}
```

```ts
// dto/update-budget-commitment.dto.ts
import { PartialType } from '@nestjs/mapped-types';
import { CreateBudgetCommitmentDto } from './create-budget-commitment.dto';

export class UpdateBudgetCommitmentDto extends PartialType(CreateBudgetCommitmentDto) {}
```

(Se `@nestjs/mapped-types` non è tra le dipendenze — verificare con `grep mapped-types backend/package.json` — usare `@nestjs/swagger` `PartialType`, già usato altrove: `grep -rn "PartialType" backend/src | head -3`.)

- [ ] **Step 4: Service**

```ts
// budget-commitments.service.ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BaseService } from '@apis/shared/base.service';
import { Contract } from '@apis/contracts/entity/contract.entity';
import { BudgetChapter } from '@apis/budget-chapters/entity/budgetChapter.entity';
import { InvoiceLine } from '@apis/invoices/entity/invoice-line.entity';
import { BudgetCommitment } from './entity/budget-commitment.entity';
import { CreateBudgetCommitmentDto } from './dto/create-budget-commitment.dto';
import { UpdateBudgetCommitmentDto } from './dto/update-budget-commitment.dto';

const toNumber = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

@Injectable()
export class BudgetCommitmentsService extends BaseService<
  BudgetCommitment,
  CreateBudgetCommitmentDto,
  UpdateBudgetCommitmentDto
> {
  protected readonly entityName = 'budget_commitments';
  protected readonly relations = ['budgetChapter', 'created_by', 'updated_by'];

  constructor(
    @InjectRepository(BudgetCommitment)
    protected readonly repo: Repository<BudgetCommitment>,
    @InjectRepository(Contract)
    private readonly contractRepo: Repository<Contract>,
    @InjectRepository(BudgetChapter)
    private readonly chapterRepo: Repository<BudgetChapter>,
    @InjectRepository(InvoiceLine)
    private readonly lineRepo: Repository<InvoiceLine>,
  ) {
    super();
  }

  async findByContract(contractId: number): Promise<BudgetCommitment[]> {
    const rows = await this.repo.find({
      where: { contract_id_fk: contractId, deleted: false },
      relations: { budgetChapter: true },
    });
    return rows
      .map((r) => ({ ...r, amount: toNumber(r.amount) }))
      .sort((a, b) => b.fiscal_year - a.fiscal_year || a.budget_chapter_id_fk - b.budget_chapter_id_fk);
  }

  async createForContract(
    contractId: number,
    dto: CreateBudgetCommitmentDto,
    userId: number,
  ): Promise<BudgetCommitment> {
    const contract = await this.contractRepo.findOne({ where: { id: contractId, deleted: false } });
    if (!contract) throw new BadRequestException('Contratto non trovato');
    await this.ensureChapter(dto.budget_chapter_id_fk);
    await this.ensureFree(contractId, dto.budget_chapter_id_fk, dto.fiscal_year);
    return super.create({ ...dto, contract_id_fk: contractId } as never, userId);
  }

  async update(id: number, dto: UpdateBudgetCommitmentDto, userId?: number): Promise<BudgetCommitment> {
    const current = await this.repo.findOne({ where: { id, deleted: false } });
    if (!current) throw new BadRequestException('Impegno non trovato');
    const chapterId = dto.budget_chapter_id_fk ?? current.budget_chapter_id_fk;
    const year = dto.fiscal_year ?? current.fiscal_year;
    if (dto.budget_chapter_id_fk !== undefined) await this.ensureChapter(chapterId);
    await this.ensureFree(current.contract_id_fk, chapterId, year, id);
    return super.update(id, dto, userId);
  }

  async remove(id: number, userId: number): Promise<void> {
    const current = await this.repo.findOne({ where: { id, deleted: false } });
    if (!current) throw new BadRequestException('Impegno non trovato');
    const used = await this.lineRepo.count({ where: { commitment_id_fk: id } });
    if (used > 0) throw new BadRequestException(`Impegno usato da ${used} righe fattura`);
    current.deleted = true;
    current.updated_by_user_id = userId;
    await this.repo.save(current);
  }

  private async ensureChapter(chapterId: number): Promise<void> {
    const chapter = await this.chapterRepo.findOne({ where: { id: chapterId, deleted: false } });
    if (!chapter) throw new BadRequestException('Capitolo non trovato');
  }

  // Unico per contratto + capitolo + esercizio tra le righe non cancellate
  // (nel service, non UNIQUE: le cancellate restano nel DB).
  private async ensureFree(contractId: number, chapterId: number, year: number, exceptId?: number): Promise<void> {
    const rows = await this.repo.find({ where: { contract_id_fk: contractId, deleted: false } });
    if (rows.some((r) => r.budget_chapter_id_fk === chapterId && r.fiscal_year === year && r.id !== exceptId)) {
      throw new BadRequestException('Impegno già presente per questo capitolo ed esercizio');
    }
  }
}
```

Nota: `remove` non chiama `super.remove` (che rifarebbe `findOne` con relazioni); l'audit DELETE si registra con `await this.recordAudit(AuditAction.DELETE, id, userId, [])` dopo il save — aggiungere l'import `AuditAction` da `@apis/audit-log/entity/audit-log.entity`.

- [ ] **Step 5: Controller e module**

```ts
// budget-commitments.controller.ts
import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@/core/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/core/auth/guards/roles.guard';
import { Roles } from '@/core/auth/decorators/roles.decorator';
import { CurrentUser, ICurrentUser } from '@/core/auth/decorators/current-user.decorator';
import { BudgetCommitmentsService } from './budget-commitments.service';
import { BudgetCommitment } from './entity/budget-commitment.entity';
import { CreateBudgetCommitmentDto } from './dto/create-budget-commitment.dto';
import { UpdateBudgetCommitmentDto } from './dto/update-budget-commitment.dto';

// Annidati sotto contracts/:contractId (lista/creazione), diretti su
// commitments/:id (modifica/eliminazione), come la spesa storica dei capitoli.
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class BudgetCommitmentsController {
  constructor(private readonly service: BudgetCommitmentsService) {}

  @Get('contracts/:contractId/commitments')
  list(@Param('contractId', ParseIntPipe) contractId: number): Promise<BudgetCommitment[]> {
    return this.service.findByContract(contractId);
  }

  @Roles('Admin', 'Operatore')
  @Post('contracts/:contractId/commitments')
  create(
    @Param('contractId', ParseIntPipe) contractId: number,
    @Body() dto: CreateBudgetCommitmentDto,
    @CurrentUser() user: ICurrentUser,
  ): Promise<BudgetCommitment> {
    return this.service.createForContract(contractId, dto, user.id);
  }

  @Roles('Admin', 'Operatore')
  @Patch('commitments/:id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateBudgetCommitmentDto,
    @CurrentUser() user: ICurrentUser,
  ): Promise<BudgetCommitment> {
    return this.service.update(id, dto, user.id);
  }

  @Roles('Admin', 'Operatore')
  @Delete('commitments/:id')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: ICurrentUser): Promise<void> {
    return this.service.remove(id, user.id);
  }
}
```

```ts
// budget-commitments.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Contract } from '@apis/contracts/entity/contract.entity';
import { BudgetChapter } from '@apis/budget-chapters/entity/budgetChapter.entity';
import { InvoiceLine } from '@apis/invoices/entity/invoice-line.entity';
import { BudgetCommitment } from './entity/budget-commitment.entity';
import { BudgetCommitmentsService } from './budget-commitments.service';
import { BudgetCommitmentsController } from './budget-commitments.controller';

@Module({
  imports: [TypeOrmModule.forFeature([BudgetCommitment, Contract, BudgetChapter, InvoiceLine])],
  providers: [BudgetCommitmentsService],
  controllers: [BudgetCommitmentsController],
})
export class BudgetCommitmentsModule {}
```

In `app.module.ts`: `import { BudgetCommitmentsModule } from '@apis/budget-commitments/budget-commitments.module';` accanto a `BudgetChapterSpendingModule` e aggiungerlo nell'array `imports`.

- [ ] **Step 6: Run tests**

Run: `MSYS_NO_PATHCONV=1 docker exec utenzepa-api-1 sh -c "pnpm exec jest src/apis/budget-commitments --maxWorkers=2"`
Expected: PASS (7 test).

- [ ] **Step 7: Commit**

```bash
git add backend/src/apis/budget-commitments backend/src/app.module.ts
git commit -m "feat: impegni di spesa per contratto (CRUD)"
```

---

### Task 3: Fatture con righe

**Files:**
- Create: `backend/src/apis/invoices/dto/invoice-line.dto.ts`
- Modify: `backend/src/apis/invoices/dto/create-invoice.dto.ts`, `update-invoice.dto.ts`, `search-invoice.dto.ts`
- Modify: `backend/src/apis/invoices/invoice.service.ts`, `invoice.controller.ts` (maschera fornitore), `invoie.module.ts`
- Test: `backend/src/apis/invoices/invoice.service.spec.ts` (riscrivere i test su `budget_chapters`), `backend/src/apis/invoices/dto/invoice.dto.spec.ts`

**Interfaces:**
- Consumes: `InvoiceLine`, `BudgetCommitment`, `Invoice.supplier_id_fk/total_amount/lines` (Task 1).
- Produces: `POST/PATCH /invoices` con `lines?: InvoiceLineDto[]`; `GET /invoices/:id` con `lines` (relazioni `utility`, `utility.utilityType`, `commitment`, `commitment.budgetChapter`) e `supplier`; `GET /invoices?utility_id=&supplier_id_fk=&budget_chapter_ids=`; ogni fattura dell'elenco ha `lines` con `commitment.budgetChapter` (per colonne Capitoli/Utenze).

- [ ] **Step 1: Write the failing DTO test (Review Focus 1)**

```ts
// backend/src/apis/invoices/dto/invoice.dto.spec.ts
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateInvoiceDto } from './create-invoice.dto';
import { UpdateInvoiceDto } from './update-invoice.dto';

const errors = (cls: new () => object, body: object) =>
  validateSync(plainToInstance(cls, body) as object, { whitelist: true, forbidNonWhitelisted: true });

describe('DTO fattura', () => {
  const aca = { invoice_id: 'F-1', invoice_date: '2025-03-15', total_amount: 120.5, lines: [{ amount: 120.5, utility_id_fk: 3 }] };

  it('fattura senza protocollo, imponibile e contratto è valida (caso ACA)', () => {
    expect(errors(CreateInvoiceDto, aca)).toEqual([]);
    expect(errors(UpdateInvoiceDto, aca)).toEqual([]);
  });

  it('riga senza importo non è valida', () => {
    expect(errors(CreateInvoiceDto, { ...aca, lines: [{ utility_id_fk: 3 }] })).not.toEqual([]);
  });

  it('periodo della riga con date AAAA-MM-GG', () => {
    const dto = plainToInstance(CreateInvoiceDto, {
      ...aca,
      lines: [{ amount: 1, period_start: '2025-01-01T23:00:00.000Z', period_end: '2025-02-28' }],
    });
    expect(dto.lines[0].period_start).toBe('2025-01-01');
    expect(validateSync(dto)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `MSYS_NO_PATHCONV=1 docker exec utenzepa-api-1 sh -c "pnpm exec jest src/apis/invoices/dto --maxWorkers=2"`
Expected: FAIL (protocollo/imponibile/contratto obbligatori, `lines` e `total_amount` non ammessi).

- [ ] **Step 3: DTOs**

```ts
// dto/invoice-line.dto.ts
import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';
import { DateOnly } from '@/common/decorators/date-only.decorator';

export class InvoiceLineDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: "L'importo della riga è obbligatorio." })
  amount: number;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsInt()
  utility_id_fk?: number | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsInt()
  commitment_id_fk?: number | null;

  @IsOptional()
  @DateOnly()
  period_start?: string | null;

  @IsOptional()
  @DateOnly()
  period_end?: string | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  consumption?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  supply_code?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string | null;
}
```

In `create-invoice.dto.ts`:
- `protocol_number`: sostituire `@IsNotEmpty(...)` con `@IsOptional()` (tenere `@IsString() @MaxLength(100)`), tipo `string | null`.
- `net_amount_excl_vat`: `@IsOptional() @ValidateIf((_o, v) => v !== null) @IsNumber(...) @Min(0)`, tipo `number | null`.
- `contratto_id_fk`: `@IsOptional() @ValidateIf((_o, v) => v !== null) @IsInt()`, tipo `number | null`.
- `invoice_id`: diventa obbligatorio (colonna NOT NULL): `@IsNotEmpty({ message: 'Il numero della fattura è obbligatorio.' }) @IsString() @MaxLength(255)`.
- rimuovere `budget_chapters`; aggiungere:

```ts
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Il totale documento deve essere un numero valido.' })
  total_amount?: number | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsInt()
  supplier_id_fk?: number | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InvoiceLineDto)
  lines?: InvoiceLineDto[];
```

(import `ValidateNested`, `ValidateIf` da `class-validator`, `Type` da `class-transformer`, `InvoiceLineDto` da `./invoice-line.dto`).

In `update-invoice.dto.ts` stesse modifiche (protocollo e imponibile `@IsOptional()` al posto di `@IsNotEmpty`, `contratto_id_fk` nullable, rimuovere `budget_chapters`, aggiungere `total_amount`, `supplier_id_fk`, `lines`).

In `search-invoice.dto.ts`: rimuovere `budget_chapter_id`; aggiungere

```ts
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  utility_id?: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  supplier_id_fk?: number;
```

- [ ] **Step 4: Run DTO test**

Run: `MSYS_NO_PATHCONV=1 docker exec utenzepa-api-1 sh -c "pnpm exec jest src/apis/invoices/dto --maxWorkers=2"`
Expected: PASS.

- [ ] **Step 5: Write the failing service tests**

Sostituire in `invoice.service.spec.ts` il `beforeEach` e i blocchi `create`/`update` (i test su `InvoiceBudgetChapter` spariscono). Nuovo setup e test:

```ts
import { BadRequestException } from '@nestjs/common';
import { InvoicesService } from './invoice.service';
import { Invoice } from './entity/invoice.entity';
import { InvoiceLine } from './entity/invoice-line.entity';
import { BudgetCommitment } from '@apis/budget-commitments/entity/budget-commitment.entity';

describe('InvoicesService', () => {
  let service: InvoicesService;
  let repo: { createQueryBuilder: jest.Mock; findOne: jest.Mock };
  let contractRepo: { findOne: jest.Mock };
  let dataSource: { transaction: jest.Mock };
  let manager: { create: jest.Mock; save: jest.Mock; findOne: jest.Mock; delete: jest.Mock; find: jest.Mock; count: jest.Mock };

  beforeEach(() => {
    manager = {
      create: jest.fn((_e, data) => data),
      save: jest.fn(async (_e, data) => (Array.isArray(data) ? data : { id: 10, ...data })),
      findOne: jest.fn().mockResolvedValue({ id: 10 }),
      delete: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    };
    repo = { createQueryBuilder: jest.fn(), findOne: jest.fn() };
    contractRepo = { findOne: jest.fn().mockResolvedValue({ id: 1, supplier_id_fk: 44 }) };
    dataSource = { transaction: jest.fn((cb) => cb(manager)) };
    service = new InvoicesService(repo as never, contractRepo as never, dataSource as never);
  });

  describe('create', () => {
    it('salva testata e righe in transazione, fornitore preso dal contratto', async () => {
      manager.find.mockResolvedValue([{ id: 5, contract_id_fk: 1 }]);
      await service.create(
        { invoice_id: 'F-1', invoice_date: '2025-03-15', contratto_id_fk: 1, lines: [{ amount: 10, commitment_id_fk: 5 }, { amount: 2 }] } as never,
        3,
      );
      expect(manager.save).toHaveBeenCalledWith(Invoice, expect.objectContaining({ supplier_id_fk: 44 }));
      expect(manager.save).toHaveBeenCalledWith(
        InvoiceLine,
        [expect.objectContaining({ invoice_id_fk: 10, amount: 10, commitment_id_fk: 5 }), expect.objectContaining({ amount: 2 })],
      );
    });

    it('rifiuta un impegno di un altro contratto, indicando la riga', async () => {
      manager.find.mockResolvedValue([{ id: 5, contract_id_fk: 2 }]);
      await expect(
        service.create({ invoice_id: 'F-1', invoice_date: '2025-03-15', contratto_id_fk: 1, lines: [{ amount: 1 }, { amount: 10, commitment_id_fk: 5 }] } as never, 3),
      ).rejects.toThrow("L'impegno della riga 2 non è del contratto della fattura");
      expect(manager.save).not.toHaveBeenCalledWith(InvoiceLine, expect.anything());
    });

    it('rifiuta un impegno inesistente o cancellato', async () => {
      manager.find.mockResolvedValue([]);
      await expect(
        service.create({ invoice_id: 'F-1', invoice_date: '2025-03-15', lines: [{ amount: 10, commitment_id_fk: 99 }] } as never, 3),
      ).rejects.toThrow("L'impegno della riga 1 non esiste");
    });

    it('rifiuta un periodo con fine prima dell’inizio', async () => {
      await expect(
        service.create({ invoice_id: 'F-1', invoice_date: '2025-03-15', lines: [{ amount: 1, period_start: '2025-03-01', period_end: '2025-02-01' }] } as never, 3),
      ).rejects.toThrow('Riga 1: la fine del periodo è prima dell’inizio');
    });
  });

  describe('update', () => {
    beforeEach(() => {
      repo.findOne.mockResolvedValue({ id: 20, invoice_id: 'OLD', contratto_id_fk: 1, deleted: false });
    });

    it('senza lines non tocca le righe (Review Focus 2)', async () => {
      await service.update(20, { notes_on_invoices: 'nota' } as never, 7);
      expect(manager.delete).not.toHaveBeenCalled();
    });

    it('con lines sostituisce le righe in blocco', async () => {
      await service.update(20, { lines: [{ amount: 5 }] } as never, 7);
      expect(manager.delete).toHaveBeenCalledWith(InvoiceLine, { invoice_id_fk: 20 });
      expect(manager.save).toHaveBeenCalledWith(InvoiceLine, [expect.objectContaining({ invoice_id_fk: 20, amount: 5 })]);
    });

    it('lines vuoto cancella tutte le righe', async () => {
      await service.update(20, { lines: [] } as never, 7);
      expect(manager.delete).toHaveBeenCalledWith(InvoiceLine, { invoice_id_fk: 20 });
      expect(manager.save).not.toHaveBeenCalledWith(InvoiceLine, expect.anything());
    });

    it('registra in audit il numero di righe prima/dopo', async () => {
      manager.count.mockResolvedValue(3);
      const auditLogService = { record: jest.fn() };
      (service as any).auditLogService = auditLogService;
      await service.update(20, { lines: [{ amount: 5 }] } as never, 7);
      expect(auditLogService.record).toHaveBeenCalledWith(
        expect.objectContaining({ fields: expect.arrayContaining([expect.objectContaining({ fieldName: 'lines', oldValue: 3, newValue: 1 })]) }),
      );
    });
  });

  describe('getMonthlyCosts (Review Focus 4)', () => {
    it('somma il totale documento (o l’imponibile) del mese corrente, mese 1-based', async () => {
      const qb = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ total: '1234.56' }),
      };
      repo.createQueryBuilder.mockReturnValue(qb);
      expect(await service.getMonthlyCosts()).toBe(1234.56);
      expect(qb.select).toHaveBeenCalledWith('SUM(COALESCE(Invoice.total_amount, Invoice.net_amount_excl_vat))', 'total');
      expect(qb.andWhere).toHaveBeenCalledWith('MONTH(Invoice.invoice_date) = :month', { month: new Date().getMonth() + 1 });
    });
  });
});
```

- [ ] **Step 6: Run to verify failure**

Run: `MSYS_NO_PATHCONV=1 docker exec utenzepa-api-1 sh -c "pnpm exec jest src/apis/invoices/invoice.service.spec.ts --maxWorkers=2"`
Expected: FAIL (costruttore e logica righe assenti).

- [ ] **Step 7: Service implementation**

Riscrivere `invoice.service.ts`:

```ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { Invoice } from './entity/invoice.entity';
import { InvoiceLine } from './entity/invoice-line.entity';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { SearchInvoiceDto } from './dto/search-invoice.dto';
import { InvoiceLineDto } from './dto/invoice-line.dto';
import { BaseService, toFindOptionsRelations } from '@apis/shared/base.service';
import { AuditAction } from '@apis/audit-log/entity/audit-log.entity';
import { Contract } from '@apis/contracts/entity/contract.entity';
import { BudgetCommitment } from '@apis/budget-commitments/entity/budget-commitment.entity';

@Injectable()
export class InvoicesService extends BaseService<Invoice, CreateInvoiceDto, UpdateInvoiceDto> {
  protected readonly entityName = 'Invoice';
  protected readonly relations = [
    'contratto',
    'contratto.supplier',
    'supplier',
    'lines',
    'lines.utility',
    'lines.utility.utilityType',
    'lines.commitment',
    'lines.commitment.budgetChapter',
    'created_by',
    'updated_by',
  ];

  constructor(
    @InjectRepository(Invoice)
    protected readonly repo: Repository<Invoice>,
    @InjectRepository(Contract)
    private readonly contractRepo: Repository<Contract>,
    private readonly dataSource: DataSource,
  ) {
    super();
  }

  async findAll(filters?: Partial<SearchInvoiceDto>): Promise<Invoice[]> {
    const qb = this.repo.createQueryBuilder('Invoice');
    qb.leftJoinAndSelect('Invoice.contratto', 'contratto', 'contratto.deleted = 0');
    qb.leftJoinAndSelect('contratto.supplier', 'supplier', 'supplier.deleted = 0');
    qb.leftJoinAndSelect('Invoice.supplier', 'invoiceSupplier');
    qb.leftJoinAndSelect('Invoice.lines', 'lines');
    qb.leftJoinAndSelect('lines.commitment', 'commitment');
    qb.leftJoinAndSelect('commitment.budgetChapter', 'commitmentChapter');

    if (filters?.deleted !== undefined && filters.deleted !== null) {
      const deletedValue = filters.deleted.toString();
      qb.where('Invoice.deleted = :deleted_filter', {
        deleted_filter: deletedValue === 'true' || deletedValue === '1' ? 1 : 0,
      });
    } else {
      qb.where('Invoice.deleted = :deleted_default', { deleted_default: 0 });
    }

    if (filters) {
      // Filtri sulle righe con EXISTS: un join filtrato toglierebbe dalla
      // risposta le altre righe della stessa fattura.
      if (filters.utility_id) {
        qb.andWhere(
          'EXISTS (SELECT 1 FROM invoice_lines fl WHERE fl.invoice_id_fk = Invoice.id AND fl.utility_id_fk = :utilityId)',
          { utilityId: filters.utility_id },
        );
      }
      if (filters.budget_chapter_ids && filters.budget_chapter_ids.length > 0) {
        qb.andWhere(
          'EXISTS (SELECT 1 FROM invoice_lines fl JOIN budget_commitments fc ON fc.id = fl.commitment_id_fk WHERE fl.invoice_id_fk = Invoice.id AND fc.budget_chapter_id_fk IN (:...chapterIds))',
          { chapterIds: filters.budget_chapter_ids },
        );
      }
      if (filters.supplier_id_fk) {
        qb.andWhere('Invoice.supplier_id_fk = :supplierId', { supplierId: filters.supplier_id_fk });
      }
      if (filters.invoice_date_from) {
        qb.andWhere('Invoice.invoice_date >= :invoice_date_from', { invoice_date_from: filters.invoice_date_from });
      }
      if (filters.invoice_date_to) {
        qb.andWhere('Invoice.invoice_date <= :invoice_date_to', { invoice_date_to: filters.invoice_date_to });
      }
      this.applyFilters(qb, filters, 'Invoice', [
        'deleted',
        'utility_id',
        'supplier_id_fk',
        'budget_chapter_ids',
        'invoice_date_from',
        'invoice_date_to',
        'orderBy',
        'orderDirection',
      ]);
    }

    const orderByField = filters?.orderBy || 'id';
    const orderDirection = filters?.orderDirection || 'ASC';
    qb.orderBy(`Invoice.${orderByField}`, orderDirection.toUpperCase() as 'ASC' | 'DESC');
    return qb.getMany();
  }

  async create(dto: CreateInvoiceDto, userId?: number): Promise<Invoice> {
    const { lines, ...rest } = dto;
    const header = await this.withSupplier(rest);
    const saved = await this.dataSource.transaction(async (manager) => {
      if (lines?.length) await this.checkLines(manager, lines, header.contratto_id_fk ?? null);
      const entity = manager.create(Invoice, {
        ...header,
        ...(userId !== undefined && { created_by_user_id: userId, updated_by_user_id: userId }),
      });
      const savedEntity = await manager.save(Invoice, entity);
      if (lines?.length) await manager.save(InvoiceLine, this.toRows(savedEntity.id, lines));
      return manager.findOne(Invoice, {
        where: { id: savedEntity.id },
        relations: toFindOptionsRelations<Invoice>(this.relations),
      });
    });
    await this.recordAudit(AuditAction.CREATE, saved.id, userId ?? saved.updated_by_user_id, []);
    return saved;
  }

  async update(id: number, updateDto: UpdateInvoiceDto, userId?: number): Promise<Invoice> {
    const { lines, ...rest } = updateDto;
    const before = await this.repo.findOne({ where: { id } as never });
    if (!before) throw new BadRequestException('Fattura non trovata');
    const beforeSnapshot: Record<string, unknown> = { ...before };
    const header = await this.withSupplier({ ...rest, contratto_id_fk: rest.contratto_id_fk ?? before.contratto_id_fk });
    let linesBefore = 0;

    const result = await this.dataSource.transaction(async (manager) => {
      if (lines !== undefined) {
        await this.checkLines(manager, lines, header.contratto_id_fk ?? null);
        linesBefore = await manager.count(InvoiceLine, { where: { invoice_id_fk: id } });
      }
      const entity = await manager.findOne(Invoice, { where: { id } });
      Object.assign(entity, header);
      if (userId !== undefined) entity.updated_by_user_id = userId;
      await manager.save(Invoice, entity);
      if (lines !== undefined) {
        await manager.delete(InvoiceLine, { invoice_id_fk: id });
        if (lines.length) await manager.save(InvoiceLine, this.toRows(id, lines));
      }
      return manager.findOne(Invoice, {
        where: { id },
        relations: toFindOptionsRelations<Invoice>(this.relations),
      });
    });

    try {
      const changes = await this.diffFields(
        beforeSnapshot,
        result as unknown as Record<string, unknown>,
        rest as Record<string, unknown>,
      );
      if (lines !== undefined) {
        changes.push({ fieldName: 'lines', oldValue: linesBefore, newValue: lines.length });
      }
      await this.recordAudit(AuditAction.UPDATE, id, userId ?? result.updated_by_user_id, changes);
    } catch (error) {
      console.error(`[InvoicesService] Errore durante il calcolo/registrazione audit`, error);
    }
    return result;
  }

  // Costi del mese corrente per la dashboard: totale documento se c'è,
  // altrimenti imponibile (fatture inserite prima del totale documento).
  async getMonthlyCosts(): Promise<number> {
    const now = new Date();
    const row = await this.repo
      .createQueryBuilder('Invoice')
      .select('SUM(COALESCE(Invoice.total_amount, Invoice.net_amount_excl_vat))', 'total')
      .where('Invoice.deleted = :deleted', { deleted: false })
      .andWhere('MONTH(Invoice.invoice_date) = :month', { month: now.getMonth() + 1 })
      .andWhere('YEAR(Invoice.invoice_date) = :year', { year: now.getFullYear() })
      .getRawOne<{ total: string }>();
    return Number(row?.total ?? 0);
  }

  // Fornitore assente: dal contratto, se c'è.
  private async withSupplier<T extends { supplier_id_fk?: number | null; contratto_id_fk?: number | null }>(header: T): Promise<T> {
    if (header.supplier_id_fk || !header.contratto_id_fk) return header;
    const contract = await this.contractRepo.findOne({ where: { id: header.contratto_id_fk } });
    return contract?.supplier_id_fk ? { ...header, supplier_id_fk: contract.supplier_id_fk } : header;
  }

  private async checkLines(manager: EntityManager, lines: InvoiceLineDto[], contractId: number | null): Promise<void> {
    lines.forEach((l, i) => {
      if (l.period_start && l.period_end && l.period_end < l.period_start) {
        throw new BadRequestException(`Riga ${i + 1}: la fine del periodo è prima dell’inizio`);
      }
    });
    const ids = [...new Set(lines.map((l) => l.commitment_id_fk).filter((v): v is number => !!v))];
    if (!ids.length) return;
    const found = await manager.find(BudgetCommitment, { where: { id: In(ids), deleted: false } });
    lines.forEach((l, i) => {
      if (!l.commitment_id_fk) return;
      const c = found.find((f) => f.id === l.commitment_id_fk);
      if (!c) throw new BadRequestException(`L'impegno della riga ${i + 1} non esiste`);
      if (contractId && c.contract_id_fk !== contractId) {
        throw new BadRequestException(`L'impegno della riga ${i + 1} non è del contratto della fattura`);
      }
    });
  }

  private toRows(invoiceId: number, lines: InvoiceLineDto[]): Partial<InvoiceLine>[] {
    return lines.map((l) => ({
      invoice_id_fk: invoiceId,
      amount: l.amount,
      utility_id_fk: l.utility_id_fk ?? null,
      commitment_id_fk: l.commitment_id_fk ?? null,
      period_start: l.period_start ?? null,
      period_end: l.period_end ?? null,
      consumption: l.consumption ?? null,
      supply_code: l.supply_code?.trim() || null,
      description: l.description?.trim() || null,
    }));
  }
}
```

`invoie.module.ts`: `TypeOrmModule.forFeature([Invoice, InvoiceLine, BudgetCommitment, Contract])` (rimuovere `BudgetChapter`, `InvoiceBudgetChapter`).

`invoice.controller.ts`: la maschera del fornitore copre anche `supplier` della testata:

```ts
const maskInvoice = (i: Invoice, role?: string): Invoice => {
  if (!i) return i;
  const masked = i.contratto ? { ...i, contratto: maskSupplierOf(i.contratto, role) } : { ...i };
  return i.supplier ? { ...masked, supplier: maskSupplierOf({ supplier: i.supplier }, role).supplier } : masked;
};
```

(verificare la firma di `maskSupplierOf` in `@apis/third-parties/third-party.privacy`: se accetta un oggetto con `supplier`, l'uso sopra è corretto; altrimenti usare la funzione di maschera del singolo soggetto esportata dallo stesso file.)

- [ ] **Step 8: Run tests and type-check**

Run: `MSYS_NO_PATHCONV=1 docker exec utenzepa-api-1 sh -c "pnpm exec jest src/apis/invoices src/database/fatture-per-utenza-impegni.migration.spec.ts src/apis/budget-commitments --maxWorkers=2 && pnpm run type-check"`
Expected: PASS, tsc senza errori. Se `type-check` segnala altri usi di `budget_chapters`/`InvoiceBudgetChapter` (es. `budget-chapters.service.ts`), rimuoverli.

- [ ] **Step 9: Commit**

```bash
git add backend/src/apis/invoices
git commit -m "feat: fatture con righe per utenza e impegno"
```

---

### Task 4: Spesa calcolata (utenza, immobile, riepilogo capitoli del contratto)

**Files:**
- Create: `backend/src/apis/spending/spending.service.ts`, `spending.controller.ts`, `spending.module.ts`
- Modify: `backend/src/app.module.ts`
- Test: `backend/src/apis/spending/spending.service.spec.ts`

**Interfaces:**
- Produces:
  - `GET /utilities/:id/spending` → `YearSpending[]` = `{ year: number; total: number; invoices: number }[]` (anno decrescente);
  - `GET /assets/:id/spending` → `{ years: YearSpending[]; shared_utilities: number }`;
  - `GET /contracts/:id/chapters-summary` → `ChapterSummary[]` = `{ budget_chapter_id: number | null; chapter_code: string | null; article: number | null; description: string | null; utilities: number; committed: { year: number; amount: number | null; commitment_id: number }[]; spent: { year: number; total: number }[] }[]`.
- Anno di una riga: `COALESCE(bcm.fiscal_year, YEAR(i.invoice_date))`. Capitolo di una riga: impegno → capitolo dell'impegno, altrimenti capitolo dell'utenza (`u.budget_chapter_code_fk`), altrimenti null.

- [ ] **Step 1: Write the failing tests**

```ts
// backend/src/apis/spending/spending.service.spec.ts
import { SpendingService } from './spending.service';

describe('SpendingService', () => {
  let query: jest.Mock;
  let service: SpendingService;

  beforeEach(() => {
    query = jest.fn().mockResolvedValue([]);
    service = new SpendingService({ query } as never);
  });

  it('spesa per utenza per anno, numeri convertiti, solo fatture non cancellate', async () => {
    query.mockResolvedValue([{ year: 2026, total: '30.50', invoices: '2' }, { year: '2025', total: '10.00', invoices: 1 }]);
    expect(await service.forUtility(3)).toEqual([
      { year: 2026, total: 30.5, invoices: 2 },
      { year: 2025, total: 10, invoices: 1 },
    ]);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('i.deleted = 0');
    expect(sql).toContain('COALESCE(bcm.fiscal_year, YEAR(i.invoice_date))');
    expect(params).toEqual([3]);
  });

  it('spesa per immobile con conteggio utenze condivise con altri immobili', async () => {
    query
      .mockResolvedValueOnce([{ year: 2026, total: '5', invoices: '1' }])
      .mockResolvedValueOnce([{ shared: '2' }]);
    expect(await service.forAsset(8)).toEqual({ years: [{ year: 2026, total: 5, invoices: 1 }], shared_utilities: 2 });
    expect(query.mock.calls[0][0]).toContain('utility_assets');
  });

  it('riepilogo capitoli: unisce utenze, impegni e speso per capitolo', async () => {
    query
      .mockResolvedValueOnce([
        { budget_chapter_id: 7, chapter_code: '11428', article: 0, description: 'Acqua', utilities: '12' },
        { budget_chapter_id: null, chapter_code: null, article: null, description: null, utilities: '3' },
      ])
      .mockResolvedValueOnce([{ id: 4, budget_chapter_id: 7, fiscal_year: 2026, amount: null }])
      .mockResolvedValueOnce([{ budget_chapter_id: 7, year: 2026, total: '99.90' }]);
    const rows = await service.chaptersSummary(1);
    expect(rows[0]).toEqual({
      budget_chapter_id: 7, chapter_code: '11428', article: 0, description: 'Acqua', utilities: 12,
      committed: [{ year: 2026, amount: null, commitment_id: 4 }],
      spent: [{ year: 2026, total: 99.9 }],
    });
    expect(rows[1]).toEqual(expect.objectContaining({ budget_chapter_id: null, utilities: 3, committed: [], spent: [] }));
  });

  it('riepilogo capitoli: un capitolo impegnato senza utenze compare con 0 utenze', async () => {
    query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 4, budget_chapter_id: 9, fiscal_year: 2026, amount: '100', chapter_code: '12193', article: 0, description: 'Gas' }])
      .mockResolvedValueOnce([]);
    const rows = await service.chaptersSummary(1);
    expect(rows).toEqual([expect.objectContaining({ budget_chapter_id: 9, chapter_code: '12193', utilities: 0, committed: [{ year: 2026, amount: 100, commitment_id: 4 }] })]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `MSYS_NO_PATHCONV=1 docker exec utenzepa-api-1 sh -c "pnpm exec jest src/apis/spending --maxWorkers=2"`
Expected: FAIL, modulo non trovato.

- [ ] **Step 3: Implementation**

```ts
// spending.service.ts
import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

export interface YearSpending {
  year: number;
  total: number;
  invoices: number;
}

export interface ChapterSummary {
  budget_chapter_id: number | null;
  chapter_code: string | null;
  article: number | null;
  description: string | null;
  utilities: number;
  committed: { year: number; amount: number | null; commitment_id: number }[];
  spent: { year: number; total: number }[];
}

// Anno di una riga: esercizio dell'impegno, altrimenti anno della fattura.
const YEAR = 'COALESCE(bcm.fiscal_year, YEAR(i.invoice_date))';
const LINES = `FROM invoice_lines il
  JOIN invoices i ON i.id = il.invoice_id_fk AND i.deleted = 0
  LEFT JOIN budget_commitments bcm ON bcm.id = il.commitment_id_fk`;

const toYears = (rows: Record<string, unknown>[]): YearSpending[] =>
  rows.map((r) => ({ year: Number(r.year), total: Number(r.total), invoices: Number(r.invoices) }));

// Spesa calcolata dalle righe fattura (IVA inclusa), mai salvata.
@Injectable()
export class SpendingService {
  constructor(private readonly dataSource: DataSource) {}

  async forUtility(utilityId: number): Promise<YearSpending[]> {
    return toYears(
      await this.dataSource.query(
        `SELECT ${YEAR} AS year, SUM(il.amount) AS total, COUNT(DISTINCT i.id) AS invoices
         ${LINES}
         WHERE il.utility_id_fk = ?
         GROUP BY year ORDER BY year DESC`,
        [utilityId],
      ),
    );
  }

  // Un'utenza collegata a più immobili conta intera su ciascuno: shared_utilities
  // dice alla UI quante sono, per la nota.
  async forAsset(assetId: number): Promise<{ years: YearSpending[]; shared_utilities: number }> {
    const years = toYears(
      await this.dataSource.query(
        `SELECT ${YEAR} AS year, SUM(il.amount) AS total, COUNT(DISTINCT i.id) AS invoices
         ${LINES}
         JOIN utility_assets ua ON ua.utility_id = il.utility_id_fk AND ua.asset_id = ?
         GROUP BY year ORDER BY year DESC`,
        [assetId],
      ),
    );
    const [{ shared }] = await this.dataSource.query(
      `SELECT COUNT(*) AS shared FROM utility_assets ua
       WHERE ua.asset_id = ? AND EXISTS (SELECT 1 FROM utility_assets o WHERE o.utility_id = ua.utility_id AND o.asset_id <> ua.asset_id)`,
      [assetId],
    );
    return { years, shared_utilities: Number(shared) };
  }

  async chaptersSummary(contractId: number): Promise<ChapterSummary[]> {
    const byUtility: Record<string, unknown>[] = await this.dataSource.query(
      `SELECT b.id AS budget_chapter_id, b.chapter_code, b.article, b.description, COUNT(*) AS utilities
       FROM contract_utilities cu
       JOIN utilities u ON u.id = cu.utility_id AND u.deleted = 0 AND u.supply_active = 1
       LEFT JOIN budget_chapters b ON b.id = u.budget_chapter_code_fk
       WHERE cu.contract_id = ?
       GROUP BY b.id, b.chapter_code, b.article, b.description
       ORDER BY b.chapter_code, b.article`,
      [contractId],
    );
    const commitments: Record<string, unknown>[] = await this.dataSource.query(
      `SELECT bcm.id, bcm.budget_chapter_id_fk AS budget_chapter_id, bcm.fiscal_year, bcm.amount,
              b.chapter_code, b.article, b.description
       FROM budget_commitments bcm JOIN budget_chapters b ON b.id = bcm.budget_chapter_id_fk
       WHERE bcm.contract_id_fk = ? AND bcm.deleted = 0
       ORDER BY bcm.fiscal_year DESC`,
      [contractId],
    );
    const spent: Record<string, unknown>[] = await this.dataSource.query(
      `SELECT COALESCE(bcm.budget_chapter_id_fk, u.budget_chapter_code_fk) AS budget_chapter_id,
              ${YEAR} AS year, SUM(il.amount) AS total
       ${LINES}
       LEFT JOIN utilities u ON u.id = il.utility_id_fk
       WHERE i.contratto_id_fk = ?
       GROUP BY budget_chapter_id, year ORDER BY year DESC`,
      [contractId],
    );

    const key = (v: unknown) => (v === null || v === undefined ? 'null' : String(Number(v)));
    const rows = new Map<string, ChapterSummary>();
    const ensure = (r: Record<string, unknown>): ChapterSummary => {
      const k = key(r.budget_chapter_id);
      if (!rows.has(k)) {
        rows.set(k, {
          budget_chapter_id: r.budget_chapter_id == null ? null : Number(r.budget_chapter_id),
          chapter_code: (r.chapter_code as string) ?? null,
          article: r.article == null ? null : Number(r.article),
          description: (r.description as string) ?? null,
          utilities: 0,
          committed: [],
          spent: [],
        });
      }
      return rows.get(k)!;
    };
    byUtility.forEach((r) => (ensure(r).utilities = Number(r.utilities)));
    commitments.forEach((r) =>
      ensure(r).committed.push({
        year: Number(r.fiscal_year),
        amount: r.amount == null ? null : Number(r.amount),
        commitment_id: Number(r.id),
      }),
    );
    spent.forEach((r) => {
      const k = key(r.budget_chapter_id);
      const row = rows.get(k) ?? ensure({ budget_chapter_id: r.budget_chapter_id });
      row.spent.push({ year: Number(r.year), total: Number(r.total) });
    });
    return [...rows.values()];
  }
}
```

```ts
// spending.controller.ts
import { Controller, Get, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@/core/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/core/auth/guards/roles.guard';
import { ChapterSummary, SpendingService, YearSpending } from './spending.service';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class SpendingController {
  constructor(private readonly service: SpendingService) {}

  @Get('utilities/:id/spending')
  utility(@Param('id', ParseIntPipe) id: number): Promise<YearSpending[]> {
    return this.service.forUtility(id);
  }

  @Get('assets/:id/spending')
  asset(@Param('id', ParseIntPipe) id: number): Promise<{ years: YearSpending[]; shared_utilities: number }> {
    return this.service.forAsset(id);
  }

  @Get('contracts/:id/chapters-summary')
  chapters(@Param('id', ParseIntPipe) id: number): Promise<ChapterSummary[]> {
    return this.service.chaptersSummary(id);
  }
}
```

```ts
// spending.module.ts
import { Module } from '@nestjs/common';
import { SpendingService } from './spending.service';
import { SpendingController } from './spending.controller';

@Module({ providers: [SpendingService], controllers: [SpendingController] })
export class SpendingModule {}
```

Registrare `SpendingModule` in `app.module.ts` **prima** di `UtilityModule`, `AssetsModule` e `ContractsModule` nell'array `imports`? Non serve: le route `utilities/:id/spending` non collidono con `utilities/:id` (segmenti diversi). Aggiungerlo in fondo all'array.

- [ ] **Step 4: Run tests**

Run: `MSYS_NO_PATHCONV=1 docker exec utenzepa-api-1 sh -c "pnpm exec jest src/apis/spending --maxWorkers=2"`
Expected: PASS (4 test).

- [ ] **Step 5: Smoke test the SQL against the real DB**

Run (le query devono girare senza errori anche con tabelle vuote):
`docker exec utenzepa-mysql-1 mysql -uroot -p"$PW" mydatabase -e "SELECT COALESCE(bcm.fiscal_year, YEAR(i.invoice_date)) AS year, SUM(il.amount) AS total FROM invoice_lines il JOIN invoices i ON i.id = il.invoice_id_fk AND i.deleted = 0 LEFT JOIN budget_commitments bcm ON bcm.id = il.commitment_id_fk WHERE il.utility_id_fk = 1 GROUP BY year;"` (con `PW` letto da `.env`, `MYSQL_PASSWORD`).
Expected: risultato vuoto, nessun errore.

- [ ] **Step 6: Commit**

```bash
git add backend/src/apis/spending backend/src/app.module.ts
git commit -m "feat: spesa da fatture per utenza, immobile e capitolo"
```

---

### Task 5: Anomalie

**Files:**
- Modify: `backend/src/apis/anomalies/anomalies.service.ts`
- Test: `backend/src/apis/anomalies/anomalies.service.spec.ts`

**Interfaces:**
- Produces in `Anomalies`:
  - `invoices_on_ceased_utilities: AnomalyList<{ invoice_id: number; number: string; invoice_date: string; utility_id: number; utility_code: string }>`
  - `utilities_with_uncommitted_chapter: AnomalyList<UtilityAnomaly & { chapter: string }>`
  - `invoice_lines_without_utility: AnomalyList<{ invoice_id: number; number: string; supply_code: string | null; amount: number }>`
- Le tre query si aggiungono **dopo** tutte quelle esistenti (i test esistenti usano `mockResolvedValueOnce` in ordine).

- [ ] **Step 1: Write the failing tests**

Aggiungere in `anomalies.service.spec.ts`:

```ts
  it('fatture dell’ultimo anno su utenze cessate', async () => {
    query.mockImplementation(async (sql: string) =>
      sql.includes('u.supply_active = 0')
        ? [{ invoice_id: '741', number: 'F-1', invoice_date: '2026-01-10', utility_id: '3', utility_code: 'ACQ1' }]
        : [],
    );
    const result = await service.getAnomalies();
    expect(result.invoices_on_ceased_utilities).toEqual({
      count: 1,
      items: [{ invoice_id: 741, number: 'F-1', invoice_date: '2026-01-10', utility_id: 3, utility_code: 'ACQ1' }],
    });
    const sql = query.mock.calls.map(([s]) => String(s)).find((s) => s.includes('u.supply_active = 0'));
    expect(sql).toContain('INTERVAL 12 MONTH');
    expect(sql).toContain('i.deleted = 0');
  });

  it('utenze con capitolo non impegnato: solo contratti con almeno un impegno', async () => {
    query.mockImplementation(async (sql: string) =>
      sql.includes('NOT EXISTS (SELECT 1 FROM budget_commitments')
        ? [{ id: '5', utility_id: 'IT01', type: 'acqua', contracts: '#1 ACA', chapter: '11428/0' }]
        : [],
    );
    const result = await service.getAnomalies();
    expect(result.utilities_with_uncommitted_chapter.items).toEqual([
      { id: 5, utility_id: 'IT01', type: 'acqua', contracts: '#1 ACA', chapter: '11428/0' },
    ]);
    const sql = query.mock.calls.map(([s]) => String(s)).find((s) => s.includes('NOT EXISTS (SELECT 1 FROM budget_commitments'));
    expect(sql).toContain('EXISTS (SELECT 1 FROM budget_commitments any_c WHERE any_c.contract_id_fk = c.id AND any_c.deleted = 0)');
  });

  it('righe fattura senza utenza', async () => {
    query.mockImplementation(async (sql: string) =>
      sql.includes('il.utility_id_fk IS NULL')
        ? [{ invoice_id: '9', number: 'F-9', supply_code: 'IT001E00000001', amount: '12.30' }]
        : [],
    );
    const result = await service.getAnomalies();
    expect(result.invoice_lines_without_utility.items).toEqual([
      { invoice_id: 9, number: 'F-9', supply_code: 'IT001E00000001', amount: 12.3 },
    ]);
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `MSYS_NO_PATHCONV=1 docker exec utenzepa-api-1 sh -c "pnpm exec jest src/apis/anomalies --maxWorkers=2"`
Expected: FAIL (proprietà assenti).

- [ ] **Step 3: Implementation**

Nell'interfaccia `Anomalies` aggiungere le tre proprietà (tipi in **Interfaces**). In `getAnomalies()`, dopo l'ultima query esistente (`assetsWithoutClassification`) e prima del `return`:

```ts
    const onCeased: Record<string, unknown>[] = await this.dataSource.query(
      `SELECT DISTINCT i.id AS invoice_id, i.invoice_id AS number,
              DATE_FORMAT(i.invoice_date, '%Y-%m-%d') AS invoice_date,
              u.id AS utility_id, u.utility_id AS utility_code
       FROM invoice_lines il
       JOIN invoices i ON i.id = il.invoice_id_fk AND i.deleted = 0
       JOIN utilities u ON u.id = il.utility_id_fk AND u.deleted = 0
       WHERE u.supply_active = 0 AND i.invoice_date >= CURDATE() - INTERVAL 12 MONTH
       ORDER BY i.invoice_date DESC, i.id`,
    );

    // Solo contratti che hanno almeno un impegno censito: finché gli impegni
    // sono vuoti segnalerebbe tutte le utenze.
    const uncommitted: Record<string, unknown>[] = await this.dataSource.query(
      `SELECT ${utilityColumns}, ${currentContractsList},
              CONCAT(b.chapter_code, '/', b.article) AS chapter
       ${activeUtilities.replace('WHERE', 'JOIN budget_chapters b ON b.id = u.budget_chapter_code_fk WHERE')}
       AND EXISTS (
         SELECT 1 FROM contract_utilities cu JOIN contracts c ON c.id = cu.contract_id AND c.deleted = 0
         WHERE cu.utility_id = u.id AND c.closed = 0
           AND EXISTS (SELECT 1 FROM budget_commitments any_c WHERE any_c.contract_id_fk = c.id AND any_c.deleted = 0)
           AND NOT EXISTS (SELECT 1 FROM budget_commitments bc
                           WHERE bc.contract_id_fk = c.id AND bc.deleted = 0 AND bc.budget_chapter_id_fk = u.budget_chapter_code_fk))
       ORDER BY t.name, u.utility_id`,
    );

    const withoutUtility: Record<string, unknown>[] = await this.dataSource.query(
      `SELECT i.id AS invoice_id, i.invoice_id AS number, il.supply_code, il.amount
       FROM invoice_lines il JOIN invoices i ON i.id = il.invoice_id_fk AND i.deleted = 0
       WHERE il.utility_id_fk IS NULL
       ORDER BY i.invoice_date DESC, i.id`,
    );
```

e nel `return`:

```ts
      invoices_on_ceased_utilities: list(
        onCeased.map((r) => ({
          invoice_id: Number(r.invoice_id),
          number: String(r.number),
          invoice_date: String(r.invoice_date),
          utility_id: Number(r.utility_id),
          utility_code: String(r.utility_code),
        })),
      ),
      utilities_with_uncommitted_chapter: list(
        uncommitted.map((r) => ({
          id: Number(r.id),
          utility_id: String(r.utility_id),
          type: (r.type as string) ?? null,
          contracts: (r.contracts as string) ?? null,
          chapter: String(r.chapter),
        })),
      ),
      invoice_lines_without_utility: list(
        withoutUtility.map((r) => ({
          invoice_id: Number(r.invoice_id),
          number: String(r.number),
          supply_code: (r.supply_code as string) ?? null,
          amount: Number(r.amount),
        })),
      ),
```

Nota: `activeUtilities` è `FROM utilities u JOIN utility_types t … WHERE u.deleted = 0 AND u.supply_active = 1`; il `replace` inserisce la JOIN sul capitolo prima del `WHERE`. Se l'implementatore preferisce, scrivere la FROM esplicita invece del `replace` — il test controlla solo i frammenti citati.

- [ ] **Step 4: Run tests + SQL smoke test**

Run: `MSYS_NO_PATHCONV=1 docker exec utenzepa-api-1 sh -c "pnpm exec jest src/apis/anomalies --maxWorkers=2"` → PASS.
Poi con l'API su (token di un utente temporaneo, vedi Task 11) oppure semplicemente dopo il riavvio: `docker logs --since 60s utenzepa-api-1 | grep -i error` vuoto e, in Task 11, la dashboard carica.

- [ ] **Step 5: Commit**

```bash
git add backend/src/apis/anomalies
git commit -m "feat: anomalie su fatture e capitoli non impegnati"
```

---

### Task 6: Frontend — modelli e servizi (impegni, righe, spesa)

**Files:**
- Create: `frontend/src/app/pages/contracts/commitments/commitment.model.ts`
- Create: `frontend/src/app/pages/contracts/commitments/commitment.service.ts`
- Create: `frontend/src/app/pages/invoices/entity/invoice-line.model.ts`
- Modify: `frontend/src/app/pages/invoices/entity/invoice.entity.ts`, `invoice.interface.ts`
- Create: `frontend/src/app/pages/spending/spending.model.ts`, `spending.service.ts`
- Modify: `frontend/src/app/core/services/entity-navigator.service.ts` (aggiunge `openInvoice`)

**Interfaces:**
- Produces:
  - `Commitment { id; contract_id_fk; budget_chapter_id_fk; fiscal_year; commitment_number: string|null; amount: number|null; notes: string|null; budgetChapter?: BudgetChapter }`, `CommitmentPayload` (senza id/relazioni);
  - `CommitmentService.list(contractId)`, `.create(contractId, p)`, `.update(id, p)`, `.delete(id)`;
  - `InvoiceLine { id?; amount: number; utility_id_fk: number|null; commitment_id_fk: number|null; period_start: string|null; period_end: string|null; consumption: number|null; supply_code: string|null; description: string|null; utility?: Utility|null; commitment?: Commitment|null }`, `toLinePayload(l: InvoiceLine)`;
  - `Invoice.lines`, `Invoice.total_amount`, `Invoice.supplier_id_fk`, `Invoice.supplier`;
  - `YearSpending`, `AssetSpending`, `ChapterSummary` (stessi campi del backend, Task 4); `SpendingService.utility(id)`, `.asset(id)`, `.contractChapters(id)`;
  - `EntityNavigatorService.openInvoice(id: number): Observable<Invoice | null>`.

- [ ] **Step 1: Models**

```ts
// pages/contracts/commitments/commitment.model.ts
import type {BudgetChapter} from '../../budget-chapters/entity/budget-chapter.entity';

export interface Commitment {
  id: number;
  contract_id_fk: number;
  budget_chapter_id_fk: number;
  fiscal_year: number;
  commitment_number: string | null;
  amount: number | null;
  notes: string | null;
  budgetChapter?: BudgetChapter;
}

export type CommitmentPayload = Pick<Commitment, 'budget_chapter_id_fk' | 'fiscal_year' | 'commitment_number' | 'amount' | 'notes'>;

export const chapterLabel = (c: {chapter_code?: string | null; article?: number | null; description?: string | null} | null | undefined): string =>
  c?.chapter_code ? `${c.chapter_code}/${c.article ?? 0}${c.description ? ' — ' + c.description : ''}` : 'Senza capitolo';
```

```ts
// pages/invoices/entity/invoice-line.model.ts
import type {Utility} from '../../utilities/entity/utility.entity';
import type {Commitment} from '../../contracts/commitments/commitment.model';

export interface InvoiceLine {
  id?: number;
  amount: number;
  utility_id_fk: number | null;
  commitment_id_fk: number | null;
  period_start: string | null;
  period_end: string | null;
  consumption: number | null;
  supply_code: string | null;
  description: string | null;
  utility?: Utility | null;
  commitment?: Commitment | null;
}

// Solo i campi che il backend accetta (whitelist + forbidNonWhitelisted).
export const toLinePayload = (l: InvoiceLine): InvoiceLine => ({
  amount: Number(l.amount),
  utility_id_fk: l.utility_id_fk ?? null,
  commitment_id_fk: l.commitment_id_fk ?? null,
  period_start: l.period_start ?? null,
  period_end: l.period_end ?? null,
  consumption: l.consumption === null || l.consumption === undefined || `${l.consumption}` === '' ? null : Number(l.consumption),
  supply_code: l.supply_code?.trim() || null,
  description: l.description?.trim() || null,
});
```

In `invoice.entity.ts`: rimuovere `budget_chapters` (e l'import di `BudgetChapter`/`Transform` se non usati); `net_amount_excl_vat` diventa `number | null`; aggiungere:

```ts
  @Type(() => Number)
  total_amount?: number | null;

  supplier_id_fk?: number | null;

  @Exclude({toPlainOnly: true})
  @Type(() => ThirdParty)
  supplier?: ThirdParty | null;

  // In invio solo i campi della riga (toLinePayload), mai le relazioni.
  @Transform(({value}) => (Array.isArray(value) ? value.map(toLinePayload) : value), {toPlainOnly: true})
  lines?: InvoiceLine[];
```

e in `Invoice.create()` togliere `net_amount_excl_vat: 0` (→ `null`), aggiungere `lines: []`, `total_amount: null`, `supplier_id_fk: null`. Allineare `invoice.interface.ts` agli stessi campi (togliere `budget_chapters`).

```ts
// pages/spending/spending.model.ts
export interface YearSpending { year: number; total: number; invoices: number; }
export interface AssetSpending { years: YearSpending[]; shared_utilities: number; }
export interface ChapterSummary {
  budget_chapter_id: number | null;
  chapter_code: string | null;
  article: number | null;
  description: string | null;
  utilities: number;
  committed: {year: number; amount: number | null; commitment_id: number}[];
  spent: {year: number; total: number}[];
}
```

- [ ] **Step 2: Services**

```ts
// pages/contracts/commitments/commitment.service.ts
import {inject, Injectable} from '@angular/core';
import {HttpClient, HttpHeaders} from '@angular/common/http';
import {Observable} from 'rxjs';
import {environment} from '../../../../environments/environment';
import {AuthService} from '../../../services/auth.service';
import {Commitment, CommitmentPayload} from './commitment.model';

// Route annidate: non estende AbstractService, header Authorization a mano.
@Injectable({providedIn: 'root'})
export class CommitmentService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private readonly api = environment.apiUrl;

  private headers(): HttpHeaders {
    return new HttpHeaders({Authorization: `Bearer ${this.auth.getToken() || ''}`});
  }

  list(contractId: number): Observable<Commitment[]> {
    return this.http.get<Commitment[]>(`${this.api}/contracts/${contractId}/commitments`, {headers: this.headers()});
  }

  create(contractId: number, payload: CommitmentPayload): Observable<Commitment> {
    return this.http.post<Commitment>(`${this.api}/contracts/${contractId}/commitments`, payload, {headers: this.headers()});
  }

  update(id: number, payload: Partial<CommitmentPayload>): Observable<Commitment> {
    return this.http.patch<Commitment>(`${this.api}/commitments/${id}`, payload, {headers: this.headers()});
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.api}/commitments/${id}`, {headers: this.headers()});
  }
}
```

```ts
// pages/spending/spending.service.ts
import {inject, Injectable} from '@angular/core';
import {HttpClient, HttpHeaders} from '@angular/common/http';
import {Observable} from 'rxjs';
import {environment} from '../../../environments/environment';
import {AuthService} from '../../services/auth.service';
import {AssetSpending, ChapterSummary, YearSpending} from './spending.model';

@Injectable({providedIn: 'root'})
export class SpendingService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private readonly api = environment.apiUrl;

  private headers(): HttpHeaders {
    return new HttpHeaders({Authorization: `Bearer ${this.auth.getToken() || ''}`});
  }

  utility(id: number): Observable<YearSpending[]> {
    return this.http.get<YearSpending[]>(`${this.api}/utilities/${id}/spending`, {headers: this.headers()});
  }

  asset(id: number): Observable<AssetSpending> {
    return this.http.get<AssetSpending>(`${this.api}/assets/${id}/spending`, {headers: this.headers()});
  }

  contractChapters(id: number): Observable<ChapterSummary[]> {
    return this.http.get<ChapterSummary[]>(`${this.api}/contracts/${id}/chapters-summary`, {headers: this.headers()});
  }
}
```

- [ ] **Step 3: Navigator `openInvoice`**

In `entity-navigator.service.ts`:

```ts
const INVOICE_DIALOG = () => import('../../pages/invoices/invoice-edit-dialog.component').then(m => m.InvoiceEditDialogComponent);
```

iniettare `private invoices = inject(InvoicesService);` (`import {InvoicesService} from '../../pages/invoices/invoices.service'; import {Invoice} from '../../pages/invoices/entity/invoice.entity';`) e:

```ts
  openInvoice(id: number): Observable<Invoice | null> {
    return this.invoices.getById(id).pipe(
      switchMap(item => this.sheet<EditDialogData<Invoice>, Invoice>(INVOICE_DIALOG, {mode: 'edit', item})),
      switchMap(r => (r ? this.invoices.update(r.id, r) : of(null))),
      catchError(err => this.fail('Errore apertura/salvataggio della fattura', err)),
    );
  }
```

(stessa forma di `openSupplyContract`; verificare che `InvoicesService` estenda `AbstractService` con `getById`/`update`.)

- [ ] **Step 4: Compile check**

Run: `docker logs --since 60s utenzepa-frontend-1 2>&1 | grep -E "✘|generation"`
Expected: ultima riga "Application bundle generation complete" (gli errori su `budget_chapters` nel dialog e nella tabella fatture si risolvono nel Task 8; se compaiono qui, proseguire e ricontrollare a fine Task 8).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/pages/contracts/commitments/commitment.model.ts frontend/src/app/pages/contracts/commitments/commitment.service.ts frontend/src/app/pages/invoices/entity/invoice-line.model.ts frontend/src/app/pages/invoices/entity/invoice.entity.ts frontend/src/app/pages/invoices/entity/invoice.interface.ts frontend/src/app/pages/spending/spending.model.ts frontend/src/app/pages/spending/spending.service.ts frontend/src/app/core/services/entity-navigator.service.ts
git commit -m "feat(frontend): modelli e servizi per impegni, righe fattura e spesa"
```

---

### Task 7: Scheda contratto — tab "Impegni e capitoli"

**Files:**
- Create: `frontend/src/app/pages/contracts/commitments/commitment-edit-dialog.component.ts`
- Create: `frontend/src/app/pages/contracts/commitments/contract-commitments-tab.component.ts`
- Modify: `frontend/src/app/pages/contracts/contract-edit-dialog.component.{ts,html}`

**Interfaces:**
- Consumes: `CommitmentService`, `SpendingService.contractChapters`, `chapterLabel`, `BudgetChaptersService` (esistente: verificare nome con `grep -rn "class .*BudgetChapter.*Service" frontend/src/app/pages/budget-chapters`).
- Produces: `<app-contract-commitments-tab [contractId]="..." [canEdit]="..." (changed)="...">`.

- [ ] **Step 1: Dialog impegno**

```ts
// commitment-edit-dialog.component.ts
import {ChangeDetectionStrategy, Component, inject} from '@angular/core';
import {FormBuilder, ReactiveFormsModule, Validators} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatButtonModule} from '@angular/material/button';
import {FilterableSelectComponent} from '../../../core/components/filterable-select.component';
import type {TOption} from '../../../core/types/option.interface';
import {Commitment, CommitmentPayload} from './commitment.model';

export interface CommitmentDialogData {
  item: Commitment | null;
  chapterOptions: TOption[];
}

@Component({
  selector: 'app-commitment-edit-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule, FilterableSelectComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <h2 mat-dialog-title>{{ data.item ? 'Modifica impegno' : 'Nuovo impegno' }}</h2>
    <mat-dialog-content>
      <form [formGroup]="form" style="display: grid; grid-template-columns: 1fr 1fr; gap: 0 1rem; padding-top: 0.5rem;">
        <div style="grid-column: span 2;">
          <app-filterable-select label="Capitolo *" placeholder="Cerca capitolo..." [options]="data.chapterOptions"
            formControlName="budget_chapter_id_fk"
            [errorMessage]="form.controls.budget_chapter_id_fk.invalid && form.controls.budget_chapter_id_fk.touched ? 'Obbligatorio' : null">
          </app-filterable-select>
        </div>
        <mat-form-field>
          <mat-label>Esercizio</mat-label>
          <input matInput type="number" formControlName="fiscal_year">
        </mat-form-field>
        <mat-form-field>
          <mat-label>Numero impegno</mat-label>
          <input matInput formControlName="commitment_number">
        </mat-form-field>
        <mat-form-field>
          <mat-label>Importo impegnato (€)</mat-label>
          <input matInput type="number" step="0.01" formControlName="amount">
        </mat-form-field>
        <mat-form-field style="grid-column: span 2;">
          <mat-label>Note</mat-label>
          <textarea matInput rows="2" formControlName="notes"></textarea>
        </mat-form-field>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-stroked-button type="button" (click)="ref.close()">Annulla</button>
      <button mat-flat-button type="button" (click)="save()">Salva</button>
    </mat-dialog-actions>
  `,
})
export class CommitmentEditDialogComponent {
  protected data = inject<CommitmentDialogData>(MAT_DIALOG_DATA);
  protected ref = inject(MatDialogRef<CommitmentEditDialogComponent, CommitmentPayload | undefined>);
  private fb = inject(FormBuilder);

  form = this.fb.group({
    budget_chapter_id_fk: [this.data.item?.budget_chapter_id_fk ?? null as number | null, Validators.required],
    fiscal_year: [this.data.item?.fiscal_year ?? new Date().getFullYear(), [Validators.required, Validators.min(2000), Validators.max(2100)]],
    commitment_number: [this.data.item?.commitment_number ?? ''],
    amount: [this.data.item?.amount ?? null as number | null],
    notes: [this.data.item?.notes ?? ''],
  });

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    this.ref.close({
      budget_chapter_id_fk: Number(v.budget_chapter_id_fk),
      fiscal_year: Number(v.fiscal_year),
      commitment_number: v.commitment_number?.trim() || null,
      amount: v.amount === null || `${v.amount}` === '' ? null : Number(v.amount),
      notes: v.notes?.trim() || null,
    });
  }
}
```

- [ ] **Step 2: Tab component**

```ts
// contract-commitments-tab.component.ts
import {ChangeDetectionStrategy, Component, EventEmitter, inject, Input, OnInit, Output} from '@angular/core';
import {MatDialog} from '@angular/material/dialog';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatTooltipModule} from '@angular/material/tooltip';
import {forkJoin} from 'rxjs';
import {CommitmentService} from './commitment.service';
import {Commitment, chapterLabel} from './commitment.model';
import {CommitmentEditDialogComponent, CommitmentDialogData} from './commitment-edit-dialog.component';
import {SpendingService} from '../../spending/spending.service';
import type {ChapterSummary} from '../../spending/spending.model';
import type {TOption} from '../../../core/types/option.interface';
import {ToastService} from '../../../core/services/toast.service';
import {ConfirmDialogComponent} from '../../../core/components/confirm-dialog.component';

const eur = (n: number | null | undefined) =>
  n === null || n === undefined ? '—' : n.toLocaleString('it-IT', {style: 'currency', currency: 'EUR'});

@Component({
  selector: 'app-contract-commitments-tab',
  standalone: true,
  imports: [MatButtonModule, MatIconModule, MatTooltipModule],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <h3 class="sheet-section-title">Capitoli</h3>
    @if (!summary.length) {
      <p class="sheet-empty">Nessuna utenza attiva né impegno su questo contratto.</p>
    } @else {
      <table class="sheet-table">
        <thead><tr><th>Capitolo</th><th>Utenze attive</th><th>Impegnato</th><th>Speso da fatture</th></tr></thead>
        <tbody>
          @for (row of summary; track row.budget_chapter_id) {
            <tr [class.row-warning]="row.utilities > 0 && !row.committed.length && row.budget_chapter_id !== null">
              <td>{{ label(row) }}
                @if (row.utilities > 0 && !row.committed.length && row.budget_chapter_id !== null) {
                  <mat-icon class="inline-icon" matTooltip="Capitolo delle utenze senza impegno sul contratto">warning</mat-icon>
                }
              </td>
              <td>{{ row.utilities }}</td>
              <td>{{ committedText(row) }}</td>
              <td>{{ spentText(row) }}</td>
            </tr>
          }
        </tbody>
      </table>
    }

    <div style="display: flex; align-items: center; margin-top: 1rem;">
      <h3 class="sheet-section-title" style="margin: 0;">Impegni</h3>
      @if (canEdit) {
        <button mat-stroked-button type="button" style="margin-left: auto;" (click)="edit(null)">
          <mat-icon>add</mat-icon> Nuovo impegno
        </button>
      }
    </div>
    @if (!commitments.length) {
      <p class="sheet-empty">Nessun impegno censito.</p>
    } @else {
      <table class="sheet-table">
        <thead><tr><th>Esercizio</th><th>Capitolo</th><th>Numero</th><th>Importo</th><th>Note</th>@if (canEdit) {<th></th>}</tr></thead>
        <tbody>
          @for (c of commitments; track c.id) {
            <tr>
              <td>{{ c.fiscal_year }}</td>
              <td>{{ chapterLabel(c.budgetChapter) }}</td>
              <td>{{ c.commitment_number || '—' }}</td>
              <td>{{ eur(c.amount) }}</td>
              <td>{{ c.notes || '' }}</td>
              @if (canEdit) {
                <td style="white-space: nowrap;">
                  <button mat-icon-button type="button" aria-label="Modifica impegno" (click)="edit(c)"><mat-icon>edit</mat-icon></button>
                  <button mat-icon-button type="button" aria-label="Elimina impegno" (click)="remove(c)"><mat-icon>delete</mat-icon></button>
                </td>
              }
            </tr>
          }
        </tbody>
      </table>
    }
  `,
})
export class ContractCommitmentsTabComponent implements OnInit {
  @Input({required: true}) contractId!: number;
  @Input() canEdit = false;
  @Input() chapterOptions: TOption[] = [];
  @Output() changed = new EventEmitter<number>();

  private commitmentService = inject(CommitmentService);
  private spending = inject(SpendingService);
  private dialog = inject(MatDialog);
  private toast = inject(ToastService);

  commitments: Commitment[] = [];
  summary: ChapterSummary[] = [];
  readonly chapterLabel = chapterLabel;
  readonly eur = eur;

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    forkJoin([this.commitmentService.list(this.contractId), this.spending.contractChapters(this.contractId)])
      .subscribe(([commitments, summary]) => {
        this.commitments = commitments;
        this.summary = summary;
        this.changed.emit(commitments.length);
      });
  }

  label(row: ChapterSummary): string {
    return chapterLabel(row);
  }

  committedText(row: ChapterSummary): string {
    return row.committed.length
      ? row.committed.map(c => `${c.year}${c.amount !== null ? ': ' + eur(c.amount) : ''}`).join(' · ')
      : '—';
  }

  spentText(row: ChapterSummary): string {
    return row.spent.length ? row.spent.map(s => `${s.year}: ${eur(s.total)}`).join(' · ') : '—';
  }

  edit(item: Commitment | null): void {
    this.dialog.open<CommitmentEditDialogComponent, CommitmentDialogData>(CommitmentEditDialogComponent, {
      width: '560px', maxWidth: '95vw', data: {item, chapterOptions: this.chapterOptions},
    }).afterClosed().subscribe(payload => {
      if (!payload) return;
      const req = item ? this.commitmentService.update(item.id, payload) : this.commitmentService.create(this.contractId, payload);
      req.subscribe({
        next: () => this.load(),
        error: err => this.toast.error(err?.error?.message ?? 'Errore nel salvataggio dell’impegno'),
      });
    });
  }

  remove(item: Commitment): void {
    this.dialog.open(ConfirmDialogComponent, {
      data: {title: 'Elimina impegno', message: `Eliminare l'impegno ${item.fiscal_year} sul capitolo ${chapterLabel(item.budgetChapter)}?`},
    }).afterClosed().subscribe(ok => {
      if (!ok) return;
      this.commitmentService.delete(item.id).subscribe({
        next: () => this.load(),
        error: err => this.toast.error(err?.error?.message ?? 'Errore nell’eliminazione dell’impegno'),
      });
    });
  }
}
```

Prima di scrivere: verificare i nomi reali di `ToastService.error` e del dialog di conferma (`grep -rn "class ConfirmDialogComponent\|error(" frontend/src/app/core/components/confirm* frontend/src/app/core/services/toast.service.ts`) e delle classi CSS di scheda (`grep -n "sheet-table\|sheet-empty\|sheet-section-title" frontend/src/styles.scss`). Usare quelli esistenti; se una classe non esiste, aggiungerla in `frontend/src/styles.scss` vicino alle altre `sheet-*` (`.sheet-table {width:100%; border-collapse:collapse} .sheet-table th,.sheet-table td {text-align:left; padding:4px 8px; border-bottom:1px solid var(--border-subtle, #e0e0e0)} .row-warning td {background: var(--tone-warning-bg, #fff4e5)}`).

- [ ] **Step 3: Wire into contract sheet**

In `contract-edit-dialog.component.html`, dopo il `</mat-tab>` del tab Utenze e prima di `</mat-tab-group>`:

```html
      @if (!isNew) {
        <mat-tab aria-label="Impegni e capitoli">
          <ng-template mat-tab-label>
            <app-tab-label icon="account_balance" label="Impegni e capitoli" [count]="commitmentCount"></app-tab-label>
          </ng-template>
          <app-contract-commitments-tab
            [contractId]="data.item.id"
            [canEdit]="canEdit"
            [chapterOptions]="chapterOptions"
            (changed)="commitmentCount = $event">
          </app-contract-commitments-tab>
        </mat-tab>
      }
```

In `contract-edit-dialog.component.ts`: aggiungere `ContractCommitmentsTabComponent` agli `imports` del componente; campi `commitmentCount: number | null = null;` e `chapterOptions: TOption[] = [];`; in `ngOnInit` caricare i capitoli con il servizio esistente dei capitoli e mapparli `{label: chapterLabel(c), value: c.id, searchText: `${c.chapter_code}/${c.article ?? 0} ${c.description ?? ''} ${c.pdc ?? ''}`}`.

- [ ] **Step 4: Compile check**

Run: `docker logs --since 60s utenzepa-frontend-1 2>&1 | grep -E "✘|generation"` → "generation complete".

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/pages/contracts/commitments/commitment-edit-dialog.component.ts frontend/src/app/pages/contracts/commitments/contract-commitments-tab.component.ts frontend/src/app/pages/contracts/contract-edit-dialog.component.ts frontend/src/app/pages/contracts/contract-edit-dialog.component.html
git commit -m "feat(frontend): tab Impegni e capitoli nella scheda contratto"
```

(Se è stato modificato `frontend/src/styles.scss`, aggiungerlo esplicitamente al `git add`.)

---

### Task 8: Scheda fattura con righe, elenco e filtri

**Files:**
- Create: `frontend/src/app/pages/invoices/invoice-lines-tab.component.ts`
- Modify: `frontend/src/app/pages/invoices/invoice-edit-dialog.component.{ts,html}`
- Modify: `frontend/src/app/pages/invoices/data-table-invoices.component.{ts,html}` (`useSheet()`, colonne)
- Modify: `frontend/src/app/pages/invoices/invoice-filter-dialog.component.{ts,html}`, `search-invoices.component.ts` (filtro utenza)

**Interfaces:**
- Consumes: `InvoiceLine`, `toLinePayload`, `Commitment`, `CommitmentService.list`, `chapterLabel`, `Invoice` (Task 6).
- Produces: `<app-invoice-lines-tab [lines] [utilityOptions] [commitmentOptions] [readOnly] (linesChange)>`; `InvoiceEditDialogComponent` chiude con `Invoice` comprensiva di `lines`.

- [ ] **Step 1: Lines tab**

```ts
// invoice-lines-tab.component.ts
import {ChangeDetectionStrategy, Component, EventEmitter, Input, OnChanges, Output} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatDatepickerModule} from '@angular/material/datepicker';
import {FilterableSelectComponent} from '../../core/components/filterable-select.component';
import type {TOption} from '../../core/types/option.interface';
import {InvoiceLine} from './entity/invoice-line.model';
import {toIsoDate} from '../utilities/consumptions/consumption.model';

// Riga in modifica: date come Date locali per il datepicker, convertite in
// 'AAAA-MM-GG' (giorno locale) a ogni modifica.
interface EditableLine extends InvoiceLine {
  start: Date | null;
  end: Date | null;
}

const toLocalDate = (iso: string | null): Date | null => {
  if (!iso) return null;
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
};

@Component({
  selector: 'app-invoice-lines-tab',
  standalone: true,
  imports: [FormsModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatIconModule, MatDatepickerModule, FilterableSelectComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <div class="lines-total">
      Totale righe: <strong>{{ eur(sum) }}</strong>
      @if (total !== null && total !== undefined) {
        · Totale documento: <strong>{{ eur(total) }}</strong>
        @if (diff !== 0) { · <span class="tone-warning">Differenza: {{ eur(diff) }}</span> }
      }
    </div>
    @for (l of rows; track $index; let i = $index) {
      <div class="line-row">
        <span class="line-n">{{ i + 1 }}</span>
        <div class="line-utility">
          <app-filterable-select label="Utenza" placeholder="POD/PDR o codice cliente..." [options]="utilityOptions"
            [ngModel]="l.utility_id_fk" (ngModelChange)="set(l, 'utility_id_fk', $event)" [disabled]="readOnly"></app-filterable-select>
        </div>
        <div class="line-commitment">
          <app-filterable-select label="Impegno" placeholder="Capitolo/esercizio..." [options]="commitmentOptions"
            [ngModel]="l.commitment_id_fk" (ngModelChange)="set(l, 'commitment_id_fk', $event)" [disabled]="readOnly"></app-filterable-select>
        </div>
        <mat-form-field class="line-date">
          <mat-label>Dal</mat-label>
          <input matInput [matDatepicker]="dp1" [ngModel]="l.start" (ngModelChange)="setDate(l, 'start', $event)" [disabled]="readOnly" placeholder="GG/MM/AAAA">
          <mat-datepicker-toggle matIconSuffix [for]="dp1"></mat-datepicker-toggle>
          <mat-datepicker #dp1></mat-datepicker>
        </mat-form-field>
        <mat-form-field class="line-date">
          <mat-label>Al</mat-label>
          <input matInput [matDatepicker]="dp2" [ngModel]="l.end" (ngModelChange)="setDate(l, 'end', $event)" [disabled]="readOnly" placeholder="GG/MM/AAAA">
          <mat-datepicker-toggle matIconSuffix [for]="dp2"></mat-datepicker-toggle>
          <mat-datepicker #dp2></mat-datepicker>
        </mat-form-field>
        <mat-form-field class="line-num">
          <mat-label>Consumo</mat-label>
          <input matInput type="number" [ngModel]="l.consumption" (ngModelChange)="set(l, 'consumption', $event)" [disabled]="readOnly">
        </mat-form-field>
        <mat-form-field class="line-num">
          <mat-label>Importo € *</mat-label>
          <input matInput type="number" step="0.01" [ngModel]="l.amount" (ngModelChange)="set(l, 'amount', $event)" [disabled]="readOnly" required>
        </mat-form-field>
        <mat-form-field class="line-code">
          <mat-label>Codice fornitura</mat-label>
          <input matInput [ngModel]="l.supply_code" (ngModelChange)="set(l, 'supply_code', $event)" [disabled]="readOnly">
        </mat-form-field>
        <mat-form-field class="line-desc">
          <mat-label>Descrizione</mat-label>
          <input matInput [ngModel]="l.description" (ngModelChange)="set(l, 'description', $event)" [disabled]="readOnly">
        </mat-form-field>
        @if (!readOnly) {
          <button mat-icon-button type="button" aria-label="Rimuovi riga" (click)="removeAt(i)"><mat-icon>delete</mat-icon></button>
        }
      </div>
    } @empty {
      <p class="sheet-empty">Nessuna riga: la fattura non è ancora ripartita sulle utenze.</p>
    }
    @if (!readOnly) {
      <button mat-stroked-button type="button" (click)="add()"><mat-icon>add</mat-icon> Aggiungi riga</button>
    }
  `,
  styles: [`
    .lines-total { margin: 0.25rem 0 0.75rem; }
    .line-row { display: grid; grid-template-columns: 1.5rem 2fr 2fr 9rem 9rem 7rem 8rem 9rem 2fr auto; gap: 0 0.5rem; align-items: start; }
    .line-n { padding-top: 1rem; color: var(--text-muted, #666); }
    .tone-warning { color: var(--tone-warning, #b26a00); }
  `],
})
export class InvoiceLinesTabComponent implements OnChanges {
  @Input() lines: InvoiceLine[] = [];
  @Input() total: number | null | undefined = null;
  @Input() utilityOptions: TOption[] = [];
  @Input() commitmentOptions: TOption[] = [];
  @Input() readOnly = false;
  @Output() linesChange = new EventEmitter<InvoiceLine[]>();

  rows: EditableLine[] = [];
  sum = 0;

  get diff(): number {
    return this.total === null || this.total === undefined ? 0 : Math.round((Number(this.total) - this.sum) * 100) / 100;
  }

  ngOnChanges(): void {
    // Ricostruisce solo se l'array in ingresso è diverso da quello emesso
    // (evita di perdere il focus a ogni modifica).
    if (this.lines !== this.lastEmitted) {
      this.rows = (this.lines ?? []).map(l => ({...l, start: toLocalDate(l.period_start), end: toLocalDate(l.period_end)}));
      this.recalc();
    }
  }

  eur(n: number | null | undefined): string {
    return n === null || n === undefined ? '—' : Number(n).toLocaleString('it-IT', {style: 'currency', currency: 'EUR'});
  }

  set<K extends keyof InvoiceLine>(l: EditableLine, key: K, value: InvoiceLine[K]): void {
    l[key] = value;
    this.emit();
  }

  setDate(l: EditableLine, key: 'start' | 'end', value: Date | null): void {
    l[key] = value;
    const iso = value instanceof Date && !isNaN(value.getTime()) ? toIsoDate(value) : null;
    if (key === 'start') l.period_start = iso; else l.period_end = iso;
    this.emit();
  }

  add(): void {
    this.rows = [...this.rows, {
      amount: 0, utility_id_fk: null, commitment_id_fk: null, period_start: null, period_end: null,
      consumption: null, supply_code: null, description: null, start: null, end: null,
    }];
    this.emit();
  }

  removeAt(i: number): void {
    this.rows = this.rows.filter((_, j) => j !== i);
    this.emit();
  }

  private lastEmitted: InvoiceLine[] | null = null;

  private emit(): void {
    this.recalc();
    this.lastEmitted = this.rows.map(({start: _s, end: _e, ...l}) => l);
    this.linesChange.emit(this.lastEmitted);
  }

  private recalc(): void {
    this.sum = Math.round(this.rows.reduce((s, l) => s + (Number(l.amount) || 0), 0) * 100) / 100;
  }
}
```

(Se `FilterableSelectComponent` non supporta `[disabled]`/`ngModel` standalone — è un `ControlValueAccessor`, quindi `ngModel` funziona; `[disabled]` con `ngModel` va passato come `[disabled]` sull'host solo se il componente ha `setDisabledState`: verificare e, se manca, usare `@if (readOnly)` con testo statico.)

- [ ] **Step 2: Invoice sheet**

Riscrivere `invoice-edit-dialog.component.html` sul modello di `contract-edit-dialog.component.html`:

```html
<app-entity-sheet
  icon="receipt_long"
  color="var(--entity-supply-contract)"
  [title]="isNew ? 'Nuova fattura' : 'Fattura ' + (form.controls.invoice_id.value || '')"
  [subtitle]="supplierLabel"
  [lastModified]="lastModified">

  <form [formGroup]="form">
    <mat-tab-group mat-stretch-tabs="false" mat-align-tabs="start" animationDuration="0ms">
      <mat-tab aria-label="Riepilogo">
        <ng-template mat-tab-label>
          <app-tab-label icon="dashboard" label="Riepilogo" [error]="invalid('invoice_id', 'invoice_date')"></app-tab-label>
        </ng-template>
        <div class="sheet-grid">
          <mat-form-field>
            <mat-label>Numero fattura</mat-label>
            <input matInput formControlName="invoice_id">
            @if (form.controls.invoice_id.invalid && form.controls.invoice_id.touched) { <mat-error>Obbligatorio</mat-error> }
          </mat-form-field>
          <mat-form-field>
            <mat-label>Data fattura</mat-label>
            <input matInput [matDatepicker]="invoiceDatePicker" formControlName="invoice_date" placeholder="GG/MM/AAAA">
            <mat-datepicker-toggle matIconSuffix [for]="invoiceDatePicker"></mat-datepicker-toggle>
            <mat-datepicker #invoiceDatePicker></mat-datepicker>
            @if (form.controls.invoice_date.invalid && form.controls.invoice_date.touched) { <mat-error>Obbligatoria</mat-error> }
          </mat-form-field>
          <mat-form-field>
            <mat-label>Numero protocollo</mat-label>
            <input matInput formControlName="protocol_number">
          </mat-form-field>
          <div class="span-2">
            <app-filterable-select label="Contratto" placeholder="Cerca contratto..." [options]="contractOptions" formControlName="contratto_id_fk"></app-filterable-select>
          </div>
          <div class="span-2">
            <app-filterable-select label="Fornitore" placeholder="Dal contratto, se vuoto" [options]="supplierOptions" formControlName="supplier_id_fk"></app-filterable-select>
          </div>
          <mat-form-field>
            <mat-label>Totale documento IVA inclusa (€)</mat-label>
            <input matInput type="number" step="0.01" formControlName="total_amount">
          </mat-form-field>
          <mat-form-field>
            <mat-label>Imponibile (€)</mat-label>
            <input matInput type="number" step="0.01" formControlName="net_amount_excl_vat">
          </mat-form-field>
          <mat-form-field>
            <mat-label>Morosità (€)</mat-label>
            <input matInput type="number" step="0.01" formControlName="last_invoice_arrears">
          </mat-form-field>
          <mat-form-field class="span-full">
            <mat-label>Note</mat-label>
            <textarea matInput formControlName="notes_on_invoices" rows="3"></textarea>
          </mat-form-field>
        </div>
      </mat-tab>

      <mat-tab aria-label="Righe">
        <ng-template mat-tab-label>
          <app-tab-label icon="list" label="Righe" [count]="lines.length"></app-tab-label>
        </ng-template>
        <app-invoice-lines-tab
          [lines]="lines"
          [total]="form.controls.total_amount.value"
          [utilityOptions]="utilityOptions"
          [commitmentOptions]="commitmentOptions"
          [readOnly]="!canEdit"
          (linesChange)="lines = $event">
        </app-invoice-lines-tab>
      </mat-tab>
    </mat-tab-group>
  </form>

  <ng-container sheetActions>
    <button mat-stroked-button type="button" (click)="cancel()">{{ canEdit ? 'Annulla' : 'Chiudi' }}</button>
    @if (canEdit) {
      <button mat-flat-button type="button" (click)="save()">{{ isNew ? 'Crea fattura' : 'Salva fattura' }}</button>
    }
  </ng-container>
</app-entity-sheet>
```

(Verificare i nomi delle classi `sheet-grid`, `span-2`, `span-full` in `contract-edit-dialog.component.html`/`styles.scss`; usare quelle esistenti.)

In `invoice-edit-dialog.component.ts`:
- imports del componente: `EntitySheetComponent`, `TabLabelComponent`, `MatTabsModule`, `InvoiceLinesTabComponent`, `FilterableSelectComponent`, `MatDatepickerModule`, `MatInputModule`, `MatFormFieldModule`, `MatButtonModule`, `ReactiveFormsModule`;
- campi: `readonly canEdit = isEditorRole(role)`; `readonly lastModified = lastModifiedLabel(this.data.item.update_date, this.data.item.updated_by)`; `lines: InvoiceLine[] = [...(this.data.item.lines ?? [])]`; `utilityOptions: TOption[] = []`; `commitmentOptions: TOption[] = []`; `supplierOptions: TOption[] = []`; `supplierLabel: string | null = partyName(this.data.item.supplier ?? this.data.item.contratto?.supplier) || null`;
- form (togliere `budget_chapter_ids` e i `Validators.required` su protocollo, imponibile, morosità, contratto — Review Focus 1):

```ts
  form = this.fb.group({
    invoice_id: [this.data.item.invoice_id ?? '', Validators.required],
    protocol_number: [this.data.item.protocol_number ?? ''],
    invoice_date: [toLocalDate(this.data.item.invoice_date), Validators.required],
    total_amount: [this.data.item.total_amount ?? null as number | null],
    net_amount_excl_vat: [this.data.item.net_amount_excl_vat ?? null as number | null],
    last_invoice_arrears: [this.data.item.last_invoice_arrears ?? 0],
    contratto_id_fk: [this.data.item.contratto_id_fk ?? null as number | null],
    supplier_id_fk: [this.data.item.supplier_id_fk ?? null as number | null],
    notes_on_invoices: [this.data.item.notes_on_invoices ?? ''],
  });
```

con `toLocalDate` locale al file: `const toLocalDate = (v: unknown): Date | null => { if (!v) return null; if (v instanceof Date) return v; const [y, m, d] = String(v).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };`;
- `ngOnInit`: caricare contratti (già fatto oggi), soggetti terzi giuridici per `supplierOptions` (come nella scheda contratto), utenze per `utilityOptions` (`{label: u.utility_id, value: u.id, sublabel: u.utilityType?.name, searchText: `${u.utility_id} ${u.utility_code ?? ''} ${u.meter_number ?? ''}`}`, servizio `UtilityService` già usato nella scheda contratto); `this.form.controls.contratto_id_fk.valueChanges` + valore iniziale → `loadCommitments(contractId)`:

```ts
  private loadCommitments(contractId: number | null): void {
    if (!contractId) { this.commitmentOptions = []; return; }
    this.commitmentService.list(contractId).subscribe(list => {
      this.commitmentOptions = list.map(c => ({label: `${c.fiscal_year} · ${chapterLabel(c.budgetChapter)}`, value: c.id, sublabel: c.commitment_number ?? undefined}));
    });
  }
```

- `save()`:

```ts
  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const bad = this.lines.findIndex(l => l.amount === null || `${l.amount}` === '' || isNaN(Number(l.amount)));
    if (bad >= 0) {
      this.toast.error(`Riga ${bad + 1}: importo obbligatorio`);
      return;
    }
    const v = this.form.getRawValue();
    this.dialogRef.close(plainToInstance(Invoice, {
      id: this.data.item.id,
      ...v,
      protocol_number: v.protocol_number?.trim() || null,
      total_amount: v.total_amount === null || `${v.total_amount}` === '' ? null : Number(v.total_amount),
      net_amount_excl_vat: v.net_amount_excl_vat === null || `${v.net_amount_excl_vat}` === '' ? null : Number(v.net_amount_excl_vat),
      lines: this.lines,
    }));
  }
```

- `invalid(...names)` = `hasInvalid(this.form, ...names)` da `sheet-utils`.

In `data-table-invoices.component.ts`:
- aggiungere `protected override useSheet(): boolean { return true; }` (come `data-table-contracts`);
- colonne: sostituire `budget_chapters` con `{field: 'chapters', header: 'Capitoli (da impegni)', minWidth: '180px'}` e aggiungere `{field: 'utilities_count', header: 'Utenze', minWidth: '80px'}` e `{field: 'total_amount', header: 'Totale documento', minWidth: '120px'}`; aggiornare `defaultVisibleFields` (`'chapters', 'utilities_count', 'total_amount'` al posto di `'budget_chapters'`); valori:

```ts
  chaptersOf(item: Invoice): string {
    const labels = new Set((item.lines ?? []).map(l => l.commitment?.budgetChapter).filter(Boolean)
      .map(c => `${c!.chapter_code}/${c!.article ?? 0}`));
    return [...labels].join(', ');
  }

  utilitiesCountOf(item: Invoice): number {
    return new Set((item.lines ?? []).map(l => l.utility_id_fk).filter(v => v !== null)).size;
  }
```

in `exportCellValue`: `case 'chapters': return this.chaptersOf(item); case 'utilities_count': return String(this.utilitiesCountOf(item)); case 'total_amount': return item.total_amount != null ? Number(item.total_amount).toLocaleString('it-IT', {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '';` (togliere il `case 'budget_chapters'`). Nel template (`data-table-invoices.component.html`) sostituire la cella `budget_chapters` con `{{ chaptersOf(item) }}` e aggiungere le celle `utilities_count`/`total_amount` sullo stesso schema delle colonne esistenti. La vecchia chiave `budget_chapters` salvata in `localStorage` (`columns:invoices`) viene ignorata da `loadColumnSelection` se il campo non esiste più: verificarlo leggendo `loadColumnSelection`; se non la filtra, filtrare lì i campi sconosciuti.

Filtri: `invoice-filter-dialog` mantiene `budget_chapter_ids` (ora filtrato dal backend sulle righe) e aggiunge `utility_id` (select `app-filterable-select` con le utenze); `search-invoices.component.ts` aggiunge `utility_id: [null]`.

- [ ] **Step 3: Compile check**

Run: `docker logs --since 60s utenzepa-frontend-1 2>&1 | grep -E "✘|generation"`
Expected: "generation complete", nessun `✘`. Cercare residui: `grep -rn "budget_chapters\|budget_chapter_ids" frontend/src/app/pages/invoices` → solo il filtro.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/pages/invoices/invoice-lines-tab.component.ts frontend/src/app/pages/invoices/invoice-edit-dialog.component.ts frontend/src/app/pages/invoices/invoice-edit-dialog.component.html frontend/src/app/pages/invoices/data-table-invoices.component.ts frontend/src/app/pages/invoices/data-table-invoices.component.html frontend/src/app/pages/invoices/invoice-filter-dialog.component.ts frontend/src/app/pages/invoices/invoice-filter-dialog.component.html frontend/src/app/pages/invoices/search-invoices.component.ts
git commit -m "feat(frontend): scheda fattura con righe per utenza"
```

---

### Task 9: Scheda utenza (tab Fatture, capitoli impegnati) e scheda immobile (spesa)

**Files:**
- Create: `frontend/src/app/pages/utilities/utility-invoices-tab.component.ts`
- Modify: `frontend/src/app/pages/utilities/utility-edit-dialog.component.{ts,html}`
- Modify: `frontend/src/app/pages/assets/asset-edit-dialog.component.{ts,html}`

**Interfaces:**
- Consumes: `InvoicesService.search({utility_id})` (AbstractService), `SpendingService.utility/asset`, `CommitmentService.list`, `EntityNavigatorService.openInvoice`.
- Produces: `<app-utility-invoices-tab [utilityId]>`.

- [ ] **Step 1: Utility invoices tab**

```ts
// utility-invoices-tab.component.ts
import {ChangeDetectionStrategy, Component, inject, Input, OnInit} from '@angular/core';
import {forkJoin} from 'rxjs';
import {InvoicesService} from '../invoices/invoices.service';
import {Invoice} from '../invoices/entity/invoice.entity';
import {SpendingService} from '../spending/spending.service';
import type {YearSpending} from '../spending/spending.model';
import {EntityNavigatorService} from '../../core/services/entity-navigator.service';

interface Row { invoiceId: number; number: string; date: string; period: string; consumption: string; amount: number; chapter: string; }

const it = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');
const eur = (n: number) => n.toLocaleString('it-IT', {style: 'currency', currency: 'EUR'});

@Component({
  selector: 'app-utility-invoices-tab',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    @if (years.length) {
      <p class="spending-years">
        @for (y of years; track y.year) {
          <span><strong>{{ y.year }}</strong>: {{ eur(y.total) }} ({{ y.invoices }} fatture)</span>
        }
      </p>
    }
    @if (!rows.length) {
      <p class="sheet-empty">Nessuna fattura su questa utenza.</p>
    } @else {
      <table class="sheet-table">
        <thead><tr><th>Data</th><th>Numero</th><th>Periodo</th><th>Consumo</th><th>Importo</th><th>Capitolo</th></tr></thead>
        <tbody>
          @for (r of rows; track $index) {
            <tr class="clickable" (click)="open(r.invoiceId)">
              <td>{{ r.date }}</td><td>{{ r.number }}</td><td>{{ r.period }}</td><td>{{ r.consumption }}</td><td>{{ eur(r.amount) }}</td><td>{{ r.chapter }}</td>
            </tr>
          }
        </tbody>
      </table>
    }
  `,
  styles: [`.spending-years { display: flex; gap: 1.5rem; flex-wrap: wrap; } .clickable { cursor: pointer; }`],
})
export class UtilityInvoicesTabComponent implements OnInit {
  @Input({required: true}) utilityId!: number;

  private invoices = inject(InvoicesService);
  private spending = inject(SpendingService);
  private navigator = inject(EntityNavigatorService);

  rows: Row[] = [];
  years: YearSpending[] = [];
  readonly eur = eur;

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    forkJoin([this.invoices.search({utility_id: this.utilityId} as never), this.spending.utility(this.utilityId)])
      .subscribe(([list, years]) => {
        this.years = years;
        this.rows = (list as Invoice[])
          .flatMap(inv => (inv.lines ?? []).filter(l => l.utility_id_fk === this.utilityId).map(l => ({
            invoiceId: inv.id,
            number: inv.invoice_id,
            date: it(typeof inv.invoice_date === 'string' ? inv.invoice_date : (inv.invoice_date as unknown as Date)?.toISOString?.()),
            period: l.period_start || l.period_end ? `${it(l.period_start)} – ${it(l.period_end)}` : '',
            consumption: l.consumption !== null && l.consumption !== undefined ? Number(l.consumption).toLocaleString('it-IT') : '',
            amount: Number(l.amount),
            chapter: l.commitment?.budgetChapter ? `${l.commitment.budgetChapter.chapter_code}/${l.commitment.budgetChapter.article ?? 0} (${l.commitment.fiscal_year})` : '',
          })))
          .sort((a, b) => b.date.split('/').reverse().join('').localeCompare(a.date.split('/').reverse().join('')));
      });
  }

  open(id: number): void {
    this.navigator.openInvoice(id).subscribe(saved => { if (saved) this.load(); });
  }
}
```

Attenzione alla data: `Invoice.invoice_date` arriva dal service come `Date` (`@Type(() => Date)` → mezzanotte UTC di `'AAAA-MM-GG'`); per non spostare il giorno, formattarla con `toIsoDate` **non** va bene (giorno locale di un istante UTC: corretto in Italia, ma non portabile) — usare la stringa originale: se `InvoicesService.search` restituisce istanze `Invoice`, leggere `DateHelper.toLocalIsoString(inv.invoice_date)` (in Italia coincide) e documentarlo con un commento. Verificare in E2E (Task 11) che la data mostrata coincida con quella del DB.

- [ ] **Step 2: Wire into utility sheet**

In `utility-edit-dialog.component.html`, dopo il tab "Consumi":

```html
      @if (!isNew) {
        <mat-tab aria-label="Fatture">
          <ng-template mat-tab-label>
            <app-tab-label icon="receipt_long" label="Fatture"></app-tab-label>
          </ng-template>
          <app-utility-invoices-tab [utilityId]="data.item.id"></app-utility-invoices-tab>
        </mat-tab>
      }
```

e aggiungere `UtilityInvoicesTabComponent` agli `imports` del componente. Verificare il nome della variabile "nuova utenza" (`isNew` o `data.mode === 'create'`) nel componente.

- [ ] **Step 3: Capitoli impegnati in cima al select**

In `utility-edit-dialog.component.ts`: campo `private committedChapterIds = new Set<number>();`; in `ngOnInit`, per i contratti aperti dell'utenza (`this.contracts.filter(c => !c.closed)`), `forkJoin(contracts.map(c => this.commitmentService.list(c.id)))` → riempire il set con i `budget_chapter_id_fk` e richiamare `buildBudgetChapterOptions()`. In `buildBudgetChapterOptions()` cambiare l'ordinamento e la sublabel:

```ts
    const committed = (c: BudgetChapter) => this.committedChapterIds.has(c.id);
    this.budgetChapterOptions = [...this.budgetChapters]
      .sort((a, b) =>
        Number(committed(b)) - Number(committed(a)) ||
        Number(compatible(b)) - Number(compatible(a)) ||
        label(a).localeCompare(label(b)))
      .map(c => {
        const parts = [
          committed(c) ? 'impegnato sui contratti dell’utenza' : null,
          c.pdc ? `PDC ${c.pdc}` : null,
          SupplyTypeDescription[c.supply_type] ?? null,
          compatible(c) ? null : 'tipo fornitura diverso dall’utenza',
        ].filter(Boolean);
        return {
          label: label(c),
          value: c.id,
          icon: committed(c) ? 'verified' : undefined,
          sublabel: parts.join(' · '),
          searchText: `${label(c)} ${c.pdc ?? ''}`,
        };
      });
```

(Il "gruppo" della spec è reso con ordinamento in cima + icona + sublabel: `TOption` non ha gruppi e `FilterableSelectComponent` non li rende.)

- [ ] **Step 4: Asset spending box**

In `asset-edit-dialog.component.ts`: `private spending = inject(SpendingService); assetSpending: AssetSpending | null = null;` e in `ngOnInit` (solo se l'immobile esiste) `this.spending.asset(this.data.item.id).subscribe(s => this.assetSpending = s);`. In `asset-edit-dialog.component.html`, nel tab Riepilogo accanto alle altre anteprime:

```html
        @if (assetSpending?.years?.length) {
          <div class="sheet-box">
            <h4>Spesa da fatture</h4>
            @for (y of assetSpending!.years; track y.year) {
              <div>{{ y.year }}: {{ y.total.toLocaleString('it-IT', {style: 'currency', currency: 'EUR'}) }}</div>
            }
            @if (assetSpending!.shared_utilities > 0) {
              <p class="sheet-note">{{ assetSpending!.shared_utilities }} utenze sono collegate anche ad altri immobili: la loro spesa è contata intera qui.</p>
            }
          </div>
        }
```

(Le chiamate di metodo nel template con oggetti letterali possono non essere ammesse dal compilatore Angular: in tal caso aggiungere al componente `eur = (n: number) => n.toLocaleString('it-IT', {style: 'currency', currency: 'EUR'})` e usare `{{ eur(y.total) }}`. Verificare il nome delle classi `sheet-box`/`sheet-note` in uso nel Riepilogo dell'immobile e usare quelle.)

- [ ] **Step 5: Compile check**

Run: `docker logs --since 60s utenzepa-frontend-1 2>&1 | grep -E "✘|generation"` → "generation complete".

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/pages/utilities/utility-invoices-tab.component.ts frontend/src/app/pages/utilities/utility-edit-dialog.component.ts frontend/src/app/pages/utilities/utility-edit-dialog.component.html frontend/src/app/pages/assets/asset-edit-dialog.component.ts frontend/src/app/pages/assets/asset-edit-dialog.component.html
git commit -m "feat(frontend): fatture e capitoli impegnati nella scheda utenza, spesa nell'immobile"
```

---

### Task 10: Dashboard — tre anomalie

**Files:**
- Modify: `frontend/src/app/pages/dashboard/anomalies-card.component.ts`

**Interfaces:**
- Consumes: le tre proprietà di `Anomalies` del Task 5; `EntityNavigatorService.openInvoice` (Task 6).

- [ ] **Step 1: Types and panels**

Nell'interfaccia `Anomalies` del file aggiungere:

```ts
  invoices_on_ceased_utilities: AnomalyList<{invoice_id: number; number: string; invoice_date: string; utility_id: number; utility_code: string}>;
  utilities_with_uncommitted_chapter: AnomalyList<UtilityAnomaly & {chapter: string}>;
  invoice_lines_without_utility: AnomalyList<{invoice_id: number; number: string; supply_code: string | null; amount: number}>;
```

Nel template, dopo il pannello `assets_without_classification`, tre pannelli sullo stesso schema:

```html
            <mat-expansion-panel [disabled]="data.invoices_on_ceased_utilities.count === 0">
              <mat-expansion-panel-header>
                <mat-panel-title>
                  <span class="anomaly-count" [class.zero]="data.invoices_on_ceased_utilities.count === 0">{{ data.invoices_on_ceased_utilities.count }}</span>
                  Fatture su utenze cessate (ultimi 12 mesi)
                </mat-panel-title>
              </mat-expansion-panel-header>
              <ul class="anomaly-list">
                @for (a of data.invoices_on_ceased_utilities.items; track a.invoice_id + '-' + a.utility_id) {
                  <li (click)="openInvoice(a.invoice_id)">{{ a.number }} del {{ a.invoice_date.split('-').reverse().join('/') }} · {{ a.utility_code }}</li>
                }
              </ul>
            </mat-expansion-panel>
            <mat-expansion-panel [disabled]="data.utilities_with_uncommitted_chapter.count === 0">
              <mat-expansion-panel-header>
                <mat-panel-title>
                  <span class="anomaly-count" [class.zero]="data.utilities_with_uncommitted_chapter.count === 0">{{ data.utilities_with_uncommitted_chapter.count }}</span>
                  Utenze con capitolo non impegnato sul contratto
                </mat-panel-title>
              </mat-expansion-panel-header>
              <ul class="anomaly-list">
                @for (u of data.utilities_with_uncommitted_chapter.items; track u.id) {
                  <li (click)="openUtility(u.id)">{{ u.utility_id }} · capitolo {{ u.chapter }} · {{ u.contracts }}</li>
                }
              </ul>
            </mat-expansion-panel>
            <mat-expansion-panel [disabled]="data.invoice_lines_without_utility.count === 0">
              <mat-expansion-panel-header>
                <mat-panel-title>
                  <span class="anomaly-count" [class.zero]="data.invoice_lines_without_utility.count === 0">{{ data.invoice_lines_without_utility.count }}</span>
                  Righe fattura senza utenza
                </mat-panel-title>
              </mat-expansion-panel-header>
              <ul class="anomaly-list">
                @for (r of data.invoice_lines_without_utility.items; track $index) {
                  <li (click)="openInvoice(r.invoice_id)">{{ r.number }} · {{ r.supply_code || 'senza codice' }} · {{ r.amount.toFixed(2) }} €</li>
                }
              </ul>
            </mat-expansion-panel>
```

Metodo nel componente, accanto a `openUtility`:

```ts
  openInvoice(id: number): void {
    this.navigator.openInvoice(id).subscribe(saved => { if (saved) this.reload(); });
  }
```

(verificare i nomi reali `navigator`/`reload` usati da `openUtility` nello stesso file e allinearsi).

- [ ] **Step 2: Compile check and commit**

Run: `docker logs --since 60s utenzepa-frontend-1 2>&1 | grep -E "✘|generation"` → "generation complete".

```bash
git add frontend/src/app/pages/dashboard/anomalies-card.component.ts
git commit -m "feat(frontend): anomalie fatture e capitoli in dashboard"
```

---

### Task 11: Dati ACA (DB locale) e verifica E2E

**Files:**
- Create (fuori repo, non committare): `.audit-w/aca_fatture_carico.py`, output `.audit-w/aca_fatture_carico.sql`
- Modify: `docs/roadmap-patrimonio.md` (voci 6 e 17), `CLAUDE.md` (note sul modello), `publiccode.yml` (`softwareVersion: 1.10.0`, `releaseDate`)

- [ ] **Step 1: Backup locale prima dei dati**

Run: `docker exec utenzepa-mysql-1 sh -c 'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction mydatabase invoices invoice_lines budget_commitments > /tmp/pre_aca.sql' && docker exec utenzepa-mysql-1 ls -la /tmp/pre_aca.sql`
Expected: file presente.

- [ ] **Step 2: Script di generazione SQL**

Script Python (file reale, non heredoc: i testi possono contenere apostrofi), sullo schema di `.audit-w/aca_pulizia.py` (riusarne `norm`, `q`, `chapter_key`, la lettura di `acq.tsv`/`chap.tsv` — rigenerarli prima con le stesse query usate lì):

```python
# .audit-w/aca_fatture_carico.py — fatture ACA 2025-2026 → impegni + fatture + righe (DB locale, una tantum)
import json, os, re, csv
HERE = os.path.dirname(os.path.abspath(__file__))
inv = json.load(open(os.path.join(HERE, 'aca_fatture_2025_2026.json'), encoding='utf-8'))
norm = lambda s: re.sub(r'\s+', '', str(s)).lstrip('0').upper()
q = lambda v: 'NULL' if v is None else (str(v) if isinstance(v, (int, float)) else "'" + str(v).replace('\\', '\\\\').replace("'", "''") + "'")

rows = [r for r in csv.DictReader(open(os.path.join(HERE, 'acq.tsv'), encoding='utf-8'), delimiter='\t', quoting=csv.QUOTE_NONE) if r['deleted'] == '0']
util = {norm(r['code']): r for r in rows if r['code']}
util.update({norm(r['utility_id']): r for r in rows})
chap = {(r['chapter_code'], int(r['article'])): int(r['id'])
        for r in csv.DictReader(open(os.path.join(HERE, 'chap.tsv'), encoding='utf-8'), delimiter='\t', quoting=csv.QUOTE_NONE)}

def chapter_key(cap):
    code, _, art = str(cap).strip().partition('/')
    return code.split('.')[0], int(art or 0)

CONTRACT = 1          # contratto ACA (verificato: tutte le 490 utenze sono sul contratto 1)
USER = 1              # admin seed
out = ['START TRANSACTION;',
       f'SET @supplier = (SELECT supplier_id_fk FROM contracts WHERE id = {CONTRACT});']
commitments = set()
for v in inv.values():
    if v.get('cap') and v['date']:
        k = chapter_key(v['cap'])
        if k in chap:
            commitments.add((chap[k], int(v['date'][:4])))
for ch, year in sorted(commitments):
    out.append(f"INSERT INTO budget_commitments (contract_id_fk, budget_chapter_id_fk, fiscal_year, created_by_user_id, updated_by_user_id) "
               f"SELECT {CONTRACT}, {ch}, {year}, {USER}, {USER} FROM DUAL WHERE NOT EXISTS "
               f"(SELECT 1 FROM budget_commitments WHERE contract_id_fk = {CONTRACT} AND budget_chapter_id_fk = {ch} AND fiscal_year = {year} AND deleted = 0);")
skipped = 0
for key, v in inv.items():
    number = key.split('|')[0]
    u = util.get(norm(v['cs']))
    if not u:
        skipped += 1
        continue
    k = chapter_key(v['cap']) if v.get('cap') else None
    ch = chap.get(k) if k else None
    year = int(v['date'][:4])
    commitment = (f"(SELECT id FROM budget_commitments WHERE contract_id_fk = {CONTRACT} AND budget_chapter_id_fk = {ch} AND fiscal_year = {year} AND deleted = 0)"
                  if ch else 'NULL')
    # deduplica numero fattura + fornitore
    out.append(f"INSERT INTO invoices (invoice_id, invoice_date, total_amount, net_amount_excl_vat, contratto_id_fk, supplier_id_fk, created_by_user_id, updated_by_user_id) "
               f"SELECT {q(number)}, {q(v['date'])}, {v['tot']}, NULL, {CONTRACT}, @supplier, {USER}, {USER} FROM DUAL WHERE NOT EXISTS "
               f"(SELECT 1 FROM invoices WHERE invoice_id = {q(number)} AND supplier_id_fk <=> @supplier AND deleted = 0);")
    out.append(f"INSERT INTO invoice_lines (invoice_id_fk, amount, utility_id_fk, commitment_id_fk, supply_code) "
               f"SELECT i.id, {v['tot']}, {int(u['id'])}, {commitment}, {q(v['cs'])} FROM invoices i "
               f"WHERE i.invoice_id = {q(number)} AND i.supplier_id_fk <=> @supplier AND i.deleted = 0 "
               f"AND NOT EXISTS (SELECT 1 FROM invoice_lines l WHERE l.invoice_id_fk = i.id);")
# fornitore delle fatture esistenti dal contratto
out.append('UPDATE invoices i JOIN contracts c ON c.id = i.contratto_id_fk SET i.supplier_id_fk = c.supplier_id_fk, i.update_date = i.update_date WHERE i.supplier_id_fk IS NULL;')
out.append('COMMIT;')
open(os.path.join(HERE, 'aca_fatture_carico.sql'), 'w', encoding='utf-8').write('\n'.join(out) + '\n')
print('impegni', len(commitments), '| fatture', len(inv) - skipped, '| scartate (utenza non trovata)', skipped)
```

Run: `python .audit-w/aca_fatture_carico.py`
Expected: `impegni N | fatture 490 | scartate 0` (N = coppie capitolo × anno, ~12).

- [ ] **Step 3: Apply and verify**

Run: `docker exec -i utenzepa-mysql-1 sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" --default-character-set=utf8mb4 mydatabase' < .audit-w/aca_fatture_carico.sql`
Poi (password da `.env`):
`docker exec utenzepa-mysql-1 mysql -uroot -p"$PW" mydatabase -e "SELECT COUNT(*) FROM invoices WHERE deleted=0; SELECT COUNT(*), SUM(commitment_id_fk IS NULL), ROUND(SUM(amount),2) FROM invoice_lines; SELECT COUNT(*) FROM budget_commitments WHERE deleted=0; SELECT COUNT(*) FROM invoices WHERE deleted=0 AND supplier_id_fk IS NULL;"`
Expected: fatture 185 + 490 = 675; righe 490, 1 senza impegno, somma 253131.54; impegni = N; fatture senza fornitore = solo quelle senza contratto (1).

- [ ] **Step 4: E2E Playwright**

Utente temporaneo come da CLAUDE.md (hash bcrypt nel container, `INSERT INTO system_users …`, poi pulizia: riassegnare a `1` i `created_by/updated_by` toccati, `DELETE FROM audit_logs WHERE user_id=<id>`, `DELETE FROM system_users WHERE id=<id>`). Verificare:
1. `/contracts?selectedId=1` → tab "Impegni e capitoli": capitoli ACA con impegni 2025/2026 e speso; creare un impegno 2027 su un capitolo, modificarlo, eliminarlo (conferma). Provare a eliminare un impegno 2025 usato → toast "Impegno usato da N righe fattura".
2. `/invoices`: colonne Capitoli/Utenze/Totale documento; aprire una fattura ACA → scheda, tab Righe con 1 riga, totale righe = totale documento; Salva senza modifiche → nessun errore (Review Focus 1); DB: riga invariata, data invariata.
3. Fattura nuova con due righe (una con periodo 01/01/2026–28/02/2026), salvata due volte → `invoice_lines.period_start = '2026-01-01'` stabile; poi eliminarla.
4. Utenza di una fattura ACA (`/utilities?selectedId=<id>`) → tab Fatture con le righe e i totali per anno; select capitolo con i capitoli impegnati in cima (icona).
5. Immobile collegato a quell'utenza → riquadro "Spesa da fatture".
6. Dashboard: "Fatture su utenze cessate" ≥ 1 (8 righe ACA su utenze cessate, se nell'ultimo anno), "Righe fattura senza utenza" = 0, "Utenze con capitolo non impegnato" coerente.
7. Ruolo Lettore: tab Righe in sola lettura, nessun pulsante impegni.

- [ ] **Step 5: Docs and version**

- `docs/roadmap-patrimonio.md`: tabella "Ordine proposto", voci 6 e 17 → "fatto, v1.10.0 (fatture ACA 2025–2026 caricate sul DB locale, impegni da completare con numero e importo dalla ragioneria)"; sezioni 6 e 17 con una riga "Fatto in v1.10.0: spec `docs/superpowers/specs/2026-10-05-fatture-per-utenza-impegni-design.md`." e i residui emersi.
- `CLAUDE.md`, sezione Backend: una riga sul modello ("Fatture = testata + `invoice_lines` (righe per utenza, importi IVA inclusa, sostituite in blocco al salvataggio); capitolo dalla riga → impegno (`budget_commitments`: contratto + capitolo + esercizio); spesa calcolata in `apis/spending/`, mai salvata").
- `publiccode.yml`: `softwareVersion: "1.10.0"`, `releaseDate: "<data del merge>"`.

- [ ] **Step 6: Commit and PR**

```bash
git add docs/roadmap-patrimonio.md CLAUDE.md publiccode.yml docs/superpowers/plans/2026-10-05-fatture-per-utenza-impegni.md
git commit -m "docs: roadmap voci 6 e 17, CLAUDE.md e versione 1.10.0"
git push -u origin feat/fatture-per-utenza-impegni
gh pr create --title "feat: fatture per utenza e impegni di spesa (voci 6 e 17, v1.10.0)" --body "<riepilogo spec, verifica E2E, note di rilascio: dopo il deploy importare il DB locale (fatture ACA, impegni, fornitore delle fatture)>"
```

Attendere la CI (`gh pr checks <N> --watch`) e chiedere all'utente prima del merge e del tag.
