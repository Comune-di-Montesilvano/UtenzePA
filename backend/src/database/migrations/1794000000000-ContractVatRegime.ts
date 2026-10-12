import { MigrationInterface, QueryRunner } from 'typeorm';

// Regime IVA del canone al posto di "Soggetto a IVA" (il canone è netto).
// Dati importati, tutti da rivedere: spuntati → IVA 22%, gli altri → da
// indicare (null), perché la casella non spuntata non diceva esente o fuori campo.
export class ContractVatRegime1794000000000 implements MigrationInterface {
  name = 'ContractVatRegime1794000000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      "ALTER TABLE `utilizer_grant` ADD `vat_regime` enum ('OUT_OF_SCOPE', 'EXEMPT', 'VAT_10', 'VAT_22') NULL AFTER `rent_period`",
    );
    await q.query("UPDATE `utilizer_grant` SET `vat_regime` = 'VAT_22' WHERE `vat_applicable` = 1");
    await q.query('ALTER TABLE `utilizer_grant` DROP COLUMN `vat_applicable`');
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(
      'ALTER TABLE `utilizer_grant` ADD `vat_applicable` tinyint NOT NULL DEFAULT 0 AFTER `rent_period`',
    );
    await q.query(
      "UPDATE `utilizer_grant` SET `vat_applicable` = 1 WHERE `vat_regime` IN ('VAT_10', 'VAT_22')",
    );
    await q.query('ALTER TABLE `utilizer_grant` DROP COLUMN `vat_regime`');
  }
}
