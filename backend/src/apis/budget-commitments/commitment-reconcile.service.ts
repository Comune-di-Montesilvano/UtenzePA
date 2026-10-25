import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { NOT_REJECTED_SQL } from '@apis/invoices/sdi-status';
import { lineYearSql } from '@apis/spending/line-year';
import { dbDay } from '@apis/utility-supply/supply-reconcile.service';
import { allocate, AllocCommitment, AllocLine } from './commitment-allocation';
import { annualityFor } from './annuality';
import { idList } from './id-list';

// Contratti che condividono un impegno con quelli dati: la rimanenza di un
// impegno è una sola, quindi si ricalcolano insieme.
const CLOSURE_SQL =
  '/* r_closure */ SELECT DISTINCT b2.contract_id FROM budget_commitment_contracts b1 ' +
  'JOIN budget_commitments bc ON bc.id = b1.commitment_id AND bc.deleted = 0 ' +
  'JOIN budget_commitment_contracts b2 ON b2.commitment_id = b1.commitment_id ' +
  'WHERE b1.contract_id IN (?)';

// Una riga per annualità: un pluriennale compare una volta per esercizio.
const COMMITMENTS_SQL =
  '/* r_commitments */ SELECT bc.id, bc.commitment_year AS year, bc.commitment_num AS num, ' +
  'bc.commitment_sub AS sub, bcy.amount, bc.budget_chapter_id_fk AS chapter, bcy.fiscal_year, ' +
  '(SELECT JSON_ARRAYAGG(bcc.contract_id) FROM budget_commitment_contracts bcc WHERE bcc.commitment_id = bc.id) AS contract_ids ' +
  'FROM budget_commitments bc JOIN budget_commitment_years bcy ON bcy.commitment_id = bc.id ' +
  'WHERE bc.deleted = 0 AND EXISTS (SELECT 1 FROM budget_commitment_contracts x ' +
  'WHERE x.commitment_id = bc.id AND x.contract_id IN (?))';

// Annualità degli impegni scelti a mano sulle righe (anche fuori dai contratti).
const YEARS_SQL =
  '/* r_years */ SELECT commitment_id, fiscal_year FROM budget_commitment_years WHERE commitment_id IN (?)';

const LINES_SQL =
  '/* r_lines */ SELECT il.id, il.amount, i.invoice_date AS date, il.commitment_auto AS auto, ' +
  'il.commitment_id_fk AS commitment_id, il.commitment_fiscal_year AS fiscal_year, ' +
  'i.contratto_id_fk AS contract_id, il.utility_id_fk AS utility_id, ' +
  `u.budget_chapter_code_fk AS chapter, ${lineYearSql({ line: 'il', invoice: 'i' })} AS year ` +
  'FROM invoice_lines il ' +
  `JOIN invoices i ON i.id = il.invoice_id_fk AND i.deleted = 0 AND ${NOT_REJECTED_SQL('i')} ` +
  'LEFT JOIN utilities u ON u.id = il.utility_id_fk ' +
  // Anche le righe manuali sugli impegni di fatture di contratti scollegati:
  // consumano la stessa rimanenza mostrata nella scheda.
  'WHERE i.contratto_id_fk IN (?) OR (il.commitment_auto = 0 AND il.commitment_id_fk IN (?))';

const WRITE_SQL =
  '/* r_write */ UPDATE invoice_lines SET commitment_id_fk = ?, commitment_fiscal_year = ? ' +
  'WHERE id IN (?) AND commitment_auto = 1';
const MANUAL_YEAR_SQL =
  '/* r_manual_year */ UPDATE invoice_lines SET commitment_fiscal_year = ? WHERE id IN (?) AND commitment_auto = 0';

// Righe automatiche di fatture senza contratto: nessun impegno possibile.
const ORPHANS_SQL =
  '/* r_orphans */ UPDATE invoice_lines il JOIN invoices i ON i.id = il.invoice_id_fk ' +
  'SET il.commitment_id_fk = NULL, il.commitment_fiscal_year = NULL ' +
  'WHERE i.contratto_id_fk IS NULL AND il.commitment_auto = 1 ' +
  'AND il.commitment_id_fk IS NOT NULL';

const ALL_CONTRACTS_SQL =
  '/* r_all */ SELECT DISTINCT i.contratto_id_fk AS contract_id FROM invoices i WHERE i.contratto_id_fk IS NOT NULL ' +
  'UNION SELECT DISTINCT contract_id FROM budget_commitment_contracts';

// Contratti in testata alle fatture con righe di queste utenze (cambio di capitolo).
const UTILITY_CONTRACTS_SQL =
  '/* r_utility_contracts */ SELECT DISTINCT i.contratto_id_fk AS contract_id FROM invoice_lines il ' +
  'JOIN invoices i ON i.id = il.invoice_id_fk WHERE il.utility_id_fk IN (?) AND i.contratto_id_fk IS NOT NULL';

const ids = (rows: Record<string, unknown>[]): number[] => rows.map((r) => Number(r.contract_id));

// Assegna impegno e annualità alle righe di fattura automatiche
// (commitment-allocation.ts). Delle righe scelte a mano si aggiorna solo
// l'annualità (annuality.ts), mai l'impegno; scrittura di sistema: nessun audit e
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
    // Un giro fallito non blocca i successivi: la coda riparte dal catch,
    // il chiamante riceve comunque l'esito del proprio giro.
    const next = this.chain.catch(() => undefined).then(async () => {
      const batch = [...this.pending];
      this.pending.clear();
      if (batch.length) await this.run(batch);
    });
    this.chain = next;
    return next;
  }

  // Dopo un salvataggio già confermato: un errore non fa fallire la richiesta,
  // il giro all'avvio riallinea.
  async reconcileSafe(contractIds: number[]): Promise<void> {
    try {
      await this.reconcileContracts(contractIds);
    } catch (e) {
      this.logger.error(`Consumo impegni fallito per i contratti ${contractIds.join(', ')}`, e as Error);
    }
  }

  // Capitolo dell'utenza cambiato: le sue righe automatiche cambiano capitolo.
  async reconcileUtilities(utilityIds: number[]): Promise<void> {
    if (!utilityIds.length) return;
    try {
      const contracts = ids(await this.dataSource.query(UTILITY_CONTRACTS_SQL, [utilityIds]));
      if (contracts.length) await this.reconcileContracts(contracts);
    } catch (e) {
      this.logger.error(`Consumo impegni fallito per le utenze ${utilityIds.join(', ')}`, e as Error);
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
        contract_ids: idList(r.contract_ids),
      }),
    );
    // [-1]: IN () vuoto non è SQL valido.
    const commitmentIds = commitments.length ? [...new Set(commitments.map((c) => c.id))] : [-1];
    const rows: Record<string, unknown>[] = await this.dataSource.query(LINES_SQL, [contracts, commitmentIds]);
    const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
    const current = new Map(rows.map((r) => [Number(r.id), `${num(r.commitment_id)}:${num(r.fiscal_year)}`]));
    const lines: AllocLine[] = rows.map((r) => ({
      id: Number(r.id),
      amount: Number(r.amount),
      date: dbDay(r.date) ?? '',
      auto: Number(r.auto) === 1,
      commitment_id: num(r.commitment_id),
      fiscal_year: num(r.fiscal_year),
      contract_id: Number(r.contract_id),
      // Utenza senza capitolo: 0 = nessun impegno candidato; senza utenza: null.
      chapter: r.utility_id === null ? null : r.chapter === null ? 0 : Number(r.chapter),
      year: Number(r.year),
    }));

    // Righe a mano: annualità dell'anno della riga, altrimenti la più vicina.
    const manual = lines.filter((l) => !l.auto && l.commitment_id !== null);
    const manualIds = [...new Set(manual.map((l) => l.commitment_id!))];
    const years = new Map<number, number[]>();
    if (manualIds.length) {
      for (const r of await this.dataSource.query(YEARS_SQL, [manualIds])) {
        const id = Number(r.commitment_id);
        years.set(id, [...(years.get(id) ?? []), Number(r.fiscal_year)]);
      }
    }
    const byManualYear = new Map<number | null, number[]>();
    for (const l of manual) {
      const year = annualityFor(years.get(l.commitment_id!) ?? [], l.year!);
      if (year !== l.fiscal_year) byManualYear.set(year, [...(byManualYear.get(year) ?? []), l.id]);
      l.fiscal_year = year;
    }
    for (const [year, lineIds] of byManualYear) {
      await this.dataSource.query(MANUAL_YEAR_SQL, [year, lineIds]);
    }

    const byTarget = new Map<string, { id: number | null; year: number | null; lines: number[] }>();
    for (const [lineId, target] of allocate(commitments, lines)) {
      const key = `${target?.id ?? null}:${target?.fiscal_year ?? null}`;
      if (current.get(lineId) === key) continue;
      const group = byTarget.get(key) ?? { id: target?.id ?? null, year: target?.fiscal_year ?? null, lines: [] };
      group.lines.push(lineId);
      byTarget.set(key, group);
    }
    for (const { id, year, lines: lineIds } of byTarget.values()) {
      await this.dataSource.query(WRITE_SQL, [id, year, lineIds]);
    }
  }
}
