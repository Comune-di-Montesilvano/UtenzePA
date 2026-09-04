import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `contracts.consip_agreement_id` è passato da relazione OneToOne a ManyToOne
 * (`ConsipAgreement` in `contract.entity.ts`): più contratti possono condividere
 * la stessa convenzione CONSIP quadro (come già accadeva per più utenze, prima
 * di questa feature). L'indice UNIQUE generato dalla precedente OneToOne
 * (`REL_4a9b1d7a38f0ff6ce4eb247824`, da `1788504891423-CreateContract.ts`)
 * blocca l'INSERT del backfill dati (Task 6) sui casi reali con
 * `consip_agreement_id` condiviso (es. valore 52, condiviso da 125 utility).
 *
 * MySQL/InnoDB non permette di eliminare l'unico indice che soddisfa il
 * vincolo FK (`FK_4a9b1d7a38f0ff6ce4eb2478242`, invariato) su quella colonna
 * senza prima crearne uno sostitutivo non-unique — da qui i due passi
 * (CREATE poi DROP), verificato manualmente sul DB dev (altrimenti
 * `ERROR 1553: Cannot drop index ... needed in a foreign key constraint`).
 */
export class RelaxContractConsipAgreementUnique1788507511926 implements MigrationInterface {
  name = 'RelaxContractConsipAgreementUnique1788507511926';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE INDEX `IDX_4a9b1d7a38f0ff6ce4eb247824` ON `contracts` (`consip_agreement_id`)',
    );
    await queryRunner.query('DROP INDEX `REL_4a9b1d7a38f0ff6ce4eb247824` ON `contracts`');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE UNIQUE INDEX `REL_4a9b1d7a38f0ff6ce4eb247824` ON `contracts` (`consip_agreement_id`)',
    );
    await queryRunner.query('DROP INDEX `IDX_4a9b1d7a38f0ff6ce4eb247824` ON `contracts`');
  }
}
