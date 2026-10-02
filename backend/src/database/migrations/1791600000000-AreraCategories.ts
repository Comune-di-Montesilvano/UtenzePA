import { MigrationInterface, QueryRunner } from 'typeorm';

// Tipologia contrattuale ARERA sull'utenza (al posto delle finalità d'uso,
// che non erano mai collegate alle utenze) e disalimentabilità da testo
// libero a sì/no/non noto. Elenco codici scritto qui: la migration non deve
// cambiare se in futuro cambia l'enum applicativo.
const ARERA_CODES = [
  'EL_BT_DOMESTIC',
  'EL_BT_PUBLIC_LIGHTING',
  'EL_BT_OTHER',
  'EL_BT_EV_CHARGING',
  'EL_MT_PUBLIC_LIGHTING',
  'EL_MT_OTHER',
  'WATER_DOMESTIC_RESIDENT',
  'WATER_DOMESTIC_NON_RESIDENT',
  'WATER_DOMESTIC_CONDOMINIUM',
  'WATER_INDUSTRIAL',
  'WATER_COMMERCIAL',
  'WATER_AGRICULTURAL',
  'WATER_PUBLIC_NON_DISCONNECTABLE',
  'WATER_PUBLIC_DISCONNECTABLE',
  'WATER_OTHER',
  'GAS_DOMESTIC',
  'GAS_CONDOMINIUM_DOMESTIC',
  'GAS_PUBLIC_SERVICE',
  'GAS_OTHER',
];

// Testo (minuscolo, ripulito) → valore; `note` = il testo dice più del sì/no
// e va conservato nelle note dell'utenza.
const CONVERSION: { text: string; value: 0 | 1; note: 0 | 1 }[] = [
  { text: 'disalimentabile per e-distribuzione', value: 1, note: 1 },
  { text: 'non disalimentabile per e-distribuzione', value: 0, note: 1 },
  { text: 'non disalimentabile', value: 0, note: 0 },
  { text: 'uso pubblico disalim afd', value: 1, note: 1 },
  // Testo scritto da down(): rende ripetibile il ciclo up → down → up.
  { text: 'disalimentabile', value: 1, note: 0 },
];

export class AreraCategories1791600000000 implements MigrationInterface {
  name = 'AreraCategories1791600000000';

  public async up(q: QueryRunner): Promise<void> {
    // Le DDL MySQL fanno commit implicito: un valore non previsto si scopre
    // prima di toccare lo schema, altrimenti resterebbe a metà.
    const found: { v: string }[] = await q.query(
      `-- preflight: disalimentabilità
       SELECT DISTINCT TRIM(\`disconnection_ability\`) AS v FROM \`utilities\`
        WHERE TRIM(IFNULL(\`disconnection_ability\`, '')) <> ''`,
    );
    const known = new Set(CONVERSION.map((c) => c.text));
    const unknown = found.map((r) => r.v).filter((v) => !known.has(v.toLowerCase()));
    if (unknown.length > 0) {
      throw new Error(
        `Disalimentabilità con valori non previsti, da correggere prima della migration: ${unknown.join('; ')}`,
      );
    }

    const enumList = ARERA_CODES.map((c) => `'${c}'`).join(', ');
    await q.query(`ALTER TABLE \`utilities\` ADD \`arera_category\` enum (${enumList}) NULL`);
    await q.query(`ALTER TABLE \`utilities\` ADD \`disconnectable\` tinyint(1) NULL`);

    // update_date = update_date: scrittura di sistema, "Ultima modifica"
    // non deve spostarsi (assegnazione esplicita = niente ON UPDATE).
    for (const c of CONVERSION) {
      await q.query(
        `UPDATE \`utilities\` SET \`disconnectable\` = ?,
                \`notes\` = IF(? = 1, CONCAT_WS('\\n', NULLIF(\`notes\`, ''), CONCAT('Disalimentabilità: ', TRIM(\`disconnection_ability\`))), \`notes\`),
                \`update_date\` = \`update_date\`
          WHERE LOWER(TRIM(\`disconnection_ability\`)) = ?`,
        [c.value, c.note, c.text],
      );
    }

    await q.query(`ALTER TABLE \`utilities\` DROP COLUMN \`disconnection_ability\``);
    // utility_type_purpose per prima: le sue FK (dove esistono) puntano a purpose.
    await q.query(`DROP TABLE \`utility_type_purpose\``);
    await q.query(`DROP TABLE \`purpose\``);
  }

  // Ritorno con perdita dichiarata: le finalità (dati di prova) non tornano,
  // il testo originale della disalimentabilità resta solo nelle note.
  public async down(q: QueryRunner): Promise<void> {
    await q.query(
      `CREATE TABLE \`purpose\` (\`id\` int NOT NULL AUTO_INCREMENT, \`name\` varchar(255) NOT NULL, \`use_type\` enum ('GENERIC', 'SPECIFIC') NOT NULL, \`create_date\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`update_date\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`created_by_user_id\` int NOT NULL, \`updated_by_user_id\` int NOT NULL, \`deleted\` tinyint NOT NULL DEFAULT '0', INDEX \`IDX_0e4e689e26b6b3fdb47a4a8de0\` (\`created_by_user_id\`), UNIQUE INDEX \`IDX_4a272e999eb7c51548b0249e29\` (\`name\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await q.query(
      `ALTER TABLE \`purpose\` ADD CONSTRAINT \`FK_0e4e689e26b6b3fdb47a4a8de00\` FOREIGN KEY (\`created_by_user_id\`) REFERENCES \`system_users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await q.query(
      `ALTER TABLE \`purpose\` ADD CONSTRAINT \`FK_77dc5d21ae1e69bceaf481001bf\` FOREIGN KEY (\`updated_by_user_id\`) REFERENCES \`system_users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await q.query(
      `CREATE TABLE \`utility_type_purpose\` (\`utility_type_id\` int NOT NULL, \`purpose_id\` int NOT NULL, INDEX \`IDX_ef80be3fc01d5e693454b854ce\` (\`utility_type_id\`), INDEX \`IDX_1e8787cfd9a351ca1bc81f882e\` (\`purpose_id\`), PRIMARY KEY (\`utility_type_id\`, \`purpose_id\`)) ENGINE=InnoDB`,
    );
    await q.query(
      `ALTER TABLE \`utility_type_purpose\` ADD CONSTRAINT \`FK_ef80be3fc01d5e693454b854ce3\` FOREIGN KEY (\`utility_type_id\`) REFERENCES \`utility_types\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await q.query(
      `ALTER TABLE \`utility_type_purpose\` ADD CONSTRAINT \`FK_1e8787cfd9a351ca1bc81f882e9\` FOREIGN KEY (\`purpose_id\`) REFERENCES \`purpose\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    await q.query(`ALTER TABLE \`utilities\` ADD \`disconnection_ability\` varchar(255) NULL`);
    await q.query(
      `UPDATE \`utilities\` SET \`disconnection_ability\` = CASE \`disconnectable\` WHEN 1 THEN 'disalimentabile' WHEN 0 THEN 'non disalimentabile' END,
              \`update_date\` = \`update_date\``,
    );
    await q.query(`ALTER TABLE \`utilities\` DROP COLUMN \`disconnectable\``);
    await q.query(`ALTER TABLE \`utilities\` DROP COLUMN \`arera_category\``);
  }
}
