import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLastLoginToSystemUsers1789987942078 implements MigrationInterface {
  name = 'AddLastLoginToSystemUsers1789987942078';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`system_users\` ADD \`last_login\` timestamp NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`system_users\` DROP COLUMN \`last_login\``);
  }
}
