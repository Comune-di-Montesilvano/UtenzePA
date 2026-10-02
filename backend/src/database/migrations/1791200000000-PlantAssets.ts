import { MigrationInterface, QueryRunner } from 'typeorm';

// Impianto ↔ immobili molti-a-molti (plant_assets) al posto dell'immobile
// contenitore unico (plants.asset_id_fk): es. una centrale termica che serve
// più edifici. Il collegamento esistente viene copiato nella tabella ponte.
// Nomi vincoli = default TypeORM (DefaultNamingStrategy).
export class PlantAssets1791200000000 implements MigrationInterface {
  name = 'PlantAssets1791200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`plant_assets\` (\`plant_id\` int NOT NULL, \`asset_id\` int NOT NULL, INDEX \`IDX_7a92bd8894d7b894163a19ac63\` (\`plant_id\`), INDEX \`IDX_3243de449ddbe121a092299fba\` (\`asset_id\`), PRIMARY KEY (\`plant_id\`, \`asset_id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`plant_assets\` ADD CONSTRAINT \`FK_7a92bd8894d7b894163a19ac634\` FOREIGN KEY (\`plant_id\`) REFERENCES \`plants\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE \`plant_assets\` ADD CONSTRAINT \`FK_3243de449ddbe121a092299fbaa\` FOREIGN KEY (\`asset_id\`) REFERENCES \`assets\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `INSERT INTO \`plant_assets\` (\`plant_id\`, \`asset_id\`) SELECT \`id\`, \`asset_id_fk\` FROM \`plants\` WHERE \`asset_id_fk\` IS NOT NULL`,
    );
    await queryRunner.query(`ALTER TABLE \`plants\` DROP FOREIGN KEY \`FK_277174dffd55273b0b17207d9bf\``);
    await queryRunner.query(`DROP INDEX \`IDX_172755cf0a27e671fea1c7d00d\` ON \`plants\``);
    await queryRunner.query(`ALTER TABLE \`plants\` DROP COLUMN \`asset_id_fk\``);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`plants\` ADD \`asset_id_fk\` int NULL`);
    // Di più immobili collegati si conserva il primo.
    await queryRunner.query(
      `UPDATE \`plants\` p SET p.\`asset_id_fk\` = (SELECT MIN(pa.\`asset_id\`) FROM \`plant_assets\` pa WHERE pa.\`plant_id\` = p.\`id\`)`,
    );
    await queryRunner.query(
      `CREATE INDEX \`IDX_172755cf0a27e671fea1c7d00d\` ON \`plants\` (\`asset_id_fk\`, \`deleted\`)`,
    );
    await queryRunner.query(
      `ALTER TABLE \`plants\` ADD CONSTRAINT \`FK_277174dffd55273b0b17207d9bf\` FOREIGN KEY (\`asset_id_fk\`) REFERENCES \`assets\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(`ALTER TABLE \`plant_assets\` DROP FOREIGN KEY \`FK_3243de449ddbe121a092299fbaa\``);
    await queryRunner.query(`ALTER TABLE \`plant_assets\` DROP FOREIGN KEY \`FK_7a92bd8894d7b894163a19ac634\``);
    await queryRunner.query(`DROP INDEX \`IDX_3243de449ddbe121a092299fba\` ON \`plant_assets\``);
    await queryRunner.query(`DROP INDEX \`IDX_7a92bd8894d7b894163a19ac63\` ON \`plant_assets\``);
    await queryRunner.query(`DROP TABLE \`plant_assets\``);
  }
}
