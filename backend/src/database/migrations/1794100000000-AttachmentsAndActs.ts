import { MigrationInterface, QueryRunner } from 'typeorm';

// Allegati (file di immobili, impianti, verifiche, contratti e atti) e atti
// ufficiali con i loro tipi e collegamenti N-N. Tipi di atto iniziali come
// configurazione, modificabili dagli Admin.
export class AttachmentsAndActs1794100000000 implements MigrationInterface {
  name = 'AttachmentsAndActs1794100000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `CREATE TABLE \`act_types\` (\`id\` int NOT NULL AUTO_INCREMENT, \`name\` varchar(150) NOT NULL, \`sort_order\` int NOT NULL DEFAULT '0', \`create_date\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`update_date\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`created_by_user_id\` int NOT NULL, \`updated_by_user_id\` int NOT NULL, \`deleted\` tinyint NOT NULL DEFAULT 0, PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await q.query(
      `CREATE TABLE \`acts\` (\`id\` int NOT NULL AUTO_INCREMENT, \`act_type_id\` int NOT NULL, \`number\` varchar(100) NULL, \`act_date\` date NULL, \`subject\` varchar(500) NOT NULL, \`issuer\` varchar(255) NULL, \`protocol_number\` varchar(100) NULL, \`protocol_date\` date NULL, \`notes\` text NULL, \`create_date\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`update_date\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`created_by_user_id\` int NOT NULL, \`updated_by_user_id\` int NOT NULL, \`deleted\` tinyint NOT NULL DEFAULT 0, PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await q.query(
      `CREATE TABLE \`attachments\` (\`id\` int NOT NULL AUTO_INCREMENT, \`entity_type\` enum ('asset', 'plant', 'plant_inspection', 'utilizer_grant', 'contract', 'act') NOT NULL, \`entity_id\` int NOT NULL, \`original_name\` varchar(255) NOT NULL, \`stored_name\` varchar(255) NOT NULL, \`mime_type\` varchar(150) NOT NULL, \`size_bytes\` int NOT NULL, \`description\` varchar(255) NULL, \`create_date\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`update_date\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`created_by_user_id\` int NOT NULL, \`updated_by_user_id\` int NOT NULL, \`deleted\` tinyint NOT NULL DEFAULT 0, INDEX \`IDX_81b08be546ece1132e275edba9\` (\`entity_type\`, \`entity_id\`, \`deleted\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await q.query(
      `CREATE TABLE \`act_assets\` (\`act_id\` int NOT NULL, \`asset_id\` int NOT NULL, INDEX \`IDX_c8e19a6dae4766aada83d5b3c5\` (\`act_id\`), INDEX \`IDX_af46ca9459050727bca2083ba4\` (\`asset_id\`), PRIMARY KEY (\`act_id\`, \`asset_id\`)) ENGINE=InnoDB`,
    );
    await q.query(
      `CREATE TABLE \`act_plants\` (\`act_id\` int NOT NULL, \`plant_id\` int NOT NULL, INDEX \`IDX_6471b3e004157f813a8cd3e6ad\` (\`act_id\`), INDEX \`IDX_d9ebffcd6913c459f416a66627\` (\`plant_id\`), PRIMARY KEY (\`act_id\`, \`plant_id\`)) ENGINE=InnoDB`,
    );
    await q.query(
      `CREATE TABLE \`act_utilizer_grants\` (\`act_id\` int NOT NULL, \`utilizer_grant_id\` int NOT NULL, INDEX \`IDX_3e2e73b22a5ee14e46ceee3ad8\` (\`act_id\`), INDEX \`IDX_b484beefa6c46fbfb98b3ba189\` (\`utilizer_grant_id\`), PRIMARY KEY (\`act_id\`, \`utilizer_grant_id\`)) ENGINE=InnoDB`,
    );
    await q.query(
      `CREATE TABLE \`act_contracts\` (\`act_id\` int NOT NULL, \`contract_id\` int NOT NULL, INDEX \`IDX_9c6be989de379119c5ec4224c0\` (\`act_id\`), INDEX \`IDX_7555c13a8cc41c43573e026272\` (\`contract_id\`), PRIMARY KEY (\`act_id\`, \`contract_id\`)) ENGINE=InnoDB`,
    );
    await q.query(
      `ALTER TABLE \`act_types\` ADD CONSTRAINT \`FK_c10288a0e6c7dc2bd1fd0fa1776\` FOREIGN KEY (\`created_by_user_id\`) REFERENCES \`system_users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await q.query(
      `ALTER TABLE \`act_types\` ADD CONSTRAINT \`FK_123bfd71fe73be0f4e76c2c3525\` FOREIGN KEY (\`updated_by_user_id\`) REFERENCES \`system_users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await q.query(
      `ALTER TABLE \`acts\` ADD CONSTRAINT \`FK_e27044577286207dc6d427dd72b\` FOREIGN KEY (\`act_type_id\`) REFERENCES \`act_types\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await q.query(
      `ALTER TABLE \`acts\` ADD CONSTRAINT \`FK_97fdcf88954b7bad245f5cbda76\` FOREIGN KEY (\`created_by_user_id\`) REFERENCES \`system_users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await q.query(
      `ALTER TABLE \`acts\` ADD CONSTRAINT \`FK_48a4ab74d52aa33bffd4ebb9e24\` FOREIGN KEY (\`updated_by_user_id\`) REFERENCES \`system_users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await q.query(
      `ALTER TABLE \`attachments\` ADD CONSTRAINT \`FK_1d2cb6a9c543edc93c52029647c\` FOREIGN KEY (\`created_by_user_id\`) REFERENCES \`system_users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await q.query(
      `ALTER TABLE \`act_assets\` ADD CONSTRAINT \`FK_c8e19a6dae4766aada83d5b3c5f\` FOREIGN KEY (\`act_id\`) REFERENCES \`acts\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await q.query(
      `ALTER TABLE \`act_assets\` ADD CONSTRAINT \`FK_af46ca9459050727bca2083ba48\` FOREIGN KEY (\`asset_id\`) REFERENCES \`assets\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await q.query(
      `ALTER TABLE \`act_plants\` ADD CONSTRAINT \`FK_6471b3e004157f813a8cd3e6ad4\` FOREIGN KEY (\`act_id\`) REFERENCES \`acts\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await q.query(
      `ALTER TABLE \`act_plants\` ADD CONSTRAINT \`FK_d9ebffcd6913c459f416a666276\` FOREIGN KEY (\`plant_id\`) REFERENCES \`plants\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await q.query(
      `ALTER TABLE \`act_utilizer_grants\` ADD CONSTRAINT \`FK_3e2e73b22a5ee14e46ceee3ad81\` FOREIGN KEY (\`act_id\`) REFERENCES \`acts\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await q.query(
      `ALTER TABLE \`act_utilizer_grants\` ADD CONSTRAINT \`FK_b484beefa6c46fbfb98b3ba1898\` FOREIGN KEY (\`utilizer_grant_id\`) REFERENCES \`utilizer_grant\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await q.query(
      `ALTER TABLE \`act_contracts\` ADD CONSTRAINT \`FK_9c6be989de379119c5ec4224c01\` FOREIGN KEY (\`act_id\`) REFERENCES \`acts\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await q.query(
      `ALTER TABLE \`act_contracts\` ADD CONSTRAINT \`FK_7555c13a8cc41c43573e0262727\` FOREIGN KEY (\`contract_id\`) REFERENCES \`contracts\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`,
    );

    const TYPES = [
      'Delibera di Giunta',
      'Delibera di Consiglio',
      'Determina dirigenziale',
      'Decreto',
      'Ordinanza',
      'Atto notarile',
      'Autorizzazione / nulla osta / parere',
    ];
    // Autore: il primo Admin, altrimenti il primo utente. Installazione nuova
    // (migration prima del wizard /setup, nessun utente): niente tipi, li
    // crea l'Admin da Impostazioni → Tipi di atto. Idempotente per nome.
    const rows: { id: number | null }[] = await q.query(
      "SELECT COALESCE((SELECT MIN(`id`) FROM `system_users` WHERE `role` = 'Admin'), (SELECT MIN(`id`) FROM `system_users`)) AS id",
    );
    const userId = rows[0]?.id;
    if (userId == null) return;
    for (const [i, name] of TYPES.entries()) {
      await q.query(
        'INSERT INTO `act_types` (`name`, `sort_order`, `created_by_user_id`, `updated_by_user_id`) SELECT ?, ?, ?, ? FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `act_types` WHERE `name` = ?)',
        [name, (i + 1) * 10, userId, userId, name],
      );
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE \`act_contracts\` DROP FOREIGN KEY \`FK_7555c13a8cc41c43573e0262727\``,
    );
    await q.query(
      `ALTER TABLE \`act_contracts\` DROP FOREIGN KEY \`FK_9c6be989de379119c5ec4224c01\``,
    );
    await q.query(
      `ALTER TABLE \`act_utilizer_grants\` DROP FOREIGN KEY \`FK_b484beefa6c46fbfb98b3ba1898\``,
    );
    await q.query(
      `ALTER TABLE \`act_utilizer_grants\` DROP FOREIGN KEY \`FK_3e2e73b22a5ee14e46ceee3ad81\``,
    );
    await q.query(`ALTER TABLE \`act_plants\` DROP FOREIGN KEY \`FK_d9ebffcd6913c459f416a666276\``);
    await q.query(`ALTER TABLE \`act_plants\` DROP FOREIGN KEY \`FK_6471b3e004157f813a8cd3e6ad4\``);
    await q.query(`ALTER TABLE \`act_assets\` DROP FOREIGN KEY \`FK_af46ca9459050727bca2083ba48\``);
    await q.query(`ALTER TABLE \`act_assets\` DROP FOREIGN KEY \`FK_c8e19a6dae4766aada83d5b3c5f\``);
    await q.query(
      `ALTER TABLE \`attachments\` DROP FOREIGN KEY \`FK_1d2cb6a9c543edc93c52029647c\``,
    );
    await q.query(`ALTER TABLE \`acts\` DROP FOREIGN KEY \`FK_48a4ab74d52aa33bffd4ebb9e24\``);
    await q.query(`ALTER TABLE \`acts\` DROP FOREIGN KEY \`FK_97fdcf88954b7bad245f5cbda76\``);
    await q.query(`ALTER TABLE \`acts\` DROP FOREIGN KEY \`FK_e27044577286207dc6d427dd72b\``);
    await q.query(`ALTER TABLE \`act_types\` DROP FOREIGN KEY \`FK_123bfd71fe73be0f4e76c2c3525\``);
    await q.query(`ALTER TABLE \`act_types\` DROP FOREIGN KEY \`FK_c10288a0e6c7dc2bd1fd0fa1776\``);
    await q.query(`DROP INDEX \`IDX_7555c13a8cc41c43573e026272\` ON \`act_contracts\``);
    await q.query(`DROP INDEX \`IDX_9c6be989de379119c5ec4224c0\` ON \`act_contracts\``);
    await q.query(`DROP TABLE \`act_contracts\``);
    await q.query(`DROP INDEX \`IDX_b484beefa6c46fbfb98b3ba189\` ON \`act_utilizer_grants\``);
    await q.query(`DROP INDEX \`IDX_3e2e73b22a5ee14e46ceee3ad8\` ON \`act_utilizer_grants\``);
    await q.query(`DROP TABLE \`act_utilizer_grants\``);
    await q.query(`DROP INDEX \`IDX_d9ebffcd6913c459f416a66627\` ON \`act_plants\``);
    await q.query(`DROP INDEX \`IDX_6471b3e004157f813a8cd3e6ad\` ON \`act_plants\``);
    await q.query(`DROP TABLE \`act_plants\``);
    await q.query(`DROP INDEX \`IDX_af46ca9459050727bca2083ba4\` ON \`act_assets\``);
    await q.query(`DROP INDEX \`IDX_c8e19a6dae4766aada83d5b3c5\` ON \`act_assets\``);
    await q.query(`DROP TABLE \`act_assets\``);
    await q.query(`DROP INDEX \`IDX_81b08be546ece1132e275edba9\` ON \`attachments\``);
    await q.query(`DROP TABLE \`attachments\``);
    await q.query(`DROP TABLE \`acts\``);
    await q.query(`DROP TABLE \`act_types\``);
  }
}
