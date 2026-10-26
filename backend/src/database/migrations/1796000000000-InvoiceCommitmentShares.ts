import { MigrationInterface, QueryRunner } from 'typeorm';

// Quote impegno della fattura (v1.49.0): l'impegno non si assegna più per riga
// ma per fattura, in invoice_commitment_shares (impegno + annualità + importo).
// Le assegnazioni esistenti sulle righe diventano una quota per fattura; le
// colonne delle righe restano finché non le toglie la migration successiva.
export class InvoiceCommitmentShares1796000000000 implements MigrationInterface {
  name = 'InvoiceCommitmentShares1796000000000';

  public async up(q: QueryRunner): Promise<void> {
    // Controllo prima di ogni DDL: una quota sola per fattura, quindi righe su
    // una sola coppia impegno + annualità e tutte automatiche o tutte a mano.
    const conflicts: Array<{ invoice_id_fk: number }> = await q.query(
      'SELECT `invoice_id_fk` FROM `invoice_lines` WHERE `commitment_id_fk` IS NOT NULL ' +
        'GROUP BY `invoice_id_fk` HAVING COUNT(DISTINCT `commitment_id_fk`, IFNULL(`commitment_fiscal_year`, 0)) > 1 ' +
        'OR MIN(`commitment_auto`) <> MAX(`commitment_auto`) OR SUM(`commitment_fiscal_year` IS NULL) > 0',
    );
    if (conflicts.length > 0) {
      throw new Error(
        'Fatture con righe su più impegni o annualità, miste automatiche/manuali o senza annualità: ' +
          conflicts.map((c) => c.invoice_id_fk).join(', ') +
          '. Sistemarle prima di aggiornare.',
      );
    }
    await q.query(
      'CREATE TABLE `invoice_commitment_shares` (`id` int NOT NULL AUTO_INCREMENT, `invoice_id_fk` int NOT NULL, ' +
        '`commitment_id_fk` int NOT NULL, `fiscal_year` int NOT NULL, `amount` decimal(12,2) NOT NULL, ' +
        "`source` varchar(20) NOT NULL DEFAULT 'AUTO', " +
        'INDEX `IDX_invoice_commitment_shares_commitment` (`commitment_id_fk`, `fiscal_year`), ' +
        'INDEX `IDX_invoice_commitment_shares_invoice` (`invoice_id_fk`), PRIMARY KEY (`id`)) ENGINE=InnoDB',
    );
    await q.query(
      'ALTER TABLE `invoice_commitment_shares` ADD CONSTRAINT `FK_invoice_commitment_shares_invoice` ' +
        'FOREIGN KEY (`invoice_id_fk`) REFERENCES `invoices`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION',
    );
    await q.query(
      'ALTER TABLE `invoice_commitment_shares` ADD CONSTRAINT `FK_invoice_commitment_shares_commitment` ' +
        'FOREIGN KEY (`commitment_id_fk`) REFERENCES `budget_commitments`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION',
    );
    await q.query(
      'INSERT INTO `invoice_commitment_shares` (`invoice_id_fk`, `commitment_id_fk`, `fiscal_year`, `source`, `amount`) ' +
        "SELECT `invoice_id_fk`, `commitment_id_fk`, `commitment_fiscal_year`, IF(MIN(`commitment_auto`) = 0, 'MANUAL', 'AUTO'), SUM(`amount`) " +
        'FROM `invoice_lines` WHERE `commitment_id_fk` IS NOT NULL ' +
        'GROUP BY `invoice_id_fk`, `commitment_id_fk`, `commitment_fiscal_year`',
    );
  }

  // Le colonne delle righe sono ancora al loro posto: basta togliere la tabella.
  public async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE `invoice_commitment_shares`');
  }
}
