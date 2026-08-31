import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateAppSettings1788174100033 implements MigrationInterface {
    name = 'CreateAppSettings1788174100033'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE \`app_settings\` (\`id\` int NOT NULL DEFAULT '1', \`entity_name\` varchar(255) NOT NULL DEFAULT 'Comune di Montesilvano', \`entity_type\` varchar(100) NOT NULL DEFAULT 'Comune', \`default_latitude\` varchar(20) NOT NULL DEFAULT '42.5083', \`default_longitude\` varchar(20) NOT NULL DEFAULT '14.15', \`logo\` longtext NULL, \`logo_mime\` varchar(50) NULL, \`favicon\` longtext NULL, \`favicon_mime\` varchar(50) NULL, \`update_date\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`updated_by_user_id\` int NULL, PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(
            `INSERT INTO \`app_settings\` (\`id\`, \`entity_name\`, \`entity_type\`, \`default_latitude\`, \`default_longitude\`) VALUES (1, 'Comune di Montesilvano', 'Comune', '42.5083', '14.15')`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE \`app_settings\``);
    }

}
