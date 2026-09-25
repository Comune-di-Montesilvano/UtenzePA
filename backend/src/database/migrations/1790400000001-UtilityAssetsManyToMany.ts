import { MigrationInterface, QueryRunner } from 'typeorm';

// Utenza collegata a N immobili: utilities.asset_id_fk -> utility_assets.
// La FK su asset_id_fk può mancare (DB con drift da SYNCHRONIZE), quindi
// viene cercata in information_schema invece che droppata per nome fisso.
// Righe con asset_id_fk orfano (immobile inesistente) non vengono copiate:
// violerebbero la FK di utility_assets.
export class UtilityAssetsManyToMany1790400000001 implements MigrationInterface {
  name = 'UtilityAssetsManyToMany1790400000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`utility_assets\` (\`utility_id\` int NOT NULL, \`asset_id\` int NOT NULL, INDEX \`IDX_6a78e3644e9b3a68f91f800383\` (\`utility_id\`), INDEX \`IDX_6b956a83b22d24a66fe634ab1c\` (\`asset_id\`), PRIMARY KEY (\`utility_id\`, \`asset_id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`utility_assets\` ADD CONSTRAINT \`FK_6a78e3644e9b3a68f91f800383c\` FOREIGN KEY (\`utility_id\`) REFERENCES \`utilities\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE \`utility_assets\` ADD CONSTRAINT \`FK_6b956a83b22d24a66fe634ab1ce\` FOREIGN KEY (\`asset_id\`) REFERENCES \`assets\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `INSERT INTO \`utility_assets\` (\`utility_id\`, \`asset_id\`) SELECT u.\`id\`, u.\`asset_id_fk\` FROM \`utilities\` u WHERE u.\`asset_id_fk\` IN (SELECT a.\`id\` FROM \`assets\` a)`,
    );

    const fks: { name: string }[] = await queryRunner.query(
      `SELECT CONSTRAINT_NAME AS name FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'utilities' AND COLUMN_NAME = 'asset_id_fk' AND REFERENCED_TABLE_NAME IS NOT NULL`,
    );
    for (const fk of fks) {
      await queryRunner.query(`ALTER TABLE \`utilities\` DROP FOREIGN KEY \`${fk.name}\``);
    }
    await queryRunner.query(`ALTER TABLE \`utilities\` DROP COLUMN \`asset_id_fk\``);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Lossy: un'utenza con più immobili torna al solo immobile con id
    // minore; resta nullable (utenze senza immobile non ripristinabili).
    await queryRunner.query(`ALTER TABLE \`utilities\` ADD \`asset_id_fk\` int NULL`);
    await queryRunner.query(
      `UPDATE \`utilities\` u JOIN (SELECT \`utility_id\`, MIN(\`asset_id\`) AS asset_id FROM \`utility_assets\` GROUP BY \`utility_id\`) x ON x.\`utility_id\` = u.\`id\` SET u.\`asset_id_fk\` = x.asset_id`,
    );
    await queryRunner.query(
      `ALTER TABLE \`utilities\` ADD CONSTRAINT \`FK_38725bd397adb97762016779410\` FOREIGN KEY (\`asset_id_fk\`) REFERENCES \`assets\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`utility_assets\` DROP FOREIGN KEY \`FK_6b956a83b22d24a66fe634ab1ce\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`utility_assets\` DROP FOREIGN KEY \`FK_6a78e3644e9b3a68f91f800383c\``,
    );
    await queryRunner.query(`DROP TABLE \`utility_assets\``);
  }
}
