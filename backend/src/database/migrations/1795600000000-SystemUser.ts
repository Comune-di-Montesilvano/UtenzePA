import { MigrationInterface, QueryRunner } from 'typeorm';

// Utente di sistema (id -1, SYSTEM_USER_ID) per le scritture automatiche: prima
// l'import fatture usava il primo Admin attivo, che risultava autore di fatture,
// letture e matricole. Riassegna all'utente di sistema quelle già scritte dall'import.
export class SystemUser1795600000000 implements MigrationInterface {
  name = 'SystemUser1795600000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      'INSERT INTO `system_users` (`id`, `first_name`, `last_name`, `email`, `username`, `password_hash`, `auth_provider`, `role`, `status`, `created_by_user_id`, `updated_by_user_id`, `deleted`) ' +
        "SELECT -1, NULL, 'UtenzePA (automatico)', NULL, NULL, NULL, 'local', 'Lettore', 'Disattivo', -1, -1, 0 FROM DUAL " +
        'WHERE NOT EXISTS (SELECT 1 FROM `system_users` WHERE `id` = -1)',
    );
    // Autore usato finora dall'import (IMPORT_USER_SQL della v1.43).
    const [author]: { id: number }[] = await q.query(
      "SELECT id FROM `system_users` WHERE role = 'Admin' AND status = 'Attivo' AND deleted = 0 AND id > 0 ORDER BY id LIMIT 1",
    );
    if (!author) return;
    const id = Number(author.id);
    // Fatture create dall'import: collegate a un messaggio SDI e nate dopo il suo arrivo
    // (quelle già inserite a mano e solo arricchite tengono il loro autore).
    await q.query(
      'UPDATE `invoices` i JOIN `sdi_messages` m ON m.invoice_id_fk = i.id ' +
        'SET i.created_by_user_id = -1, i.updated_by_user_id = IF(i.updated_by_user_id = ?, -1, i.updated_by_user_id), i.update_date = i.update_date ' +
        'WHERE i.created_by_user_id = ? AND i.create_date >= m.create_date',
      [id, id],
    );
    // Consumi e letture scritti dall'import (origine fattura, collegati alla fattura).
    await q.query(
      'UPDATE `utility_consumptions` SET created_by_user_id = IF(created_by_user_id = ?, -1, created_by_user_id), ' +
        'updated_by_user_id = IF(updated_by_user_id = ?, -1, updated_by_user_id), update_date = update_date ' +
        "WHERE source = 'INVOICE' AND invoice_id_fk IS NOT NULL AND (created_by_user_id = ? OR updated_by_user_id = ?)",
      [id, id, id, id],
    );
    // Matricole scritte dall'import nello storico: utenze con righe di fatture da PEC.
    await q.query(
      "UPDATE `audit_logs` a SET a.user_id = -1 WHERE a.entity_name = 'utilities' AND a.field_name = 'meter_number' " +
        'AND a.action = ? AND a.user_id = ? AND a.old_label IS NULL AND a.new_label IS NULL ' +
        'AND EXISTS (SELECT 1 FROM `invoice_lines` l JOIN `sdi_messages` m ON m.invoice_id_fk = l.invoice_id_fk ' +
        'WHERE l.utility_id_fk = a.entity_id AND m.create_date <= a.created_at)',
      ['UPDATE', id],
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    const [author]: { id: number }[] = await q.query(
      "SELECT id FROM `system_users` WHERE role = 'Admin' AND deleted = 0 AND id > 0 ORDER BY id LIMIT 1",
    );
    if (author) {
      // Ogni riferimento all'utente di sistema torna al primo Admin (anche il suo
      // created_by/updated_by, che punta a se stesso e bloccherebbe il DELETE).
      const refs: { t: string; c: string }[] = await q.query(
        'SELECT TABLE_NAME AS t, COLUMN_NAME AS c FROM information_schema.KEY_COLUMN_USAGE ' +
          "WHERE TABLE_SCHEMA = DATABASE() AND REFERENCED_TABLE_NAME = 'system_users'",
      );
      for (const { t, c } of refs) {
        await q.query(`UPDATE \`${t}\` SET \`${c}\` = ? WHERE \`${c}\` = -1`, [Number(author.id)]);
      }
      await q.query('UPDATE `audit_logs` SET user_id = ? WHERE user_id = -1', [Number(author.id)]);
    }
    await q.query('DELETE FROM `system_users` WHERE `id` = -1');
  }
}
