import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateAuditLogs1789669222047 implements MigrationInterface {
    name = 'CreateAuditLogs1789669222047'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE \`audit_logs\` (\`id\` int NOT NULL AUTO_INCREMENT, \`entity_name\` varchar(100) NOT NULL, \`entity_id\` int NOT NULL, \`action\` enum ('CREATE', 'UPDATE', 'DELETE') NOT NULL, \`field_name\` varchar(100) NULL, \`old_value\` text NULL, \`new_value\` text NULL, \`old_label\` text NULL, \`new_label\` text NULL, \`user_id\` int NOT NULL, \`created_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX \`IDX_entity_name_user_id\` (\`entity_name\`, \`user_id\`), INDEX \`IDX_entity_name_entity_id\` (\`entity_name\`, \`entity_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`ALTER TABLE \`audit_logs\` ADD CONSTRAINT \`FK_audit_logs_user_id\` FOREIGN KEY (\`user_id\`) REFERENCES \`system_users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`audit_logs\` DROP FOREIGN KEY \`FK_audit_logs_user_id\``);
        await queryRunner.query(`DROP TABLE \`audit_logs\``);
    }

}
