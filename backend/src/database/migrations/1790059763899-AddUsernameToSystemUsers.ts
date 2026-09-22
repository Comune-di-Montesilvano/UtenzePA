import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUsernameToSystemUsers1790059763899 implements MigrationInterface {
  name = 'AddUsernameToSystemUsers1790059763899';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`system_users\` ADD \`username\` varchar(255) NULL`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX \`UK_username\` ON \`system_users\` (\`username\`)`,
    );
    await queryRunner.query(
      `ALTER TABLE \`system_users\` CHANGE \`email\` \`email\` varchar(255) NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`system_users\` CHANGE \`email\` \`email\` varchar(255) NOT NULL`,
    );
    await queryRunner.query(`DROP INDEX \`UK_username\` ON \`system_users\``);
    await queryRunner.query(`ALTER TABLE \`system_users\` DROP COLUMN \`username\``);
  }
}
