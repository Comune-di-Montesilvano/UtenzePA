import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAssetGeocodedColumns1788086730343 implements MigrationInterface {
    name = 'AddAssetGeocodedColumns1788086730343'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`assets\` ADD \`geocoded_latitude\` varchar(20) NULL`);
        await queryRunner.query(`ALTER TABLE \`assets\` ADD \`geocoded_longitude\` varchar(20) NULL`);
        await queryRunner.query(`ALTER TABLE \`assets\` ADD \`geocoded_at\` timestamp NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`assets\` DROP COLUMN \`geocoded_at\``);
        await queryRunner.query(`ALTER TABLE \`assets\` DROP COLUMN \`geocoded_longitude\``);
        await queryRunner.query(`ALTER TABLE \`assets\` DROP COLUMN \`geocoded_latitude\``);
    }

}
