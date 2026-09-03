import { MigrationInterface, QueryRunner } from "typeorm";

export class CreatePhotos1788429129353 implements MigrationInterface {
    name = 'CreatePhotos1788429129353'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE \`photos\` (\`id\` int NOT NULL AUTO_INCREMENT, \`entity_type\` enum ('asset', 'utility') NOT NULL, \`entity_id\` int NOT NULL, \`file_path\` varchar(500) NOT NULL, \`mime_type\` varchar(50) NOT NULL, \`original_filename\` varchar(255) NULL, \`file_size\` int NOT NULL, \`create_date\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`update_date\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`created_by_user_id\` int NOT NULL, \`updated_by_user_id\` int NOT NULL, \`deleted\` tinyint NOT NULL DEFAULT 0, INDEX \`IDX_ada62c3473116cc07860eb5fa6\` (\`entity_type\`, \`entity_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX \`IDX_ada62c3473116cc07860eb5fa6\` ON \`photos\``);
        await queryRunner.query(`DROP TABLE \`photos\``);
    }

}
