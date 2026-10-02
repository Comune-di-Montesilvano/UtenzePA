import { MigrationInterface, QueryRunner } from 'typeorm';

const BASE_TYPES =
  "'THERMAL', 'ELEVATOR', 'FIRE_PROTECTION', 'PHOTOVOLTAIC', 'PUBLIC_LIGHTING', 'TRAFFIC_LIGHT', " +
  "'LIFTING_PUMP', 'FOUNTAIN', 'ELECTRICAL_CABIN', 'WATER_KIOSK', 'VIDEO_SURVEILLANCE', 'BIKE_STATION', " +
  "'POWER_POINT', 'WATER_POINT', 'SEWAGE', 'IRRIGATION', 'POWERED_STREET_FURNITURE'";

// Nuovi tipi di impianto: ecocompattatore e impianto raccolta acque meteoriche.
export class PlantTypesCompactorStormwater1791400000000 implements MigrationInterface {
  name = 'PlantTypesCompactorStormwater1791400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`plants\` MODIFY \`type\` enum (${BASE_TYPES}, 'COMPACTOR', 'STORMWATER') NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`plants\` MODIFY \`type\` enum (${BASE_TYPES}) NOT NULL`);
  }
}
