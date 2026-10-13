import { MigrationInterface, QueryRunner } from 'typeorm';

// Presidi: porte tagliafuoco (REI), maniglioni antipanico, segnaletica
// luminosa di uscita, lampade di emergenza (censimento antincendio 2025).
const BEFORE = [
  'EXTINGUISHER',
  'HYDRANT',
  'HOSE_REEL',
  'FIRE_BRIGADE_CONNECTION',
  'SMOKE_DETECTOR',
  'ALARM_BUTTON',
  'DETECTION_PANEL',
  'ALARM_SIGNAL',
  'SIREN',
];
const ADDED = ['FIRE_DOOR', 'PANIC_BAR', 'EXIT_SIGN', 'EMERGENCY_LIGHT'];
const enumSql = (values: string[]) => `enum (${values.map((v) => `'${v}'`).join(', ')})`;
const addedList = ADDED.map((t) => `'${t}'`).join(', ');

export class FireEquipmentSafetyTypes1794400000000 implements MigrationInterface {
  name = 'FireEquipmentSafetyTypes1794400000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE \`plant_fire_equipment\` MODIFY \`equipment_type\` ${enumSql([...BEFORE, ...ADDED])} NOT NULL`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    const [{ n }]: { n: unknown }[] = await q.query(
      `SELECT COUNT(*) n FROM \`plant_fire_equipment\` WHERE \`equipment_type\` IN (${addedList})`,
    );
    if (Number(n) > 0) {
      console.warn(`FireEquipmentSafetyTypes down: eliminati ${Number(n)} presidi dei tipi aggiunti`);
    }
    await q.query(`DELETE FROM \`plant_fire_equipment\` WHERE \`equipment_type\` IN (${addedList})`);
    await q.query(
      `ALTER TABLE \`plant_fire_equipment\` MODIFY \`equipment_type\` ${enumSql(BEFORE)} NOT NULL`,
    );
  }
}
