import { EntityManager } from 'typeorm';

// SQL a mano: comando di sessione MySQL, senza equivalente in TypeORM.
// Vincoli FK sospesi per la sola connessione della transazione, ripristinati comunque.
export async function withoutForeignKeyChecks<T>(
  manager: EntityManager,
  fn: () => Promise<T>,
): Promise<T> {
  await manager.query('SET FOREIGN_KEY_CHECKS=0');
  try {
    return await fn();
  } finally {
    await manager.query('SET FOREIGN_KEY_CHECKS=1');
  }
}
