import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { NOT_REJECTED_SQL } from '@apis/invoices/sdi-status';
import { lineFiscalYear } from '@apis/spending/line-year';
import { dbDay } from '@/helpers/date.helpers';
import { allocate, AllocCommitment, AllocInvoice, AllocShare } from './commitment-allocation';
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

// Una riga per fattura: importo = totale in testata, altrimenti somma delle righe;
// capitoli (JSON) delle utenze delle righe, 0 = utenza senza capitolo; quote fisse
// e quota automatica attuale (JSON).
const INVOICES_SQL =
  '/* r_invoices */ SELECT i.id, i.invoice_date AS date, i.contratto_id_fk AS contract_id, ' +
  'COALESCE(i.total_amount, (SELECT SUM(il.amount) FROM invoice_lines il WHERE il.invoice_id_fk = i.id)) AS amount, ' +
  '(SELECT MIN(il.period_start) FROM invoice_lines il WHERE il.invoice_id_fk = i.id) AS period_start, ' +
  '(SELECT MAX(il.period_end) FROM invoice_lines il WHERE il.invoice_id_fk = i.id) AS period_end, ' +
  '(SELECT JSON_ARRAYAGG(COALESCE(u.budget_chapter_code_fk, 0)) FROM invoice_lines il ' +
  'JOIN utilities u ON u.id = il.utility_id_fk WHERE il.invoice_id_fk = i.id) AS chapters, ' +
  "(SELECT JSON_ARRAYAGG(JSON_OBJECT('commitment_id', s.commitment_id_fk, 'fiscal_year', s.fiscal_year, 'amount', s.amount)) " +
  "FROM invoice_commitment_shares s WHERE s.invoice_id_fk = i.id AND s.source IN ('MANUAL', 'ACCOUNTING')) AS fixed, " +
  "(SELECT JSON_OBJECT('commitment_id', s.commitment_id_fk, 'fiscal_year', s.fiscal_year, 'amount', s.amount) " +
  "FROM invoice_commitment_shares s WHERE s.invoice_id_fk = i.id AND s.source = 'AUTO' LIMIT 1) AS auto_share " +
  `FROM invoices i WHERE i.deleted = 0 AND ${NOT_REJECTED_SQL('i')} AND (i.contratto_id_fk IN (?) OR ` +
  // Anche le quote a mano sugli impegni di fatture di contratti scollegati:
  // consumano la stessa rimanenza mostrata nella scheda.
  "EXISTS (SELECT 1 FROM invoice_commitment_shares m WHERE m.invoice_id_fk = i.id AND m.source <> 'AUTO' " +
  'AND m.commitment_id_fk IN (?)))';

const AUTO_DELETE_SQL =
  "/* r_auto_delete */ DELETE FROM invoice_commitment_shares WHERE invoice_id_fk = ? AND source = 'AUTO'";
const AUTO_INSERT_SQL =
  '/* r_auto_insert */ INSERT INTO invoice_commitment_shares (invoice_id_fk, commitment_id_fk, fiscal_year, amount, source) ' +
  "SELECT ?, ?, ?, ?, 'AUTO' FROM DUAL WHERE NOT EXISTS " +
  // Mai quote miste: con quote fisse la quota automatica non si scrive.
  "(SELECT 1 FROM invoice_commitment_shares WHERE invoice_id_fk = ? AND source <> 'AUTO')";

// Quote automatiche di fatture senza contratto: nessun impegno possibile.
const ORPHANS_SQL =
  '/* r_orphans */ DELETE s FROM invoice_commitment_shares s JOIN invoices i ON i.id = s.invoice_id_fk ' +
  "WHERE i.contratto_id_fk IS NULL AND s.source = 'AUTO'";

const ALL_CONTRACTS_SQL =
  '/* r_all */ SELECT DISTINCT i.contratto_id_fk AS contract_id FROM invoices i WHERE i.contratto_id_fk IS NOT NULL ' +
  'UNION SELECT DISTINCT contract_id FROM budget_commitment_contracts';

// Contratti in testata alle fatture con righe di queste utenze (cambio di capitolo).
const UTILITY_CONTRACTS_SQL =
  '/* r_utility_contracts */ SELECT DISTINCT i.contratto_id_fk AS contract_id FROM invoice_lines il ' +
  'JOIN invoices i ON i.id = il.invoice_id_fk WHERE il.utility_id_fk IN (?) AND i.contratto_id_fk IS NOT NULL';

interface Share {
  commitment_id: number;
  fiscal_year: number | null;
  amount: number;
}

// JSON da JSON_OBJECT/JSON_ARRAYAGG: mysql2 lo restituisce già decodificato, i mock come stringa.
const parseJson = <T>(v: unknown): T | null =>
  v === null || v === undefined || v === '' ? null : typeof v === 'string' ? (JSON.parse(v) as T) : (v as T);

const shareOf = (o: Record<string, unknown> | null): Share | null =>
  o ? { commitment_id: Number(o.commitment_id), fiscal_year: Number(o.fiscal_year), amount: Number(o.amount) } : null;

const sameShare = (a: Share | null, b: Share | null): boolean =>
  a === null || b === null
    ? a === b
    : a.commitment_id === b.commitment_id &&
      a.fiscal_year === b.fiscal_year &&
      Math.round(a.amount * 100) === Math.round(b.amount * 100);

const ids = (rows: Record<string, unknown>[]): number[] => rows.map((r) => Number(r.contract_id));

// Assegna impegno e annualità alla quota automatica delle fatture
// (commitment-allocation.ts). Le quote scelte a mano (MANUAL/ACCOUNTING) non si
// toccano, consumano solo la rimanenza; scrittura di sistema: nessun audit e
// "Ultima modifica" della fattura invariata (si scrive solo invoice_commitment_shares).
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
    // Contratto tolto dalla fattura: la sua quota automatica sparisce subito
    // (la fattura non rientra più tra quelle dei contratti ricalcolati).
    await this.dataSource.query(ORPHANS_SQL);
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
    const rows: Record<string, unknown>[] = await this.dataSource.query(INVOICES_SQL, [contracts, commitmentIds]);

    const invoices: AllocInvoice[] = [];
    // Quota automatica attuale per fattura (null = nessuna).
    const current = new Map<number, Share | null>();
    for (const r of rows) {
      const id = Number(r.id);
      const fixed = parseJson<Record<string, unknown>[]>(r.fixed) ?? [];
      current.set(id, shareOf(parseJson<Record<string, unknown>>(r.auto_share)));
      const noAmount = r.amount === null || r.amount === undefined;
      // Senza righe e senza totale non c'è un importo da imputare (le quote fisse contano comunque).
      if (noAmount && !fixed.length) continue;
      const date = dbDay(r.date) ?? '';
      const chapters = [...new Set((parseJson<unknown[]>(r.chapters) ?? []).map(Number))];
      invoices.push({
        id,
        date,
        amount: noAmount ? 0 : Number(r.amount),
        contract_id: r.contract_id === null ? undefined : Number(r.contract_id),
        // Utenza senza capitolo: 0 = nessun impegno candidato; nessuna utenza o più capitoli: null.
        chapter: chapters.length === 1 ? chapters[0] : null,
        year: lineFiscalYear(dbDay(r.period_start), dbDay(r.period_end), date),
        fixed: fixed.map((f): AllocShare => ({
          commitment_id: Number(f.commitment_id),
          fiscal_year: Number(f.fiscal_year),
          amount: Number(f.amount),
        })),
      });
    }

    const targets = allocate(commitments, invoices);
    const amounts = new Map(invoices.map((i) => [i.id, i.amount]));
    const withFixed = new Set(invoices.filter((i) => i.fixed.length).map((i) => i.id));
    for (const [id, share] of current) {
      if (withFixed.has(id)) {
        // Quote miste: la quota automatica residua si toglie.
        if (share) await this.dataSource.query(AUTO_DELETE_SQL, [id]);
        continue;
      }
      const target = targets.get(id) ?? null;
      const wanted: Share | null = target
        ? { commitment_id: target.id, fiscal_year: target.fiscal_year, amount: amounts.get(id)! }
        : null;
      if (sameShare(share, wanted)) continue;
      await this.dataSource.transaction(async (m) => {
        await m.query(AUTO_DELETE_SQL, [id]);
        if (wanted) await m.query(AUTO_INSERT_SQL, [id, wanted.commitment_id, wanted.fiscal_year, wanted.amount, id]);
      });
    }
  }
}
