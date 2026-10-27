import { MigrationInterface, QueryRunner } from 'typeorm';

// Note di credito della contabilità (note_credito.csv): abbinamenti nota →
// fattura. Gli stati del pagamento nuovi (stornata, compensata, da
// compensare) stanno nella colonna varchar esistente.
export class AccountingCreditNotes1796400000000 implements MigrationInterface {
  name = 'AccountingCreditNotes1796400000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      'CREATE TABLE `acc_credit_notes` (`id` int NOT NULL AUTO_INCREMENT, `link_key` varchar(60) NOT NULL, ' +
        '`fiscal_year` int NOT NULL, `amount` decimal(14,2) NOT NULL, `supplier_vat` varchar(16) NULL, ' +
        '`note_sdi_identifier` varchar(20) NULL, `note_number` varchar(50) NULL, `note_date` date NULL, ' +
        '`note_total` decimal(14,2) NULL, `invoice_sdi_identifier` varchar(20) NULL, ' +
        '`invoice_number` varchar(50) NULL, `invoice_date` date NULL, `invoice_total` decimal(14,2) NULL, ' +
        'INDEX `IDX_acc_credit_notes_note_sdi` (`note_sdi_identifier`), ' +
        'INDEX `IDX_acc_credit_notes_invoice_sdi` (`invoice_sdi_identifier`), PRIMARY KEY (`id`)) ENGINE=InnoDB',
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE `acc_credit_notes`');
  }
}
