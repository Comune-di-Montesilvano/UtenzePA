import { MigrationInterface, QueryRunner } from 'typeorm';
import { joinImportedNotes, splitImportedNotes } from '../fire-equipment-notes';

// Presidi antincendio: nuovi tipi (rivelazione e allarme), quantità per riga,
// scadenze degli estintori in mese/anno al posto delle note importate
// ("scad. carica AAAA; scad. collaudo AAAA; ultima verifica AAAA": solo l'anno,
// salvato come gennaio con il prefisso IMPORTED_PREFIX nella nota, vedi
// fire-equipment-notes.ts).
const OLD_TYPES = ['EXTINGUISHER', 'HYDRANT', 'HOSE_REEL', 'FIRE_BRIGADE_CONNECTION'];
const NEW_TYPES = ['SMOKE_DETECTOR', 'ALARM_BUTTON', 'DETECTION_PANEL', 'ALARM_SIGNAL', 'SIREN'];
const enumSql = (values: string[]) => `enum (${values.map((v) => `'${v}'`).join(', ')})`;
const newTypesList = NEW_TYPES.map((t) => `'${t}'`).join(', ');

export class FireEquipmentDetails1794200000000 implements MigrationInterface {
  name = 'FireEquipmentDetails1794200000000';

  public async up(q: QueryRunner): Promise<void> {
    // Dati letti e convertiti prima dei DDL (commit implicito in MySQL): un
    // errore qui non lascia lo schema a metà.
    const rows: { id: number; notes: string | null }[] = await q.query(
      "/* select-notes */ SELECT `id`, `notes` FROM `plant_fire_equipment` WHERE `equipment_type` = 'EXTINGUISHER' AND `deleted` = 0 AND `notes` IS NOT NULL",
    );
    const january = (y: number | null) => (y === null ? null : `${y}-01-01`);
    const updates = rows.flatMap((row) => {
      const s = splitImportedNotes(row.notes);
      return s ? [[january(s.revision), january(s.test), january(s.check), s.notes, row.id]] : [];
    });

    await q.query(
      `ALTER TABLE \`plant_fire_equipment\` MODIFY \`equipment_type\` ${enumSql([...OLD_TYPES, ...NEW_TYPES])} NOT NULL`,
    );
    await q.query(
      'ALTER TABLE `plant_fire_equipment` ADD `quantity` int NOT NULL DEFAULT 1 AFTER `equipment_type`',
    );
    await q.query(
      'ALTER TABLE `plant_fire_equipment` ADD `last_check_on` date NULL AFTER `location`, ADD `revision_due_on` date NULL AFTER `last_check_on`, ADD `test_due_on` date NULL AFTER `revision_due_on`',
    );
    for (const params of updates) {
      await q.query(
        'UPDATE `plant_fire_equipment` SET `revision_due_on` = ?, `test_due_on` = ?, `last_check_on` = ?, `notes` = ?, `update_date` = `update_date` WHERE `id` = ?',
        params,
      );
    }
  }

  // Le date tornano nelle note con il solo anno (il mese si perde).
  public async down(q: QueryRunner): Promise<void> {
    const rows: { id: number; r: unknown; t: unknown; c: unknown; notes: string | null }[] =
      await q.query(
        '/* select-dates */ SELECT `id`, YEAR(`revision_due_on`) r, YEAR(`test_due_on`) t, YEAR(`last_check_on`) c, `notes` FROM `plant_fire_equipment` WHERE `revision_due_on` IS NOT NULL OR `test_due_on` IS NOT NULL OR `last_check_on` IS NOT NULL',
      );
    const year = (v: unknown) => (v === null || v === undefined ? null : Number(v));
    for (const row of rows) {
      const notes = joinImportedNotes({
        revision: year(row.r),
        test: year(row.t),
        check: year(row.c),
        notes: row.notes,
      });
      await q.query(
        'UPDATE `plant_fire_equipment` SET `notes` = ?, `update_date` = `update_date` WHERE `id` = ?',
        [notes, row.id],
      );
    }
    const [{ n }]: { n: unknown }[] = await q.query(
      `/* count-new-types */ SELECT COUNT(*) n FROM \`plant_fire_equipment\` WHERE \`equipment_type\` IN (${newTypesList})`,
    );
    if (Number(n) > 0) {
      console.warn(`FireEquipmentDetails down: eliminati ${Number(n)} presidi dei nuovi tipi`);
    }
    await q.query(
      `DELETE FROM \`plant_fire_equipment\` WHERE \`equipment_type\` IN (${newTypesList})`,
    );
    await q.query(
      'ALTER TABLE `plant_fire_equipment` DROP COLUMN `test_due_on`, DROP COLUMN `revision_due_on`, DROP COLUMN `last_check_on`, DROP COLUMN `quantity`',
    );
    await q.query(
      `ALTER TABLE \`plant_fire_equipment\` MODIFY \`equipment_type\` ${enumSql(OLD_TYPES)} NOT NULL`,
    );
  }
}
