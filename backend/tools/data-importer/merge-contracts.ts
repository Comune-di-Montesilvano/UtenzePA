// Accorpamento contratti duplicati per ordine CONSIP.
//
// L'Access originale collegava un contratto a una sola utenza: l'import ha
// quindi creato un contratto per utenza anche quando l'ordine CONSIP era lo
// stesso (es. ordine 9029295 → 160 contratti). Qui ogni gruppo con lo stesso
// ordine diventa un solo contratto collegato a tutte le utenze:
//  - superstite = contratto con id minore;
//  - campi = valore di maggioranza nel gruppo (o override esplicito sotto),
//    i valori scartati finiscono nel report;
//  - collegamenti utenze e fatture spostati sul superstite;
//  - gli altri contratti vengono cancellati (soft delete).
// Contratti senza ordine CONSIP non vengono toccati.
//
// Uso (default: prova, nessuna scrittura; --apply scrive in transazione):
//   docker exec utenzepa-api-1 node -r ts-node/register -r tsconfig-paths/register tools/data-importer/merge-contracts.ts [--apply]
// Report completo in /tmp/merge-contracts-report.txt nel container.
import 'reflect-metadata';
import * as fs from 'fs';
import dataSource from '../../src/database/data-source';
import { ContractRow, MERGED_FIELDS, MergedField, planMerge } from './merge-contracts.lib';

const APPLY = process.argv.includes('--apply');
const REPORT_PATH = '/tmp/merge-contracts-report.txt';
const SYSTEM_USER_ID = 1;

// Gruppi con dati incoerenti decisi a mano (fornitore/convenzione compilati
// in modo disomogeneo in Access): valori per codice fornitore / nome convenzione.
const OVERRIDES: Record<string, { supplierCode?: string; agreementName?: string }> = {
  '7727462': { supplierCode: 'A2A', agreementName: 'CONSIP Energia Elettrica 18- Lotto 12' },
};

const fmt = (v: unknown): string => (v === null || v === undefined ? '—' : String(v));

async function run(): Promise<void> {
  await dataSource.initialize();
  const qr = dataSource.createQueryRunner();
  await qr.connect();
  if (APPLY) await qr.startTransaction();

  const lines: string[] = [];
  let mergedGroups = 0;
  let removedTotal = 0;

  try {
    const contracts: (ContractRow & { consip_order: string })[] = await qr.query(
      `SELECT id, TRIM(consip_order) AS consip_order, ${MERGED_FIELDS.map((f) => `\`${f}\``).join(', ')}
       FROM contracts WHERE deleted = 0 AND TRIM(IFNULL(consip_order, '')) <> ''`,
    );
    const groups = new Map<string, ContractRow[]>();
    for (const c of contracts) {
      groups.set(c.consip_order, [...(groups.get(c.consip_order) ?? []), { ...c, id: Number(c.id) }]);
    }

    for (const [order, group] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
      if (group.length < 2) continue;

      const overrides: Partial<Record<MergedField, unknown>> = {};
      const override = OVERRIDES[order];
      if (override?.supplierCode) {
        const [row] = await qr.query('SELECT id FROM suppliers WHERE supplier_id = ? AND deleted = 0', [override.supplierCode]);
        if (!row) throw new Error(`Fornitore ${override.supplierCode} non trovato (ordine ${order})`);
        overrides.supplier_id_fk = Number(row.id);
      }
      if (override?.agreementName) {
        const [row] = await qr.query('SELECT id FROM consip_agreement WHERE name = ? AND deleted = 0', [override.agreementName]);
        if (!row) throw new Error(`Convenzione "${override.agreementName}" non trovata (ordine ${order})`);
        overrides.consip_agreement_id = Number(row.id);
      }

      const plan = planMerge(group, overrides);
      const removed = plan.removedIds;
      const [{ n: invoices }] = await qr.query(
        `SELECT COUNT(*) AS n FROM invoices WHERE contratto_id_fk IN (${removed.map(() => '?').join(',')})`,
        removed,
      );

      lines.push(
        `\nOrdine ${order}: ${group.length} contratti → contratto ${plan.survivorId}` +
          ` (${removed.length} cancellati, ${Number(invoices)} fatture spostate)`,
      );
      lines.push(`  campi: ${MERGED_FIELDS.map((f) => `${f}=${fmt(plan.fields[f])}`).join(', ')}`);
      for (const d of plan.divergences) {
        const [{ utilities }] = await qr.query(
          `SELECT GROUP_CONCAT(u.utility_id) AS utilities FROM contract_utilities cu
           JOIN utilities u ON u.id = cu.utility_id WHERE cu.contract_id = ?`,
          [d.contractId],
        );
        lines.push(`  scartato ${d.field}=${fmt(d.value)} (contratto ${d.contractId}, utenza ${fmt(utilities)}) → ${fmt(d.chosen)}`);
      }

      if (APPLY) {
        const placeholders = removed.map(() => '?').join(',');
        await qr.query(
          `UPDATE contracts SET ${MERGED_FIELDS.map((f) => `\`${f}\` = ?`).join(', ')}, updated_by_user_id = ? WHERE id = ?`,
          [...MERGED_FIELDS.map((f) => plan.fields[f]), SYSTEM_USER_ID, plan.survivorId],
        );
        await qr.query(
          `INSERT IGNORE INTO contract_utilities (contract_id, utility_id)
           SELECT ?, utility_id FROM contract_utilities WHERE contract_id IN (${placeholders})`,
          [plan.survivorId, ...removed],
        );
        await qr.query(`DELETE FROM contract_utilities WHERE contract_id IN (${placeholders})`, removed);
        await qr.query(
          `UPDATE invoices SET contratto_id_fk = ? WHERE contratto_id_fk IN (${placeholders})`,
          [plan.survivorId, ...removed],
        );
        await qr.query(
          `UPDATE contracts SET deleted = 1, updated_by_user_id = ? WHERE id IN (${placeholders})`,
          [SYSTEM_USER_ID, ...removed],
        );
      }
      mergedGroups++;
      removedTotal += removed.length;
    }

    if (APPLY) await qr.commitTransaction();
  } catch (error) {
    if (APPLY) await qr.rollbackTransaction();
    throw error;
  } finally {
    await qr.release();
    await dataSource.destroy();
  }

  const header = `MODALITÀ: ${APPLY ? 'APPLY (scritto su DB)' : 'PROVA (nessuna scrittura)'}\n${mergedGroups} gruppi accorpati, ${removedTotal} contratti cancellati`;
  fs.writeFileSync(REPORT_PATH, [header, ...lines].join('\n'));
  console.log(`${APPLY ? 'APPLY' : 'PROVA'}: ${mergedGroups} gruppi, ${removedTotal} contratti cancellati → ${REPORT_PATH}`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
