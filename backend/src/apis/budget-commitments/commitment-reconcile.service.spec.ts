import { DataSource } from 'typeorm';
import { CommitmentReconcileService } from './commitment-reconcile.service';

type Row = Record<string, unknown>;

// Risponde in base al tag /* r_… */ in testa a ogni query del servizio.
function fakeDataSource(data: { closure?: Row[]; commitments?: Row[]; lines?: Row[] }) {
  const calls: { sql: string; params: unknown[] }[] = [];
  const query = jest.fn(async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    if (sql.includes('/* r_closure */')) return data.closure ?? [];
    if (sql.includes('/* r_commitments */')) return data.commitments ?? [];
    if (sql.includes('/* r_lines */')) return data.lines ?? [];
    return [];
  });
  return { ds: { query } as unknown as DataSource, calls };
}

const writes = (calls: { sql: string; params: unknown[] }[]) =>
  calls.filter((c) => c.sql.includes('/* r_write */'));

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

const line = (id: number, amount: number, date: string, extra: Row = {}) => ({
  id,
  amount,
  date,
  auto: 1,
  commitment_id: null,
  contract_id: 1,
  utility_id: 50,
  chapter: 7,
  year: 2026,
  ...extra,
});

describe('CommitmentReconcileService', () => {
  it('assegna le righe automatiche in ordine di numero', async () => {
    const { ds, calls } = fakeDataSource({
      commitments: [commitment(20, 1886, 50), commitment(10, 521, 100)],
      lines: [line(1, 60, '2026-01-10'), line(2, 60, '2026-02-10'), line(3, 60, '2026-03-10')],
    });
    await new CommitmentReconcileService(ds).reconcileContracts([1]);
    const w = writes(calls);
    expect(w).toHaveLength(2);
    expect(w).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ params: [10, [1, 2]] }),
        expect.objectContaining({ params: [20, [3]] }),
      ]),
    );
    expect(w.every((c) => c.sql.includes('commitment_auto = 1'))).toBe(true);
  });

  it('non riscrive le righe manuali né quelle già giuste', async () => {
    const { ds, calls } = fakeDataSource({
      commitments: [commitment(10, 521, 100)],
      lines: [
        line(9, 90, '2026-01-01', { auto: 0, commitment_id: 10 }),
        line(1, 5, '2026-01-10', { commitment_id: 10 }),
      ],
    });
    await new CommitmentReconcileService(ds).reconcileContracts([1]);
    expect(writes(calls)).toHaveLength(0);
  });

  it('legge solo righe di fatture non cancellate e non rifiutate', async () => {
    const { ds, calls } = fakeDataSource({});
    await new CommitmentReconcileService(ds).reconcileContracts([1]);
    const sql = calls.find((c) => c.sql.includes('/* r_lines */'))!.sql;
    expect(sql).toContain('i.deleted = 0');
    expect(sql).toContain('sdi_status');
  });

  it('il contratto della riga è quello in testata alla fattura (invoices.contratto_id_fk)', async () => {
    const { ds, calls } = fakeDataSource({});
    const service = new CommitmentReconcileService(ds);
    await service.reconcileAll();
    const sql = calls.map((c) => c.sql).join('\n');
    expect(sql).toContain('i.contratto_id_fk');
    expect(sql).not.toMatch(/\bi\.contract_id_fk\b|FROM invoices WHERE contract_id_fk/);
  });

  it('chiamate concorrenti sugli stessi contratti fanno un solo giro', async () => {
    const { ds, calls } = fakeDataSource({});
    const service = new CommitmentReconcileService(ds);
    await Promise.all([service.reconcileContracts([1]), service.reconcileContracts([1])]);
    expect(calls.filter((c) => c.sql.includes('/* r_lines */'))).toHaveLength(1);
  });

  it('senza impegni le righe automatiche tornano senza impegno', async () => {
    const { ds, calls } = fakeDataSource({ lines: [line(1, 10, '2026-01-10', { commitment_id: 99 })] });
    await new CommitmentReconcileService(ds).reconcileContracts([1]);
    expect(writes(calls)).toEqual([expect.objectContaining({ params: [null, [1]] })]);
  });

  it('una riga con utenza senza capitolo non prende impegni', async () => {
    const { ds, calls } = fakeDataSource({
      commitments: [commitment(10, 521, 100)],
      lines: [line(1, 10, '2026-01-10', { chapter: null })],
    });
    await new CommitmentReconcileService(ds).reconcileContracts([1]);
    expect(writes(calls)).toHaveLength(0);
  });

  it('allarga ai contratti che condividono un impegno', async () => {
    const { ds, calls } = fakeDataSource({ closure: [{ contract_id: 1 }, { contract_id: 2 }] });
    await new CommitmentReconcileService(ds).reconcileContracts([1]);
    const linesCall = calls.find((c) => c.sql.includes('/* r_lines */'))!;
    expect(linesCall.params).toEqual([[1, 2]]);
  });
});
