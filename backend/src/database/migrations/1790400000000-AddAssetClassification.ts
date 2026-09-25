import { MigrationInterface, QueryRunner } from 'typeorm';

// Funzioni di default: nome -> icona Material Icons.
const DEFAULT_FUNCTIONS: Record<string, string> = {
  Residenziale: 'home',
  Istruzione: 'school',
  'Uffici istituzionali': 'account_balance',
  'Sicurezza e soccorso': 'local_police',
  'Protezione civile': 'health_and_safety',
  Sociale: 'volunteer_activism',
  'Accoglienza (SPRAR)': 'family_restroom',
  Associazioni: 'groups',
  Sport: 'sports_soccer',
  'Cultura ed eventi': 'theater_comedy',
  Mercato: 'storefront',
  'Commercio e chioschi': 'store',
  'Magazzino e autorimessa': 'warehouse',
  Cimiteriale: 'church',
  'Verde e tempo libero': 'park',
  'Orti comunali': 'yard',
  Piazza: 'location_city',
  'Area edificabile': 'construction',
  'Area agricola': 'agriculture',
  'Area pertinenziale': 'fence',
  Viabilità: 'add_road',
  Rotatoria: 'roundabout_right',
  Semaforo: 'traffic',
  Parcheggio: 'local_parking',
  'Pista ciclabile': 'directions_bike',
  'Bike sharing': 'pedal_bike',
  'Trasporto pubblico': 'directions_bus',
  'Illuminazione pubblica': 'lightbulb',
  Fontana: 'water_drop',
  "Presa d'acqua": 'water',
  'Presa energia elettrica': 'electrical_services',
  "Casetta dell'acqua": 'local_drink',
  'Pompa di sollevamento': 'plumbing',
  'Depurazione e fognatura': 'filter_alt',
  'Cabina elettrica': 'bolt',
  Irrigazione: 'grass',
  'Videosorveglianza e antenne': 'videocam',
  'Impianto tecnologico': 'settings',
  Altro: 'more_horiz',
};

// Nature di default: nome -> icona + funzioni ammesse.
const DEFAULT_NATURES: { name: string; icon: string; functions: string[] }[] = [
  {
    name: 'Fabbricato',
    icon: 'apartment',
    functions: [
      'Residenziale',
      'Istruzione',
      'Uffici istituzionali',
      'Sicurezza e soccorso',
      'Protezione civile',
      'Sociale',
      'Accoglienza (SPRAR)',
      'Associazioni',
      'Sport',
      'Cultura ed eventi',
      'Mercato',
      'Commercio e chioschi',
      'Magazzino e autorimessa',
      'Cimiteriale',
      'Trasporto pubblico',
      'Altro',
    ],
  },
  {
    name: 'Area / terreno',
    icon: 'landscape',
    functions: [
      'Area edificabile',
      'Area agricola',
      'Area pertinenziale',
      'Verde e tempo libero',
      'Orti comunali',
      'Sport',
      'Cultura ed eventi',
      'Mercato',
      'Parcheggio',
      'Cimiteriale',
      'Altro',
    ],
  },
  {
    name: 'Area pubblica attrezzata',
    icon: 'park',
    functions: [
      'Verde e tempo libero',
      'Piazza',
      'Sport',
      'Cultura ed eventi',
      'Mercato',
      'Commercio e chioschi',
      'Altro',
    ],
  },
  {
    name: 'Infrastruttura stradale',
    icon: 'add_road',
    functions: [
      'Viabilità',
      'Rotatoria',
      'Semaforo',
      'Parcheggio',
      'Pista ciclabile',
      'Bike sharing',
      'Trasporto pubblico',
      'Altro',
    ],
  },
  {
    name: 'Impianto tecnologico',
    icon: 'settings_input_component',
    functions: [
      'Illuminazione pubblica',
      'Fontana',
      "Presa d'acqua",
      'Presa energia elettrica',
      "Casetta dell'acqua",
      'Pompa di sollevamento',
      'Depurazione e fognatura',
      'Cabina elettrica',
      'Irrigazione',
      'Videosorveglianza e antenne',
      'Impianto tecnologico',
      'Altro',
    ],
  },
  {
    name: 'Altro',
    icon: 'category',
    functions: ['Altro'],
  },
];

// Classificazione immobili Natura × Funzione (coppie ammesse) + Stato.
// asset_type_id (AssetAggregator) diventa nullable: legacy in sola lettura,
// azzerato alla riclassificazione. Nomi vincoli = default TypeORM
// (DefaultNamingStrategy), così migration:generate non vede drift.
// Seed di default (nature, funzioni, coppie) solo se esiste già almeno un
// utente: created_by_user_id è una FK NOT NULL verso system_users, e su una
// installazione nuova (prima del wizard /setup) non ce n'è nessuno.
export class AddAssetClassification1790400000000 implements MigrationInterface {
  name = 'AddAssetClassification1790400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`asset_functions\` (\`id\` int NOT NULL AUTO_INCREMENT, \`name\` varchar(255) NOT NULL, \`icon\` varchar(50) NULL, \`create_date\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`update_date\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`created_by_user_id\` int NOT NULL, \`updated_by_user_id\` int NOT NULL, \`deleted\` tinyint NOT NULL DEFAULT 0, UNIQUE INDEX \`IDX_001607cb3b93c5be56ed6c5436\` (\`name\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`asset_natures\` (\`id\` int NOT NULL AUTO_INCREMENT, \`name\` varchar(255) NOT NULL, \`icon\` varchar(50) NULL, \`create_date\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`update_date\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`created_by_user_id\` int NOT NULL, \`updated_by_user_id\` int NOT NULL, \`deleted\` tinyint NOT NULL DEFAULT 0, UNIQUE INDEX \`IDX_447535931d91036f77df3285d7\` (\`name\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`asset_nature_functions\` (\`nature_id\` int NOT NULL, \`function_id\` int NOT NULL, INDEX \`IDX_65f8f7543ffc3a08895b4c6bd6\` (\`nature_id\`), INDEX \`IDX_723abed4fd0ecea738a4848a73\` (\`function_id\`), PRIMARY KEY (\`nature_id\`, \`function_id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`assets\` ADD \`nature_id\` int NULL, ADD \`function_id\` int NULL, ADD \`status\` enum ('Attivo', 'Dismesso', 'Da verificare') NOT NULL DEFAULT 'Attivo', MODIFY \`asset_type_id\` int NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`asset_functions\` ADD CONSTRAINT \`FK_90e175210db7d194ab8a2c85213\` FOREIGN KEY (\`created_by_user_id\`) REFERENCES \`system_users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`asset_functions\` ADD CONSTRAINT \`FK_db3244cb4f4a9db0d1e7b94968c\` FOREIGN KEY (\`updated_by_user_id\`) REFERENCES \`system_users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`asset_natures\` ADD CONSTRAINT \`FK_91f2b396fa3f878eb0362b8b333\` FOREIGN KEY (\`created_by_user_id\`) REFERENCES \`system_users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`asset_natures\` ADD CONSTRAINT \`FK_e08ffa8fc5572d75830a9c05705\` FOREIGN KEY (\`updated_by_user_id\`) REFERENCES \`system_users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`asset_nature_functions\` ADD CONSTRAINT \`FK_65f8f7543ffc3a08895b4c6bd69\` FOREIGN KEY (\`nature_id\`) REFERENCES \`asset_natures\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE \`asset_nature_functions\` ADD CONSTRAINT \`FK_723abed4fd0ecea738a4848a737\` FOREIGN KEY (\`function_id\`) REFERENCES \`asset_functions\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE \`assets\` ADD CONSTRAINT \`FK_eea0f5a93691db842ddd1ad0eb3\` FOREIGN KEY (\`nature_id\`) REFERENCES \`asset_natures\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`assets\` ADD CONSTRAINT \`FK_e863b6697b32d895afe51e6baab\` FOREIGN KEY (\`function_id\`) REFERENCES \`asset_functions\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );

    await this.seedDefaults(queryRunner);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`assets\` DROP FOREIGN KEY \`FK_e863b6697b32d895afe51e6baab\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`assets\` DROP FOREIGN KEY \`FK_eea0f5a93691db842ddd1ad0eb3\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`asset_nature_functions\` DROP FOREIGN KEY \`FK_723abed4fd0ecea738a4848a737\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`asset_nature_functions\` DROP FOREIGN KEY \`FK_65f8f7543ffc3a08895b4c6bd69\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`asset_natures\` DROP FOREIGN KEY \`FK_e08ffa8fc5572d75830a9c05705\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`asset_natures\` DROP FOREIGN KEY \`FK_91f2b396fa3f878eb0362b8b333\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`asset_functions\` DROP FOREIGN KEY \`FK_db3244cb4f4a9db0d1e7b94968c\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`asset_functions\` DROP FOREIGN KEY \`FK_90e175210db7d194ab8a2c85213\``,
    );
    // Immobili già riclassificati hanno asset_type_id NULL: il ritorno a NOT
    // NULL fallirebbe — resta nullable (down lossy, accettato nella spec).
    await queryRunner.query(
      `ALTER TABLE \`assets\` DROP COLUMN \`status\`, DROP COLUMN \`function_id\`, DROP COLUMN \`nature_id\``,
    );
    await queryRunner.query(`DROP TABLE \`asset_nature_functions\``);
    await queryRunner.query(`DROP TABLE \`asset_natures\``);
    await queryRunner.query(`DROP TABLE \`asset_functions\``);
  }

  // Idempotente per nome: una voce già presente (es. inserita a mano) non
  // viene duplicata né modificata.
  private async seedDefaults(queryRunner: QueryRunner): Promise<void> {
    const rows: { id: number | null }[] = await queryRunner.query(
      `SELECT COALESCE((SELECT MIN(\`id\`) FROM \`system_users\` WHERE \`role\` = 'Admin'), (SELECT MIN(\`id\`) FROM \`system_users\`)) AS id`,
    );
    const userId = rows[0]?.id;
    if (userId == null) return;

    for (const [name, icon] of Object.entries(DEFAULT_FUNCTIONS)) {
      await queryRunner.query(
        `INSERT INTO \`asset_functions\` (\`name\`, \`icon\`, \`created_by_user_id\`, \`updated_by_user_id\`) SELECT ?, ?, ?, ? FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM \`asset_functions\` WHERE \`name\` = ?)`,
        [name, icon, userId, userId, name],
      );
    }

    for (const nature of DEFAULT_NATURES) {
      await queryRunner.query(
        `INSERT INTO \`asset_natures\` (\`name\`, \`icon\`, \`created_by_user_id\`, \`updated_by_user_id\`) SELECT ?, ?, ?, ? FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM \`asset_natures\` WHERE \`name\` = ?)`,
        [nature.name, nature.icon, userId, userId, nature.name],
      );
      for (const functionName of nature.functions) {
        await queryRunner.query(
          `INSERT IGNORE INTO \`asset_nature_functions\` (\`nature_id\`, \`function_id\`) SELECT n.\`id\`, f.\`id\` FROM \`asset_natures\` n, \`asset_functions\` f WHERE n.\`name\` = ? AND f.\`name\` = ?`,
          [nature.name, functionName],
        );
      }
    }
  }
}
