import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Rimuove da `utilities`/`invoices` le colonne contrattuali ormai spostate su
 * `Contract` (Task 1: creazione entità, Task 6: backfill dati — 639 contratti,
 * 639 associazioni, 184 fatture con `contratto_id_fk` risolto; Task 7:
 * `UtilitiesService` legge già questi campi dal join sul "contratto
 * corrente"). Nessun `CREATE TABLE`/drift di altre tabelle: verificato per
 * isolamento rigenerando `migration:generate` con le modifiche di questo task
 * temporaneamente rimosse (stash) — l'output risultante conteneva solo il
 * drift preesistente e documentato (indici/FK su system_users, purpose,
 * utilizer, utilizer_grant, invoice_budget_chapter, utility_type_purpose,
 * contracts/contract_utilities, più narrowing NOT NULL su utilities), zero
 * differenze imputabili a questo task. Ogni statement sotto è stato scritto a
 * mano trattenendo solo le colonne davvero rimosse in questo giro.
 *
 * Ogni DROP (FK e colonna) è condizionale via information_schema + SQL
 * dinamico (PREPARE/EXECUTE), non solo quello su
 * `FK_c253dcc8855e9edb534ef10d716` (utilities.consip_agreement_id, l'unica FK
 * risultata assente per drift preesistente su questo DB dev — vedi nota
 * storica nel task report). Motivo: le ALTER TABLE DDL di MySQL fanno commit
 * implicito, anche dentro la "transazione" con cui TypeORM avvolge la
 * migration — un run parziale (osservato qui: il container di sviluppo in
 * watch mode ha ricaricato l'app a metà esecuzione) lascia quindi lo schema
 * già modificato ma nessuna riga in `migrations`, e il retry automatico
 * ripartirebbe dal primo statement fallendo perché la FK/colonna è già
 * sparita. Ogni blocco sotto è quindi no-op se il target è già nello stato
 * finale, sia in un rerun dopo un fallimento parziale sia in un ambiente che
 * arriva da uno schema diverso.
 */
export class DropUtilityInvoiceContractColumns1788511000000 implements MigrationInterface {
  name = 'DropUtilityInvoiceContractColumns1788511000000';

  private async dropForeignKeyIfExists(
    queryRunner: QueryRunner,
    table: string,
    constraintName: string,
  ): Promise<void> {
    await queryRunner.query(
      `SET @fk_exists = (
        SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
        WHERE CONSTRAINT_SCHEMA = DATABASE()
          AND TABLE_NAME = '${table}'
          AND CONSTRAINT_NAME = '${constraintName}'
          AND CONSTRAINT_TYPE = 'FOREIGN KEY'
      )`,
    );
    await queryRunner.query(
      `SET @drop_fk_sql = IF(@fk_exists > 0, 'ALTER TABLE \`${table}\` DROP FOREIGN KEY \`${constraintName}\`', 'SELECT 1')`,
    );
    await queryRunner.query('PREPARE stmt FROM @drop_fk_sql');
    await queryRunner.query('EXECUTE stmt');
    await queryRunner.query('DEALLOCATE PREPARE stmt');
  }

  private async dropColumnIfExists(
    queryRunner: QueryRunner,
    table: string,
    column: string,
  ): Promise<void> {
    await queryRunner.query(
      `SET @col_exists = (
        SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = '${table}'
          AND COLUMN_NAME = '${column}'
      )`,
    );
    await queryRunner.query(
      `SET @drop_col_sql = IF(@col_exists > 0, 'ALTER TABLE \`${table}\` DROP COLUMN \`${column}\`', 'SELECT 1')`,
    );
    await queryRunner.query('PREPARE stmt FROM @drop_col_sql');
    await queryRunner.query('EXECUTE stmt');
    await queryRunner.query('DEALLOCATE PREPARE stmt');
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.dropForeignKeyIfExists(queryRunner, 'invoices', 'FK_98dbfe5bcca4d0b27fc699be892');
    await this.dropForeignKeyIfExists(queryRunner, 'invoices', 'FK_a73380d59b8490982f145c9d8fe');
    await this.dropForeignKeyIfExists(queryRunner, 'utilities', 'FK_8b0d8040435b79d5bd3a32c9801');
    await this.dropForeignKeyIfExists(queryRunner, 'utilities', 'FK_c253dcc8855e9edb534ef10d716');

    await this.dropColumnIfExists(queryRunner, 'invoices', 'supplier_id_fk');
    await this.dropColumnIfExists(queryRunner, 'invoices', 'utility_id_fk');
    await this.dropColumnIfExists(queryRunner, 'utilities', 'cig_contract');
    await this.dropColumnIfExists(queryRunner, 'utilities', 'consip_agreement_id');
    await this.dropColumnIfExists(queryRunner, 'utilities', 'consip_order');
    await this.dropColumnIfExists(queryRunner, 'utilities', 'management_expiry_date');
    await this.dropColumnIfExists(queryRunner, 'utilities', 'order_number');
    await this.dropColumnIfExists(queryRunner, 'utilities', 'security_deposit');
    await this.dropColumnIfExists(queryRunner, 'utilities', 'supplier_id_fk');
    await this.dropColumnIfExists(queryRunner, 'utilities', 'supply_expiry_date');
    await this.dropColumnIfExists(queryRunner, 'utilities', 'supply_start_date');
    await this.dropColumnIfExists(queryRunner, 'utilities', 'takeover_termination_date');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE `utilities` ADD `takeover_termination_date` date NULL');
    await queryRunner.query('ALTER TABLE `utilities` ADD `supply_start_date` date NULL');
    await queryRunner.query('ALTER TABLE `utilities` ADD `supply_expiry_date` date NULL');
    await queryRunner.query('ALTER TABLE `utilities` ADD `supplier_id_fk` int NULL');
    await queryRunner.query(
      "ALTER TABLE `utilities` ADD `security_deposit` decimal(10,2) NOT NULL DEFAULT '0.00'",
    );
    await queryRunner.query('ALTER TABLE `utilities` ADD `order_number` text NULL');
    await queryRunner.query('ALTER TABLE `utilities` ADD `management_expiry_date` date NULL');
    await queryRunner.query('ALTER TABLE `utilities` ADD `consip_order` varchar(100) NULL');
    await queryRunner.query('ALTER TABLE `utilities` ADD `consip_agreement_id` int NULL');
    await queryRunner.query('ALTER TABLE `utilities` ADD `cig_contract` text NULL');
    await queryRunner.query('ALTER TABLE `invoices` ADD `utility_id_fk` int NULL');
    await queryRunner.query('ALTER TABLE `invoices` ADD `supplier_id_fk` int NULL');

    await queryRunner.query(
      'ALTER TABLE `utilities` ADD UNIQUE INDEX `REL_c253dcc8855e9edb534ef10d71` (`consip_agreement_id`)',
    );
    await queryRunner.query(
      'ALTER TABLE `utilities` ADD CONSTRAINT `FK_c253dcc8855e9edb534ef10d716` FOREIGN KEY (`consip_agreement_id`) REFERENCES `consip_agreement`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE `utilities` ADD CONSTRAINT `FK_8b0d8040435b79d5bd3a32c9801` FOREIGN KEY (`supplier_id_fk`) REFERENCES `suppliers`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE `invoices` ADD CONSTRAINT `FK_a73380d59b8490982f145c9d8fe` FOREIGN KEY (`supplier_id_fk`) REFERENCES `suppliers`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE `invoices` ADD CONSTRAINT `FK_98dbfe5bcca4d0b27fc699be892` FOREIGN KEY (`utility_id_fk`) REFERENCES `utilities`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION',
    );
  }
}
