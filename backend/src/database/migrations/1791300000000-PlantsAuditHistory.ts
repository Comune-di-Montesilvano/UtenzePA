import { MigrationInterface, QueryRunner } from 'typeorm';

// Lo storico degli impianti termici v1.6.0 era registrato con entity_name
// 'thermal_plants': la migration Plants conserva gli id, quindi basta
// rinominare l'entità perché il tab Storico dell'impianto lo mostri.
export class PlantsAuditHistory1791300000000 implements MigrationInterface {
  name = 'PlantsAuditHistory1791300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE \`audit_logs\` SET \`entity_name\` = 'plants' WHERE \`entity_name\` = 'thermal_plants'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE \`audit_logs\` SET \`entity_name\` = 'thermal_plants' WHERE \`entity_name\` = 'plants' AND \`entity_id\` IN (SELECT \`id\` FROM \`plants\` WHERE \`type\` = 'THERMAL')`,
    );
  }
}
