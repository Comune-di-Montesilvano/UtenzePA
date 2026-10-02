import { MigrationInterface, QueryRunner } from 'typeorm';

// Soggetti terzi: controparti (utilizer) e fornitori (suppliers) in un'unica
// tabella, id originali conservati (utilizer 961–1274, suppliers 42–54:
// disgiunti). Contratti immobiliari N-N con le parti. Il tipo dei soggetti
// ex utilizer è LEGAL provvisorio: si corregge nella pulizia dati.
// Nomi vincoli = default TypeORM (DefaultNamingStrategy).
export class ThirdParties1791500000000 implements MigrationInterface {
  name = 'ThirdParties1791500000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `CREATE TABLE \`third_parties\` (\`id\` int NOT NULL AUTO_INCREMENT, \`type\` enum ('NATURAL', 'LEGAL') NOT NULL, \`company_name\` varchar(255) NULL, \`last_name\` varchar(100) NULL, \`first_name\` varchar(100) NULL, \`vat_number\` varchar(20) NULL, \`tax_code\` varchar(16) NULL, \`address\` varchar(255) NULL, \`city\` varchar(100) NULL, \`postal_code\` varchar(10) NULL, \`email\` varchar(100) NULL, \`pec\` varchar(100) NULL, \`phone\` varchar(50) NULL, \`contacts\` text NULL, \`notes\` text NULL, \`create_date\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`update_date\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`created_by_user_id\` int NOT NULL, \`updated_by_user_id\` int NOT NULL, \`deleted\` tinyint NOT NULL DEFAULT 0, UNIQUE INDEX \`IDX_77c8d61f58fdf7293a412b8096\` (\`vat_number\`), UNIQUE INDEX \`IDX_d7529f9132b7c8a95fe7461734\` (\`tax_code\`), INDEX \`IDX_14326d7ad55327d4848f7d0992\` (\`created_by_user_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await q.query(
      `ALTER TABLE \`third_parties\` ADD CONSTRAINT \`FK_14326d7ad55327d4848f7d09926\` FOREIGN KEY (\`created_by_user_id\`) REFERENCES \`system_users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await q.query(
      `ALTER TABLE \`third_parties\` ADD CONSTRAINT \`FK_42849eb31cdf72393e18446ca87\` FOREIGN KEY (\`updated_by_user_id\`) REFERENCES \`system_users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );

    // Fornitori, eliminati compresi. La sigla supplier_id si scarta.
    await q.query(
      `INSERT INTO \`third_parties\` (id, type, company_name, vat_number, tax_code, address, city, postal_code, email, pec, create_date, update_date, created_by_user_id, updated_by_user_id, deleted)
       SELECT id, 'LEGAL', company_name, NULLIF(TRIM(vat_number), ''), NULLIF(TRIM(tax_code), ''), address, city, postal_code, email, pec, create_date, update_date, created_by_user_id, updated_by_user_id, deleted
       FROM \`suppliers\``,
    );
    // Controparti: nome → denominazione, descrizione → note.
    await q.query(
      `INSERT INTO \`third_parties\` (id, type, company_name, tax_code, contacts, notes, create_date, update_date, created_by_user_id, updated_by_user_id, deleted)
       SELECT id, 'LEGAL', name, NULLIF(TRIM(tax_code), ''), contacts, description, create_date, update_date, created_by_user_id, updated_by_user_id, deleted
       FROM \`utilizer\``,
    );

    await q.query(
      `CREATE TABLE \`utilizer_grant_parties\` (\`utilizer_grant_id\` int NOT NULL, \`third_party_id\` int NOT NULL, INDEX \`IDX_907f45a23600d3b35b83be7433\` (\`utilizer_grant_id\`), INDEX \`IDX_72d65a39ff19ba9f6c8a2a143d\` (\`third_party_id\`), PRIMARY KEY (\`utilizer_grant_id\`, \`third_party_id\`)) ENGINE=InnoDB`,
    );
    await q.query(
      `ALTER TABLE \`utilizer_grant_parties\` ADD CONSTRAINT \`FK_907f45a23600d3b35b83be74330\` FOREIGN KEY (\`utilizer_grant_id\`) REFERENCES \`utilizer_grant\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await q.query(
      `ALTER TABLE \`utilizer_grant_parties\` ADD CONSTRAINT \`FK_72d65a39ff19ba9f6c8a2a143d2\` FOREIGN KEY (\`third_party_id\`) REFERENCES \`third_parties\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await q.query(
      `INSERT INTO \`utilizer_grant_parties\` (utilizer_grant_id, third_party_id)
       SELECT id, utilizer_id_fk FROM \`utilizer_grant\` WHERE utilizer_id_fk IS NOT NULL`,
    );

    // Le FK verso suppliers/utilizer non sono le stesse in tutti i DB
    // (InitialSchema ne crea alcune che il DB di sviluppo non ha): si leggono
    // da information_schema invece di usare nomi fissi.
    const fks: { tbl: string; fk: string }[] = await q.query(
      `SELECT TABLE_NAME AS tbl, CONSTRAINT_NAME AS fk FROM information_schema.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = DATABASE() AND REFERENCED_TABLE_NAME IN ('suppliers', 'utilizer')
          AND TABLE_NAME NOT IN ('suppliers', 'utilizer')`,
    );
    for (const { tbl, fk } of fks) {
      await q.query(`ALTER TABLE \`${tbl}\` DROP FOREIGN KEY \`${fk}\``);
    }

    await q.query(
      `ALTER TABLE \`contracts\` ADD CONSTRAINT \`FK_3ffd48901e416673c6e4a7b724b\` FOREIGN KEY (\`supplier_id_fk\`) REFERENCES \`third_parties\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await q.query(
      `ALTER TABLE \`consip_agreement\` ADD CONSTRAINT \`FK_4865ffe2d0c44ceb3728328eeb0\` FOREIGN KEY (\`supplier_id\`) REFERENCES \`third_parties\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );

    await q.query(`ALTER TABLE \`utilizer_grant\` DROP COLUMN \`utilizer_id_fk\``);
    await q.query(`DROP TABLE \`utilizer\``);
    await q.query(`DROP TABLE \`suppliers\``);
  }

  // Rollback d'emergenza: utilizer_id_fk torna NULL (un contratto senza parti
  // dopo la pulizia non avrebbe valore); di più parti si conserva la prima.
  public async down(q: QueryRunner): Promise<void> {
    await q.query(
      `CREATE TABLE \`suppliers\` (\`id\` int NOT NULL AUTO_INCREMENT, \`supplier_id\` varchar(50) NOT NULL, \`vat_number\` varchar(20) NULL, \`tax_code\` varchar(20) NULL, \`company_name\` varchar(255) NOT NULL, \`address\` varchar(255) NULL, \`city\` varchar(100) NULL, \`postal_code\` varchar(10) NULL, \`email\` varchar(100) NULL, \`pec\` varchar(100) NULL, \`create_date\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`update_date\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`created_by_user_id\` int NOT NULL, \`updated_by_user_id\` int NOT NULL, \`deleted\` tinyint NOT NULL DEFAULT 0, UNIQUE INDEX \`IDX_a2692f796d16e0a30040860112\` (\`supplier_id\`), UNIQUE INDEX \`IDX_aee7c8464d179ea66636906349\` (\`company_name\`), INDEX \`IDX_5fa7dd93144dd478fc3606eda1\` (\`created_by_user_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await q.query(
      `CREATE TABLE \`utilizer\` (\`id\` int NOT NULL AUTO_INCREMENT, \`name\` varchar(255) NOT NULL, \`description\` varchar(255) NULL, \`tax_code\` varchar(16) NULL, \`contacts\` text NULL, \`create_date\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`update_date\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`created_by_user_id\` int NOT NULL, \`updated_by_user_id\` int NOT NULL, \`deleted\` tinyint NOT NULL DEFAULT 0, PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    // Fornitore = id del range originale suppliers o usato da contratti/CONSIP;
    // gli altri tornano controparti. Sigla = nome con suffisso id (unicità).
    const name = `COALESCE(company_name, CONCAT_WS(' ', last_name, first_name))`;
    await q.query(
      `INSERT INTO \`suppliers\` (id, supplier_id, vat_number, tax_code, company_name, address, city, postal_code, email, pec, create_date, update_date, created_by_user_id, updated_by_user_id, deleted)
       SELECT id, LEFT(CONCAT(${name}, ' #', id), 50), vat_number, tax_code, CONCAT(${name}, ' #', id), address, city, postal_code, email, pec, create_date, update_date, created_by_user_id, updated_by_user_id, deleted
       FROM \`third_parties\` tp
       WHERE tp.id < 961
          OR EXISTS (SELECT 1 FROM contracts c WHERE c.supplier_id_fk = tp.id)
          OR EXISTS (SELECT 1 FROM consip_agreement ca WHERE ca.supplier_id = tp.id)`,
    );
    await q.query(
      `INSERT INTO \`utilizer\` (id, name, description, tax_code, contacts, create_date, update_date, created_by_user_id, updated_by_user_id, deleted)
       SELECT id, LEFT(${name}, 255), LEFT(notes, 255), tax_code, contacts, create_date, update_date, created_by_user_id, updated_by_user_id, deleted
       FROM \`third_parties\` tp
       WHERE tp.id NOT IN (SELECT id FROM \`suppliers\`)`,
    );
    await q.query(`ALTER TABLE \`utilizer_grant\` ADD \`utilizer_id_fk\` int NULL`);
    await q.query(
      `UPDATE \`utilizer_grant\` g SET g.utilizer_id_fk = (SELECT MIN(gp.third_party_id) FROM \`utilizer_grant_parties\` gp WHERE gp.utilizer_grant_id = g.id)`,
    );
    await q.query(`ALTER TABLE \`consip_agreement\` DROP FOREIGN KEY \`FK_4865ffe2d0c44ceb3728328eeb0\``);
    await q.query(`ALTER TABLE \`contracts\` DROP FOREIGN KEY \`FK_3ffd48901e416673c6e4a7b724b\``);
    await q.query(
      `ALTER TABLE \`contracts\` ADD CONSTRAINT \`FK_3ffd48901e416673c6e4a7b724b\` FOREIGN KEY (\`supplier_id_fk\`) REFERENCES \`suppliers\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await q.query(`DROP TABLE \`utilizer_grant_parties\``);
    await q.query(`DROP TABLE \`third_parties\``);
  }
}
