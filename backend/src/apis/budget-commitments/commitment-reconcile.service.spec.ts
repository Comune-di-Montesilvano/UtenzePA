import { DataSource } from 'typeorm';
import { CommitmentReconcileService } from './commitment-reconcile.service';
import * as q from './commitment-reconcile.queries';
import * as sql from './commitment-reconcile.sql';

jest.mock('./commitment-reconcile.queries');
jest.mock('./commitment-reconcile.sql');
const mq = jest.mocked(q);
const ms = jest.mocked(sql);

type Row = Record<string, unknown>;

// Letture e scritture simulate per nome, tutte instradate su `query` con un tag
// r_… (così un test può farne fallire una). Le query vere sono provate in
// commitment-reconcile.int-spec.ts.
function fakeDataSource(data: { closure?: Row[]; commitments?: Row[]; invoices?: Row[] }) {
  const calls: { sql: string; params: unknown[] }[] = [];
  const query = jest.fn(async (tag: string, params: unknown[] = []) => {
    calls.push({ sql: tag, params });
    if (tag.includes('/* r_closure */')) return data.closure ?? [];
    if (tag.includes('/* r_commitments */')) return data.commitments ?? [];
    if (tag.includes('/* r_invoices */')) return data.invoices ?? [];
    return [];
  });
  const contracts = (rows: Row[]) => rows.map((r) => Number(r.contract_id));
  mq.sharingContracts.mockImplementation(async (_m, ids) =>
    contracts(await query('/* r_closure */', [ids])),
  );
  mq.contractCommitmentYears.mockImplementation((_m, ids) => query('/* r_commitments */', [ids]));
  mq.reconcileInvoices.mockImplementation((_m, ids, commitmentIds) =>
    query('/* r_invoices */', [ids, commitmentIds]),
  );
  mq.dropAutoShare.mockImplementation(
    async (_m, id) => void (await query('/* r_auto_delete */', [id])),
  );
  mq.dropOrphanAutoShares.mockImplementation(async () => void (await query('/* r_orphans */')));
  mq.allContracts.mockImplementation(async () => contracts(await query('/* r_all */')));
  mq.utilityContracts.mockImplementation(async (_m, ids) =>
    contracts(await query('/* r_utility_contracts */', [ids])),
  );
  ms.insertAutoShare.mockImplementation(async (_m, id, share) => {
    await query('/* r_auto_insert */', [
      id,
      share.commitment_id,
      share.fiscal_year,
      share.amount,
      id,
    ]);
  });
  const transaction = async (cb: (m: object) => Promise<void>) => cb({});
  return { ds: { query, transaction, manager: {} } as unknown as DataSource, calls };
}

const tagged = (calls: { sql: string; params: unknown[] }[], tag: string) =>
  calls.filter((c) => c.sql.includes(`/* ${tag} */`));
const inserts = (calls: { sql: string; params: unknown[] }[]) => tagged(calls, 'r_auto_insert');
const deletes = (calls: { sql: string; params: unknown[] }[]) => tagged(calls, 'r_auto_delete');

const commitment = (id: number, num: number, amount: number, contracts = '1') => ({
  id,
  year: 2026,
  num,
  sub: 1,
  amount,
  chapter: 7,
  fiscal_year: 2026,
  contract_ids: contracts,
});

// Una fattura per riga di r_invoices: data, importo, contratto, periodo, capitoli
// delle utenze (JSON), quote fisse (JSON), quota automatica attuale (JSON).
const invoice = (id: number, amount: number | null, date: string, extra: Row = {}) => ({
  id,
  date,
  amount,
  contract_id: 1,
  period_start: null,
  period_end: null,
  chapters: '[7]',
  fixed: null,
  auto_share: null,
  ...extra,
});

describe('CommitmentReconcileService', () => {
  it('assegna le fatture automatiche in ordine di numero', async () => {
    const { ds, calls } = fakeDataSource({
      commitments: [commitment(20, 1886, 50), commitment(10, 521, 100)],
      invoices: [
        invoice(1, 60, '2026-01-10'),
        invoice(2, 60, '2026-02-10'),
        invoice(3, 60, '2026-03-10'),
      ],
    });
    await new CommitmentReconcileService(ds).reconcileContracts([1]);
    expect(inserts(calls).map((c) => c.params)).toEqual([
      [1, 10, 2026, 60, 1],
      [2, 10, 2026, 60, 2],
      [3, 20, 2026, 60, 3],
    ]);
    expect(deletes(calls).map((c) => c.params)).toEqual([[1], [2], [3]]);
  });

  it('una quota automatica invariata non viene riscritta', async () => {
    const { ds, calls } = fakeDataSource({
      commitments: [commitment(10, 521, 100)],
      invoices: [
        invoice(1, 5, '2026-01-10', {
          auto_share: JSON.stringify({ commitment_id: 10, fiscal_year: 2026, amount: 5 }),
        }),
      ],
    });
    await new CommitmentReconcileService(ds).reconcileContracts([1]);
    expect(inserts(calls)).toHaveLength(0);
    expect(deletes(calls)).toHaveLength(0);
  });

  it('una quota automatica cambiata si riscrive solo per quella fattura', async () => {
    const { ds, calls } = fakeDataSource({
      commitments: [commitment(10, 521, 100), commitment(20, 600, 100)],
      invoices: [
        invoice(1, 5, '2026-01-10', {
          auto_share: { commitment_id: 10, fiscal_year: 2026, amount: 5 },
        }),
        invoice(2, 7, '2026-01-11', {
          auto_share: { commitment_id: 10, fiscal_year: 2026, amount: 9 },
        }),
      ],
    });
    await new CommitmentReconcileService(ds).reconcileContracts([1]);
    expect(deletes(calls).map((c) => c.params)).toEqual([[2]]);
    expect(inserts(calls).map((c) => c.params)).toEqual([[2, 10, 2026, 7, 2]]);
  });

  it('una fattura con quote fisse non viene scritta ma consuma la rimanenza', async () => {
    const { ds, calls } = fakeDataSource({
      commitments: [commitment(10, 521, 100), commitment(20, 600, 100)],
      invoices: [
        invoice(1, 95, '2026-01-10', {
          fixed: [{ commitment_id: 10, fiscal_year: 2026, amount: '95.00' }],
        }),
        invoice(2, 20, '2026-01-11'),
      ],
    });
    await new CommitmentReconcileService(ds).reconcileContracts([1]);
    expect(inserts(calls).map((c) => c.params)).toEqual([[2, 10, 2026, 20, 2]]);
    expect(inserts(calls).every((c) => c.params[0] !== 1)).toBe(true);
    expect(deletes(calls).every((c) => c.params[0] !== 1)).toBe(true);
  });

  it('una fattura con quote fisse e una quota automatica residua: la automatica si toglie', async () => {
    const { ds, calls } = fakeDataSource({
      commitments: [commitment(10, 521, 100)],
      invoices: [
        invoice(1, 5, '2026-01-10', {
          fixed: [{ commitment_id: 10, fiscal_year: 2026, amount: 5 }],
          auto_share: { commitment_id: 10, fiscal_year: 2026, amount: 5 },
        }),
      ],
    });
    await new CommitmentReconcileService(ds).reconcileContracts([1]);
    expect(deletes(calls).map((c) => c.params)).toEqual([[1]]);
    expect(inserts(calls)).toHaveLength(0);
  });

  it('senza righe e senza totale ma con quote fisse: consumano comunque la rimanenza', async () => {
    const { ds, calls } = fakeDataSource({
      commitments: [commitment(10, 521, 100), commitment(20, 600, 100)],
      invoices: [
        invoice(1, null, '2026-01-10', {
          chapters: null,
          fixed: [{ commitment_id: 10, fiscal_year: 2026, amount: 95 }],
        }),
        invoice(2, 20, '2026-01-11'),
      ],
    });
    await new CommitmentReconcileService(ds).reconcileContracts([1]);
    expect(inserts(calls).map((c) => c.params)).toEqual([[2, 10, 2026, 20, 2]]);
  });

  it("la quota a mano di una fattura di un altro contratto abbassa la rimanenza dell'impegno", async () => {
    const { ds, calls } = fakeDataSource({
      commitments: [commitment(10, 521, 100), commitment(20, 600, 100)],
      invoices: [
        invoice(5, 100, '2026-01-01', {
          contract_id: 2,
          fixed: [{ commitment_id: 10, fiscal_year: 2026, amount: 100 }],
        }),
        invoice(1, 30, '2026-01-10'),
      ],
    });
    await new CommitmentReconcileService(ds).reconcileContracts([1]);
    expect(inserts(calls).map((c) => c.params)).toEqual([[1, 20, 2026, 30, 1]]);
  });

  it('la competenza viene dal periodo delle righe', async () => {
    const { ds, calls } = fakeDataSource({
      commitments: [commitment(10, 528, 100), { ...commitment(10, 528, 30), fiscal_year: 2027 }],
      invoices: [
        invoice(1, 20, '2026-12-20', { period_start: '2027-01-01', period_end: '2027-02-28' }),
      ],
    });
    await new CommitmentReconcileService(ds).reconcileContracts([1]);
    expect(inserts(calls).map((c) => c.params)).toEqual([[1, 10, 2027, 20, 1]]);
  });

  it('una fattura senza righe e senza totale non ha quota', async () => {
    const { ds, calls } = fakeDataSource({
      commitments: [commitment(10, 521, 100)],
      invoices: [
        invoice(1, null, '2026-01-10', {
          chapters: null,
          auto_share: { commitment_id: 10, fiscal_year: 2026, amount: 5 },
        }),
      ],
    });
    await new CommitmentReconcileService(ds).reconcileContracts([1]);
    expect(inserts(calls)).toHaveLength(0);
    expect(deletes(calls).map((c) => c.params)).toEqual([[1]]);
  });

  it('senza impegni la quota automatica esistente si toglie', async () => {
    const { ds, calls } = fakeDataSource({
      invoices: [
        invoice(1, 10, '2026-01-10', {
          auto_share: { commitment_id: 99, fiscal_year: 2026, amount: 10 },
        }),
      ],
    });
    await new CommitmentReconcileService(ds).reconcileContracts([1]);
    expect(deletes(calls).map((c) => c.params)).toEqual([[1]]);
    expect(inserts(calls)).toHaveLength(0);
  });

  it('una fattura con utenza senza capitolo non prende impegni', async () => {
    const { ds, calls } = fakeDataSource({
      commitments: [commitment(10, 521, 100)],
      invoices: [invoice(1, 10, '2026-01-10', { chapters: '[0]' })],
    });
    await new CommitmentReconcileService(ds).reconcileContracts([1]);
    expect(inserts(calls)).toHaveLength(0);
  });

  it('utenze di capitoli diversi: capitolo non univoco, nessun candidato se gli impegni differiscono', async () => {
    const { ds, calls } = fakeDataSource({
      commitments: [commitment(10, 521, 100), { ...commitment(20, 600, 100), chapter: 8 }],
      invoices: [invoice(1, 10, '2026-01-10', { chapters: '[7, 8, 7]' })],
    });
    await new CommitmentReconcileService(ds).reconcileContracts([1]);
    expect(inserts(calls)).toHaveLength(0);
  });

  it('senza utenze (capitoli null) usa gli impegni del contratto', async () => {
    const { ds, calls } = fakeDataSource({
      commitments: [commitment(10, 521, 100)],
      invoices: [invoice(1, 10, '2026-01-10', { chapters: null })],
    });
    await new CommitmentReconcileService(ds).reconcileContracts([1]);
    expect(inserts(calls).map((c) => c.params)).toEqual([[1, 10, 2026, 10, 1]]);
  });

  it('carica anche le quote a mano sugli impegni di fatture di altri contratti', async () => {
    const { ds, calls } = fakeDataSource({ commitments: [commitment(10, 1, 100)] });
    await new CommitmentReconcileService(ds).reconcileContracts([1]);
    expect(tagged(calls, 'r_invoices')[0].params).toEqual([[1], [10]]);
  });

  it('allarga ai contratti che condividono un impegno', async () => {
    const { ds, calls } = fakeDataSource({ closure: [{ contract_id: 1 }, { contract_id: 2 }] });
    await new CommitmentReconcileService(ds).reconcileContracts([1]);
    expect(tagged(calls, 'r_invoices')[0].params).toEqual([[1, 2], [-1]]);
  });

  it('reconcileAll toglie le quote automatiche delle fatture senza contratto', async () => {
    const { ds, calls } = fakeDataSource({});
    await new CommitmentReconcileService(ds).reconcileAll();
    expect(tagged(calls, 'r_orphans')).toHaveLength(1);
  });

  it('ogni giro toglie le quote automatiche delle fatture rimaste senza contratto', async () => {
    const { ds, calls } = fakeDataSource({});
    await new CommitmentReconcileService(ds).reconcileContracts([4]);
    expect(tagged(calls, 'r_orphans')).toHaveLength(1);
    expect(calls[0].sql).toContain('/* r_orphans */');
  });

  it('dopo un giro fallito le chiamate successive lavorano lo stesso', async () => {
    const { ds, calls } = fakeDataSource({
      commitments: [commitment(10, 1, 100)],
      invoices: [invoice(1, 50, '2026-02-01')],
    });
    const query = (ds as unknown as { query: jest.Mock }).query;
    const original = query.getMockImplementation()!;
    query.mockImplementationOnce(async () => {
      throw new Error('deadlock');
    });
    const service = new CommitmentReconcileService(ds);
    await expect(service.reconcileContracts([1])).rejects.toThrow('deadlock');
    query.mockImplementation(original);
    await service.reconcileContracts([1]);
    expect(inserts(calls)).toHaveLength(1);
  });

  it('reconcileUtilities ricalcola i contratti delle fatture con righe di quelle utenze', async () => {
    const { ds, calls } = fakeDataSource({
      commitments: [commitment(10, 1, 100)],
      invoices: [invoice(1, 50, '2026-02-01')],
    });
    const query = (ds as unknown as { query: jest.Mock }).query;
    const original = query.getMockImplementation()!;
    query.mockImplementation(async (sql: string, params: unknown[] = []) => {
      if (!sql.includes('/* r_utility_contracts */')) return original(sql, params);
      calls.push({ sql, params });
      return [{ contract_id: 1 }];
    });
    await new CommitmentReconcileService(ds).reconcileUtilities([50]);
    expect(tagged(calls, 'r_utility_contracts')[0].params).toEqual([[50]]);
    expect(inserts(calls)).toHaveLength(1);
  });

  it('chiamate concorrenti sugli stessi contratti fanno un solo giro', async () => {
    const { ds, calls } = fakeDataSource({});
    const service = new CommitmentReconcileService(ds);
    await Promise.all([service.reconcileContracts([1]), service.reconcileContracts([1])]);
    expect(tagged(calls, 'r_invoices')).toHaveLength(1);
  });

  it('stornata o nota di credito per la contabilità: nessuna quota automatica e nessuna rimanenza consumata', async () => {
    const { ds, calls } = fakeDataSource({
      commitments: [commitment(10, 521, 100)],
      invoices: [
        invoice(1, 100, '2026-01-10', {
          payment_status: 'CANCELLED',
          auto_share: { commitment_id: 10, fiscal_year: 2026, amount: 100 },
        }),
        invoice(2, -30, '2026-01-20', { payment_status: 'TO_COMPENSATE' }),
        invoice(3, 100, '2026-02-10'),
      ],
    });
    await new CommitmentReconcileService(ds).reconcileContracts([1]);
    expect(deletes(calls).map((c) => c.params)).toEqual([[1], [3]]);
    expect(inserts(calls).map((c) => c.params)).toEqual([[3, 10, 2026, 100, 3]]);
  });

  describe('esercizi chiusi', () => {
    // Impegno A sul capitolo 7 (vecchio capitolo dell'utenza), B sul capitolo 8 (nuovo).
    const both = () => [
      { ...commitment(10, 100, 1000), chapter: 7, fiscal_year: 2025 },
      { ...commitment(20, 200, 1000), chapter: 8, fiscal_year: 2025 },
      { ...commitment(10, 100, 1000), chapter: 7, fiscal_year: 2026 },
      { ...commitment(20, 200, 1000), chapter: 8, fiscal_year: 2026 },
    ];
    const service = (ds: DataSource) => {
      const s = new CommitmentReconcileService(ds);
      s.now = () => new Date('2026-11-27T10:00:00Z');
      return s;
    };

    it("fattura di un esercizio chiuso con quota automatica: invariata anche se cambia il capitolo dell'utenza", async () => {
      const { ds, calls } = fakeDataSource({
        commitments: both(),
        invoices: [
          invoice(1, 50, '2025-03-10', {
            chapters: '[8]',
            auto_share: { commitment_id: 10, fiscal_year: 2025, amount: 50 },
          }),
        ],
      });
      await service(ds).reconcileContracts([1]);
      expect(deletes(calls)).toHaveLength(0);
      expect(inserts(calls)).toHaveLength(0);
    });

    it("fattura dell'esercizio in corso nella stessa situazione: quota spostata sul nuovo impegno", async () => {
      const { ds, calls } = fakeDataSource({
        commitments: both(),
        invoices: [
          invoice(1, 50, '2026-03-10', {
            chapters: '[8]',
            auto_share: { commitment_id: 10, fiscal_year: 2026, amount: 50 },
          }),
        ],
      });
      await service(ds).reconcileContracts([1]);
      expect(inserts(calls).map((c) => c.params)).toEqual([[1, 20, 2026, 50, 1]]);
    });

    it('fattura di un esercizio chiuso senza quota: allocata', async () => {
      const { ds, calls } = fakeDataSource({
        commitments: both(),
        invoices: [invoice(1, 50, '2025-03-10', { chapters: '[8]' })],
      });
      await service(ds).reconcileContracts([1]);
      expect(inserts(calls).map((c) => c.params)).toEqual([[1, 20, 2025, 50, 1]]);
    });

    it("la quota congelata consuma la rimanenza dell'impegno", async () => {
      const { ds, calls } = fakeDataSource({
        commitments: [
          { ...commitment(10, 100, 50), chapter: 7, fiscal_year: 2025 },
          { ...commitment(20, 200, 100), chapter: 7, fiscal_year: 2025 },
        ],
        invoices: [
          invoice(1, 50, '2025-03-10', {
            auto_share: { commitment_id: 10, fiscal_year: 2025, amount: 50 },
          }),
          invoice(2, 30, '2025-04-10'),
        ],
      });
      await service(ds).reconcileContracts([1]);
      // 50 - 50 = 0: la seconda passa all'impegno successivo.
      expect(inserts(calls).map((c) => c.params)).toEqual([[2, 20, 2025, 30, 2]]);
    });
  });

  describe('onReconciled', () => {
    it('dopo un giro riuscito avvisa con i contratti ricalcolati', async () => {
      const { ds } = fakeDataSource({ closure: [{ contract_id: 2 }] });
      const service = new CommitmentReconcileService(ds);
      const listener = jest.fn();
      service.onReconciled(listener);
      await service.reconcileContracts([1]);
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith([1, 2]);
    });

    it('un giro fallito non avvisa', async () => {
      const { ds } = fakeDataSource({});
      (ds.query as jest.Mock).mockRejectedValueOnce(new Error('boom'));
      const service = new CommitmentReconcileService(ds);
      const listener = jest.fn();
      service.onReconciled(listener);
      await expect(service.reconcileContracts([1])).rejects.toThrow('boom');
      expect(listener).not.toHaveBeenCalled();
    });

    it('un ascoltatore che fallisce non fa fallire la riconciliazione', async () => {
      const { ds } = fakeDataSource({});
      const service = new CommitmentReconcileService(ds);
      const second = jest.fn();
      service.onReconciled(() => {
        throw new Error('boom');
      });
      service.onReconciled(second);
      await expect(service.reconcileContracts([1])).resolves.toBeUndefined();
      expect(second).toHaveBeenCalled();
    });
  });
});
