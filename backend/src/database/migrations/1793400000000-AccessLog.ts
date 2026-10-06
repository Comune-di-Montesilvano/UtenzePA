import { MigrationInterface, QueryRunner } from 'typeorm';

// Log accessi nel registro attività: login (canale in new_value), logout e
// scadenza per inattività, con entity_name = 'access'.
export class AccessLog1793400000000 implements MigrationInterface {
  name = 'AccessLog1793400000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      "ALTER TABLE `audit_logs` MODIFY `action` enum ('CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'TIMEOUT') NOT NULL",
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query("DELETE FROM `audit_logs` WHERE `action` IN ('LOGIN', 'LOGOUT', 'TIMEOUT')");
    await q.query(
      "ALTER TABLE `audit_logs` MODIFY `action` enum ('CREATE', 'UPDATE', 'DELETE') NOT NULL",
    );
  }
}
