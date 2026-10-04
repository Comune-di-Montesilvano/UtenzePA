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
