import { MigrationInterface, QueryRunner } from 'typeorm';

const TYPES =
  "'THERMAL', 'ELEVATOR', 'FIRE_PROTECTION', 'PHOTOVOLTAIC', 'PUBLIC_LIGHTING', 'TRAFFIC_LIGHT', " +
  "'LIFTING_PUMP', 'FOUNTAIN', 'ELECTRICAL_CABIN', 'WATER_KIOSK', 'VIDEO_SURVEILLANCE', 'BIKE_STATION', " +
  "'POWER_POINT', 'WATER_POINT', 'SEWAGE', 'IRRIGATION', 'POWERED_STREET_FURNITURE', 'COMPACTOR', 'STORMWATER'";

// Impianto elettrico dell'edificio (DM 37/08, DPR 462/01): nuovo tipo e scheda.
export class ElectricalSystem1794600000000 implements MigrationInterface {
  name = 'ElectricalSystem1794600000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE \`plants\` MODIFY \`type\` enum (${TYPES}, 'ELECTRICAL_SYSTEM') NOT NULL`);
    await q.query(
      "CREATE TABLE `plant_electrical` (`plant_id` int NOT NULL, `supply` enum ('LV', 'MV') NULL, `grounding_class` enum ('ORDINARY', 'HIGH_RISK', 'EXPLOSION') NULL, `conformity_type` enum ('DICO', 'DIRI') NULL, `conformity_date` date NULL, `conformity_number` varchar(100) NULL, `inail_date` date NULL, `inail_number` varchar(100) NULL, `lightning_protection` tinyint NULL, PRIMARY KEY (`plant_id`)) ENGINE=InnoDB",
    );
    await q.query(
      'ALTER TABLE `plant_electrical` ADD CONSTRAINT `FK_601da3ec3e8de6fde1d031deef3` FOREIGN KEY (`plant_id`) REFERENCES `plants`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION',
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    // Gli impianti elettrici hanno collegamenti, verifiche e allegati: non si
    // buttano in silenzio (anche i cancellati logicamente).
    const [{ n }] = await q.query("SELECT COUNT(*) AS n FROM `plants` WHERE `type` = 'ELECTRICAL_SYSTEM'");
    if (Number(n) > 0) {
      throw new Error(
        `Impossibile annullare: ${n} impianti elettrici presenti (con collegamenti, verifiche e allegati). Eliminarli prima a mano.`,
      );
    }
    await q.query('DROP TABLE `plant_electrical`');
    await q.query(`ALTER TABLE \`plants\` MODIFY \`type\` enum (${TYPES}) NOT NULL`);
  }
}
