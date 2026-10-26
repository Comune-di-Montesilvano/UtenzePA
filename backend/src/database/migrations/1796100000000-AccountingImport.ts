import { MigrationInterface, QueryRunner } from 'typeorm';

// Import contabilità (fase 3): tabelle di appoggio del formato neutro
// (acc_chapters, acc_commitments, acc_liquidations), stato dell'import
// (interruttore, anno di partenza, ultimo giro) e origine del dato (source:
// MANUAL | ACCOUNTING) su capitoli, spesa per anno, impegni, annualità e
// fatture. Le righe esistenti restano MANUAL.
const SOURCE_TABLES = [
  'budget_chapters',
  'budget_chapter_spending',
  'budget_commitments',
  'budget_commitment_years',
  'invoices',
];

export class AccountingImport1796100000000 implements MigrationInterface {
  name = 'AccountingImport1796100000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      'CREATE TABLE `acc_chapters` (`id` int NOT NULL AUTO_INCREMENT, `year` int NOT NULL, ' +
        '`chapter` varchar(50) NOT NULL, `article` int NOT NULL, `description` varchar(255) NULL, ' +
        '`initial_budget` decimal(14,2) NULL, `adjusted_budget` decimal(14,2) NULL, `spent` decimal(14,2) NULL, ' +
        'INDEX `IDX_acc_chapters_key` (`chapter`, `article`, `year`), PRIMARY KEY (`id`)) ENGINE=InnoDB',
    );
    await q.query(
      'CREATE TABLE `acc_commitments` (`id` int NOT NULL AUTO_INCREMENT, `commitment_year` int NOT NULL, ' +
        '`commitment_num` int NOT NULL, `commitment_sub` int NOT NULL, `fiscal_year` int NOT NULL, ' +
        '`chapter` varchar(50) NOT NULL, `article` int NOT NULL, `supplier_vat` varchar(16) NULL, ' +
        '`amount` decimal(14,2) NOT NULL, `cig` varchar(20) NULL, `cancelled` tinyint NOT NULL DEFAULT 0, ' +
        '`description` varchar(255) NULL, ' +
        'INDEX `IDX_acc_commitments_number` (`commitment_year`, `commitment_num`, `commitment_sub`), ' +
        'PRIMARY KEY (`id`)) ENGINE=InnoDB',
    );
    await q.query(
      'CREATE TABLE `acc_liquidations` (`id` int NOT NULL AUTO_INCREMENT, `liquidation_key` varchar(50) NOT NULL, ' +
        '`commitment_year` int NOT NULL, `commitment_num` int NOT NULL, `commitment_sub` int NOT NULL, ' +
        '`fiscal_year` int NOT NULL, `sdi_identifier` varchar(20) NULL, `invoice_number` varchar(50) NULL, ' +
        '`invoice_date` date NULL, `invoice_total` decimal(14,2) NULL, `invoice_cig` varchar(20) NULL, ' +
        '`supplier_vat` varchar(16) NULL, `amount` decimal(14,2) NOT NULL, `cancelled` tinyint NOT NULL DEFAULT 0, ' +
        'INDEX `IDX_acc_liquidations_invoice` (`supplier_vat`, `invoice_date`), ' +
        'INDEX `IDX_acc_liquidations_sdi` (`sdi_identifier`), PRIMARY KEY (`id`)) ENGINE=InnoDB',
    );
    await q.query(
      "CREATE TABLE `accounting_import_state` (`id` int NOT NULL DEFAULT '1', `enabled` tinyint NOT NULL DEFAULT 0, " +
        '`from_year` int NULL, `last_run_at` datetime NULL, `last_summary` json NULL, ' +
        '`last_error` varchar(500) NULL, PRIMARY KEY (`id`)) ENGINE=InnoDB',
    );
    for (const table of SOURCE_TABLES) {
      await q.query(
        `ALTER TABLE \`${table}\` ADD \`source\` varchar(20) NOT NULL DEFAULT 'MANUAL'`,
      );
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    for (const table of [...SOURCE_TABLES].reverse()) {
      await q.query(`ALTER TABLE \`${table}\` DROP COLUMN \`source\``);
    }
    await q.query('DROP TABLE `accounting_import_state`');
    await q.query('DROP TABLE `acc_liquidations`');
    await q.query('DROP TABLE `acc_commitments`');
    await q.query('DROP TABLE `acc_chapters`');
  }
}
