import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLdapAuthToSystemUsers1789985476919 implements MigrationInterface {
  name = 'AddLdapAuthToSystemUsers1789985476919';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`system_users\` ADD \`auth_provider\` enum ('local', 'ldap') NOT NULL DEFAULT 'local'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`system_users\` CHANGE \`password_hash\` \`password_hash\` varchar(255) NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`system_users\` CHANGE \`password_hash\` \`password_hash\` varchar(255) NOT NULL`,
    );
    await queryRunner.query(`ALTER TABLE \`system_users\` DROP COLUMN \`auth_provider\``);
  }
}
