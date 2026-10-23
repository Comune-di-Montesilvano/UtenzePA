import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { NOT_REJECTED_SQL } from '@apis/invoices/sdi-status';
import { lineYearSql } from '@apis/spending/line-year';
import { dbDay } from '@apis/utility-supply/supply-reconcile.service';
import { allocate, AllocCommitment, AllocLine } from './commitment-allocation';

// Contratti che condividono un impegno con quelli dati: la rimanenza di un
// impegno è una sola, quindi si ricalcolano insieme.
const CLOSURE_SQL =
  '/* r_closure */ SELECT DISTINCT b2.contract_id FROM budget_commitment_contracts b1 ' +
  'JOIN budget_commitments bc ON bc.id = b1.commitment_id AND bc.deleted = 0 ' +
  'JOIN budget_commitment_contracts b2 ON b2.commitment_id = b1.commitment_id ' +
  'WHERE b1.contract_id IN (?)';

const COMMITMENTS_SQL =
  '/* r_commitments */ SELECT bc.id, bc.commitment_year AS year, bc.commitment_num AS num, ' +
  'bc.commitment_sub AS sub, bc.amount, bc.budget_chapter_id_fk AS chapter, bc.fiscal_year, ' +
  'GROUP_CONCAT(bcc.contract_id) AS contract_ids ' +
  'FROM budget_commitments bc JOIN budget_commitment_contracts bcc ON bcc.commitment_id = bc.id ' +
  'WHERE bc.deleted = 0 AND bcc.contract_id IN (?) GROUP BY bc.id';

const LINES_SQL =
  '/* r_lines */ SELECT il.id, il.amount, i.invoice_date AS date, il.commitment_auto AS auto, ' +
  'il.commitment_id_fk AS commitment_id, i.contract_id_fk AS contract_id, il.utility_id_fk AS utility_id, ' +
  `u.budget_chapter_code_fk AS chapter, ${lineYearSql({ line: 'il', invoice: 'i' })} AS year ` +
  'FROM invoice_lines il ' +
  `JOIN invoices i ON i.id = il.invoice_id_fk AND i.deleted = 0 AND ${NOT_REJECTED_SQL('i')} ` +
  'LEFT JOIN utilities u ON u.id = il.utility_id_fk ' +
  'WHERE i.contract_id_fk IN (?)';

const WRITE_SQL =
  '/* r_write */ UPDATE invoice_lines SET commitment_id_fk = ? WHERE id IN (?) AND commitment_auto = 1';

// Righe automatiche di fatture senza contratto: nessun impegno possibile.
const ORPHANS_SQL =
  '/* r_orphans */ UPDATE invoice_lines il JOIN invoices i ON i.id = il.invoice_id_fk ' +
  'SET il.commitment_id_fk = NULL WHERE i.contract_id_fk IS NULL AND il.commitment_auto = 1 ' +
  'AND il.commitment_id_fk IS NOT NULL';

const ALL_CONTRACTS_SQL =
  '/* r_all */ SELECT DISTINCT contract_id_fk AS contract_id FROM invoices WHERE contract_id_fk IS NOT NULL ' +
  'UNION SELECT DISTINCT contract_id FROM budget_commitment_contracts';

const ids = (rows: Record<string, unknown>[]): number[] => rows.map((r) => Number(r.contract_id));

// Assegna l'impegno alle righe di fattura automatiche (commitment-allocation.ts).
// Le righe scelte a mano non si toccano; scrittura di sistema: nessun audit e
// "Ultima modifica" della fattura invariata (si aggiorna solo invoice_lines).
// Le chiamate si accodano: contratti già in attesa non fanno un secondo giro.
@Injectable()
export class CommitmentReconcileService implements OnApplicationBootstrap {
  private readonly logger = new Logger(CommitmentReconcileService.name);
  private chain: Promise<void> = Promise.resolve();
  private readonly pending = new Set<number>();

  constructor(private readonly dataSource: DataSource) {}

  onApplicationBootstrap(): void {
    void this.reconcileAll().catch((e: Error) => this.logger.error('Consumo impegni all’avvio fallito', e));
  }

  reconcileContracts(contractIds: number[]): Promise<void> {
    contractIds.filter((id) => !!id).forEach((id) => this.pending.add(Number(id)));
    this.chain = this.chain.then(async () => {
      const batch = [...this.pending];
      this.pending.clear();
      if (batch.length) await this.run(batch);
    });
    return this.chain;
  }

  // Dopo un salvataggio già confermato: un errore non fa fallire la richiesta,
  // il giro all'avvio riallinea.
  async reconcileSafe(contractIds: number[]): Promise<void> {
    try {
      await this.reconcileContracts(contractIds);
    } catch (e) {
      this.chain = Promise.resolve();
      this.logger.error(`Consumo impegni fallito per i contratti ${contractIds.join(', ')}`, e as Error);
    }
  }

  async reconcileAll(): Promise<void> {
    await this.dataSource.query(ORPHANS_SQL);
    await this.reconcileContracts(ids(await this.dataSource.query(ALL_CONTRACTS_SQL)));
  }

  private async closure(start: number[]): Promise<number[]> {
    const all = new Set(start);
    let frontier = [...all];
    while (frontier.length) {
      const found = ids(await this.dataSource.query(CLOSURE_SQL, [frontier]));
      frontier = found.filter((id) => !all.has(id));
      frontier.forEach((id) => all.add(id));
    }
    return [...all].sort((a, b) => a - b);
  }

  private async run(start: number[]): Promise<void> {
    const contracts = await this.closure(start);
    const commitments: AllocCommitment[] = (await this.dataSource.query(COMMITMENTS_SQL, [contracts])).map(
      (r: Record<string, unknown>) => ({
        id: Number(r.id),
        year: r.year === null ? null : Number(r.year),
        num: r.num === null ? null : Number(r.num),
        sub: r.sub === null ? null : Number(r.sub),
        amount: r.amount === null ? null : Number(r.amount),
        chapter: Number(r.chapter),
        fiscal_year: Number(r.fiscal_year),
        contract_ids: String(r.contract_ids).split(',').map(Number),
      }),
    );
    const rows: Record<string, unknown>[] = await this.dataSource.query(LINES_SQL, [contracts]);
    const current = new Map(rows.map((r) => [Number(r.id), r.commitment_id === null ? null : Number(r.commitment_id)]));
    const lines: AllocLine[] = rows.map((r) => ({
      id: Number(r.id),
      amount: Number(r.amount),
      date: dbDay(r.date) ?? '',
      auto: Number(r.auto) === 1,
      commitment_id: r.commitment_id === null ? null : Number(r.commitment_id),
      contract_id: Number(r.contract_id),
      // Utenza senza capitolo: 0 = nessun impegno candidato; senza utenza: null.
      chapter: r.utility_id === null ? null : r.chapter === null ? 0 : Number(r.chapter),
      year: Number(r.year),
    }));

    const byTarget = new Map<number | null, number[]>();
    for (const [lineId, target] of allocate(commitments, lines)) {
      if (current.get(lineId) === target) continue;
      byTarget.set(target, [...(byTarget.get(target) ?? []), lineId]);
    }
    for (const [target, lineIds] of byTarget) {
      await this.dataSource.query(WRITE_SQL, [target, lineIds]);
    }
  }
}
