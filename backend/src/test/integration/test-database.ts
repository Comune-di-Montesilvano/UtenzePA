// Database dei test d'integrazione: viene cancellato e ricreato a ogni giro, quindi
// il nome deve finire con `_it` (mai il database di lavoro `mydatabase`).
export const DEFAULT_TEST_DATABASE = 'utenzepa_it';

export function assertTestDatabase(name: string | undefined): string {
  const db = name === undefined ? DEFAULT_TEST_DATABASE : name;
  if (!db.endsWith('_it')) {
    throw new Error(`Database dei test d'integrazione "${db}": il nome deve finire con _it`);
  }
  return db;
}
