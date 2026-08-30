import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAssetGeocodedColumns1788086730343 implements MigrationInterface {
    name = 'AddAssetGeocodedColumns1788086730343'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`invoice_budget_chapter\` DROP FOREIGN KEY \`FK_891310b3d845fe3f7d00346e65b\``);
        await queryRunner.query(`ALTER TABLE \`invoice_budget_chapter\` DROP FOREIGN KEY \`FK_9cffdf1bcf101d43271ac87c53d\``);
        await queryRunner.query(`ALTER TABLE \`utility_type_purpose\` DROP FOREIGN KEY \`FK_1e8787cfd9a351ca1bc81f882e9\``);
        await queryRunner.query(`ALTER TABLE \`utility_type_purpose\` DROP FOREIGN KEY \`FK_ef80be3fc01d5e693454b854ce3\``);
        await queryRunner.query(`DROP INDEX \`IDX_891310b3d845fe3f7d00346e65\` ON \`invoice_budget_chapter\``);
        await queryRunner.query(`DROP INDEX \`IDX_9cffdf1bcf101d43271ac87c53\` ON \`invoice_budget_chapter\``);
        await queryRunner.query(`DROP INDEX \`IDX_1e8787cfd9a351ca1bc81f882e\` ON \`utility_type_purpose\``);
        await queryRunner.query(`DROP INDEX \`IDX_ef80be3fc01d5e693454b854ce\` ON \`utility_type_purpose\``);
        await queryRunner.query(`ALTER TABLE \`assets\` ADD \`geocoded_latitude\` varchar(20) NULL`);
        await queryRunner.query(`ALTER TABLE \`assets\` ADD \`geocoded_longitude\` varchar(20) NULL`);
        await queryRunner.query(`ALTER TABLE \`assets\` ADD \`geocoded_at\` timestamp NULL`);
        await queryRunner.query(`CREATE INDEX \`IDX_891310b3d845fe3f7d00346e65\` ON \`invoice_budget_chapter\` (\`invoice_id\`)`);
        await queryRunner.query(`CREATE INDEX \`IDX_9cffdf1bcf101d43271ac87c53\` ON \`invoice_budget_chapter\` (\`budget_chapter_id\`)`);
        await queryRunner.query(`CREATE INDEX \`IDX_ef80be3fc01d5e693454b854ce\` ON \`utility_type_purpose\` (\`utility_type_id\`)`);
        await queryRunner.query(`CREATE INDEX \`IDX_1e8787cfd9a351ca1bc81f882e\` ON \`utility_type_purpose\` (\`purpose_id\`)`);
        await queryRunner.query(`ALTER TABLE \`invoice_budget_chapter\` ADD CONSTRAINT \`FK_891310b3d845fe3f7d00346e65b\` FOREIGN KEY (\`invoice_id\`) REFERENCES \`invoices\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`invoice_budget_chapter\` ADD CONSTRAINT \`FK_9cffdf1bcf101d43271ac87c53d\` FOREIGN KEY (\`budget_chapter_id\`) REFERENCES \`budget_chapters\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`utility_type_purpose\` ADD CONSTRAINT \`FK_ef80be3fc01d5e693454b854ce3\` FOREIGN KEY (\`utility_type_id\`) REFERENCES \`utility_types\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`utility_type_purpose\` ADD CONSTRAINT \`FK_1e8787cfd9a351ca1bc81f882e9\` FOREIGN KEY (\`purpose_id\`) REFERENCES \`purpose\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`utility_type_purpose\` DROP FOREIGN KEY \`FK_1e8787cfd9a351ca1bc81f882e9\``);
        await queryRunner.query(`ALTER TABLE \`utility_type_purpose\` DROP FOREIGN KEY \`FK_ef80be3fc01d5e693454b854ce3\``);
        await queryRunner.query(`ALTER TABLE \`invoice_budget_chapter\` DROP FOREIGN KEY \`FK_9cffdf1bcf101d43271ac87c53d\``);
        await queryRunner.query(`ALTER TABLE \`invoice_budget_chapter\` DROP FOREIGN KEY \`FK_891310b3d845fe3f7d00346e65b\``);
        await queryRunner.query(`DROP INDEX \`IDX_1e8787cfd9a351ca1bc81f882e\` ON \`utility_type_purpose\``);
        await queryRunner.query(`DROP INDEX \`IDX_ef80be3fc01d5e693454b854ce\` ON \`utility_type_purpose\``);
        await queryRunner.query(`DROP INDEX \`IDX_9cffdf1bcf101d43271ac87c53\` ON \`invoice_budget_chapter\``);
        await queryRunner.query(`DROP INDEX \`IDX_891310b3d845fe3f7d00346e65\` ON \`invoice_budget_chapter\``);
        await queryRunner.query(`ALTER TABLE \`assets\` DROP COLUMN \`geocoded_at\``);
        await queryRunner.query(`ALTER TABLE \`assets\` DROP COLUMN \`geocoded_longitude\``);
        await queryRunner.query(`ALTER TABLE \`assets\` DROP COLUMN \`geocoded_latitude\``);
        await queryRunner.query(`CREATE INDEX \`IDX_ef80be3fc01d5e693454b854ce\` ON \`utility_type_purpose\` (\`utility_type_id\`)`);
        await queryRunner.query(`CREATE INDEX \`IDX_1e8787cfd9a351ca1bc81f882e\` ON \`utility_type_purpose\` (\`purpose_id\`)`);
        await queryRunner.query(`CREATE INDEX \`IDX_9cffdf1bcf101d43271ac87c53\` ON \`invoice_budget_chapter\` (\`budget_chapter_id\`)`);
        await queryRunner.query(`CREATE INDEX \`IDX_891310b3d845fe3f7d00346e65\` ON \`invoice_budget_chapter\` (\`invoice_id\`)`);
        await queryRunner.query(`ALTER TABLE \`utility_type_purpose\` ADD CONSTRAINT \`FK_ef80be3fc01d5e693454b854ce3\` FOREIGN KEY (\`utility_type_id\`) REFERENCES \`utility_types\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`utility_type_purpose\` ADD CONSTRAINT \`FK_1e8787cfd9a351ca1bc81f882e9\` FOREIGN KEY (\`purpose_id\`) REFERENCES \`purpose\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`invoice_budget_chapter\` ADD CONSTRAINT \`FK_9cffdf1bcf101d43271ac87c53d\` FOREIGN KEY (\`budget_chapter_id\`) REFERENCES \`budget_chapters\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`invoice_budget_chapter\` ADD CONSTRAINT \`FK_891310b3d845fe3f7d00346e65b\` FOREIGN KEY (\`invoice_id\`) REFERENCES \`invoices\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

}
