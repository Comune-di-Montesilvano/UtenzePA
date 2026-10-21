import { MigrationInterface, QueryRunner } from 'typeorm';

// Tipi di utenza di base su un'installazione nuova: senza nessun tipo non si crea
// nessuna utenza, e ogni tipo è legato a una categoria fissa del codice (hard_type:
// unità di consumo, categorie ARERA, anomalie). Solo se la tabella è vuota: dove i
// tipi esistono già (anche rinominati) non cambia nulla. Nomi modificabili da UI.
const DEFAULT_TYPES: [string, string][] = [
  ['energia elettrica', 'LIGHT'],
  ['gas', 'GAS'],
  ['acqua', 'WATER'],
  ['Connettività', 'INTERNET'],
];

export class DefaultUtilityTypes1795700000000 implements MigrationInterface {
  name = 'DefaultUtilityTypes1795700000000';

  public async up(q: QueryRunner): Promise<void> {
    const [{ n }]: { n: string }[] = await q.query('SELECT COUNT(*) AS n FROM `utility_types`');
    if (Number(n) > 0) return;
    for (const [name, hardType] of DEFAULT_TYPES) {
      await q.query(
        'INSERT INTO `utility_types` (`name`, `hard_type`, `created_by_user_id`, `updated_by_user_id`) VALUES (?, ?, -1, -1)',
        [name, hardType],
      );
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    // Solo i tipi creati qui e mai usati.
    await q.query(
      'DELETE t FROM `utility_types` t WHERE t.created_by_user_id = -1 AND t.name IN (?, ?, ?, ?) ' +
        'AND NOT EXISTS (SELECT 1 FROM `utilities` u WHERE u.utility_type_id_fk = t.id) ' +
        'AND NOT EXISTS (SELECT 1 FROM `budget_chapter_utility_types` b WHERE b.utility_type_id = t.id)',
      DEFAULT_TYPES.map(([name]) => name),
    );
  }
}
