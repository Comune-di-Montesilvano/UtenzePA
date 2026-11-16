import type { Connection, RowDataPacket } from 'mysql2/promise';

// SQL a mano: il backup copia e ripristina l'intero database (tutte le tabelle, anche
// senza entity) su una connessione mysql2 dedicata, fuori da TypeORM.

export async function listTables(conn: Connection): Promise<string[]> {
  const [tables] = await conn.query<RowDataPacket[]>('SHOW TABLES');
  return tables.map((row) => Object.values(row)[0] as string);
}

export async function createTableSql(conn: Connection, table: string): Promise<string> {
  const [[row]] = await conn.query<RowDataPacket[]>(`SHOW CREATE TABLE \`${table}\``);
  return row['Create Table'] as string;
}

export async function tableRows(conn: Connection, table: string): Promise<RowDataPacket[]> {
  const [rows] = await conn.query<RowDataPacket[]>(`SELECT * FROM \`${table}\``);
  return rows;
}

// Il dump ha un INSERT per riga: con autocommit ogni riga aspetta il commit su disco
// (minuti con le tabelle acc_*). Senza, si committa a ogni DROP/CREATE (commit implicito
// del DDL), cioè una volta per tabella. A blocchi sulla stessa connessione: le SET in
// testa al dump (FOREIGN_KEY_CHECKS, SQL_MODE) valgono per tutta la sessione.
export async function replayDump(conn: Connection, batches: Iterable<string>): Promise<void> {
  await conn.query('SET autocommit=0');
  for (const batch of batches) {
    await conn.query(batch);
  }
  await conn.query('COMMIT');
}
