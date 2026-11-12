import { MigrationInterface, QueryRunner } from 'typeorm';

// Fabbisogno della convenzione CONSIP: cache per capitolo ed esercizio
// (letta dalle segnalazioni) e costo unitario inserito a mano per tipo di
// utenza (apis/agreement-forecast/).
export class AgreementForecast1796700000000 implements MigrationInterface {
  name = 'AgreementForecast1796700000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      'CREATE TABLE `consip_agreement_forecasts` (`id` int NOT NULL AUTO_INCREMENT, `consip_agreement_id_fk` int NOT NULL, `budget_chapter_id_fk` int NULL, `fiscal_year` int NOT NULL, `utilities` int NOT NULL, `invoiced` decimal(14,2) NOT NULL, `to_invoice` decimal(14,2) NOT NULL, `committed` decimal(14,2) NOT NULL, `remaining` decimal(14,2) NOT NULL, `difference` decimal(14,2) NOT NULL, `coverage` decimal(5,4) NOT NULL, `shortfall` decimal(14,2) NULL, `alert` varchar(20) NULL, `computed_at` timestamp NOT NULL, INDEX `IDX_agreement_forecasts_agreement_year` (`consip_agreement_id_fk`, `fiscal_year`), PRIMARY KEY (`id`)) ENGINE=InnoDB',
    );
    await q.query(
      'CREATE TABLE `consip_agreement_prices` (`id` int NOT NULL AUTO_INCREMENT, `consip_agreement_id_fk` int NOT NULL, `hard_type` varchar(30) NOT NULL, `unit_price` decimal(12,6) NOT NULL, `updated_by_user_id` int NULL, `update_date` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), UNIQUE INDEX `UQ_agreement_prices_agreement_type` (`consip_agreement_id_fk`, `hard_type`), PRIMARY KEY (`id`)) ENGINE=InnoDB',
    );
    await q.query(
      'ALTER TABLE `consip_agreement_forecasts` ADD CONSTRAINT `FK_agreement_forecasts_agreement` FOREIGN KEY (`consip_agreement_id_fk`) REFERENCES `consip_agreement`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION',
    );
    await q.query(
      'ALTER TABLE `consip_agreement_forecasts` ADD CONSTRAINT `FK_agreement_forecasts_chapter` FOREIGN KEY (`budget_chapter_id_fk`) REFERENCES `budget_chapters`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION',
    );
    await q.query(
      'ALTER TABLE `consip_agreement_prices` ADD CONSTRAINT `FK_agreement_prices_agreement` FOREIGN KEY (`consip_agreement_id_fk`) REFERENCES `consip_agreement`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION',
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE `consip_agreement_prices`');
    await q.query('DROP TABLE `consip_agreement_forecasts`');
  }
}
