import { QueryRunner } from 'typeorm';
import { UtilitySupplyHistory1794700000000 } from './migrations/1794700000000-UtilitySupplyHistory';

// Fuori da migrations/: il glob delle migration caricherebbe lo spec come migration.
// QueryRunner simulato: ogni query è registrata (testo + parametri), le risposte
// dipendono dal testo.
type Call = { sql: string; params?: unknown[] };

function runner(answers: { match: RegExp; rows: unknown[] }[] = []) {
  const calls: Call[] = [];
  const q = {
    query: jest.fn(async (sql: string, params?: unknown[]) => {
      calls.push({ sql, params });
      return answers.find((a) => a.match.test(sql))?.rows ?? [];
    }),
  } as unknown as QueryRunner;
  return { q, calls };
}

const utility = (o: Record<string, unknown>) => ({
  id: 1,
  supply_active: 1,
  activated_on: null,
  ceased_on: null,
  transferred_to_third_party_id: null,
  transferred_on: null,
  created_by_user_id: 7,
  updated_by_user_id: 7,
  ...o,
});

// Eventi inseriti dalla migration: [utility, type, third_party, effective_on, date_unknown].
async function events(rows: unknown[]) {
  const { q, calls } = runner([{ match: /-- utenze da convertire/, rows }]);
  await new UtilitySupplyHistory1794700000000().up(q);
  const insert = calls.filter((c) => /INSERT INTO `utility_supply_events`/.test(c.sql));
  return insert.flatMap((c) => {
    const p = c.params as unknown[];
    const out: unknown[][] = [];
    for (let i = 0; i < p.length; i += 7) {
      out.push([p[i], p[i + 1], p[i + 2], p[i + 3], p[i + 4]]);
    }
    return out;
  });
}

describe('Migration UtilitySupplyHistory1794700000000', () => {
  it('utenza attiva con data di attivazione: ACTIVATION effettiva', async () => {
    expect(await events([utility({ activated_on: '2025-03-01' })])).toEqual([
      [1, 'ACTIVATION', null, '2025-03-01', 0],
    ]);
  });

  it('utenza attiva senza data: ACTIVATION a data non nota', async () => {
    expect(await events([utility({})])).toEqual([[1, 'ACTIVATION', null, null, 1]]);
  });

  it('utenza cessata senza date: ACTIVATION e CESSATION a data non nota', async () => {
    expect(await events([utility({ supply_active: 0 })])).toEqual([
      [1, 'ACTIVATION', null, null, 1],
      [1, 'CESSATION', null, null, 1],
    ]);
  });

  it('utenza cessata con data di cessazione e senza attivazione', async () => {
    expect(await events([utility({ supply_active: 0, ceased_on: '2025-07-07' })])).toEqual([
      [1, 'ACTIVATION', null, null, 1],
      [1, 'CESSATION', null, '2025-07-07', 0],
    ]);
  });

  it('utenza volturata: TRANSFER effettivo, data non nota se manca transferred_on', async () => {
    expect(
      await events([
        utility({
          id: 3,
          activated_on: '2020-01-01',
          transferred_to_third_party_id: 5,
          transferred_on: '2024-01-10',
        }),
        utility({ id: 4, activated_on: '2020-01-01', transferred_to_third_party_id: 5 }),
      ]),
    ).toEqual([
      [3, 'ACTIVATION', null, '2020-01-01', 0],
      [3, 'TRANSFER', 5, '2024-01-10', 0],
      [4, 'ACTIVATION', null, '2020-01-01', 0],
      [4, 'TRANSFER', 5, null, 1],
    ]);
  });

  it('si ferma prima di qualunque DDL con ceased_on < activated_on, elencando gli id', async () => {
    const { q, calls } = runner([
      {
        match: /-- utenze da convertire/,
        rows: [
          utility({ id: 11, supply_active: 0, activated_on: '2025-05-01', ceased_on: '2025-01-01' }),
        ],
      },
    ]);
    await expect(new UtilitySupplyHistory1794700000000().up(q)).rejects.toThrow(/11/);
    expect(calls.some((c) => /CREATE TABLE|ALTER TABLE|DROP|INSERT/.test(c.sql))).toBe(false);
  });

  it('si ferma se la conversione cambierebbe supply_active (attiva con ceased_on)', async () => {
    const { q, calls } = runner([
      {
        match: /-- utenze da convertire/,
        rows: [utility({ id: 12, activated_on: '2025-01-01', ceased_on: '2025-06-01' })],
      },
    ]);
    await expect(new UtilitySupplyHistory1794700000000().up(q)).rejects.toThrow(/12/);
    expect(calls.some((c) => /CREATE TABLE|ALTER TABLE|DROP|INSERT/.test(c.sql))).toBe(false);
  });

  describe('decisioni sui contratti immobiliari', () => {
    const grantRow = (o: Record<string, unknown>) => ({
      grant_id: 100,
      utility_id: 1,
      utilities_to_be_taken_over: 0,
      end_date: null,
      tacit_renewal: 0,
      renewal_months: null,
      notice_months: null,
      status: 'ACTIVE',
      ...o,
    });

    async function decisions(rows: unknown[]) {
      const { q, calls } = runner([{ match: /-- contratti attivi/, rows }]);
      await new UtilitySupplyHistory1794700000000().up(q);
      const insert = calls.filter((c) => /INSERT INTO `utilizer_grant_utility_decisions`/.test(c.sql));
      return insert.flatMap((c) => {
        const p = c.params as unknown[];
        const out: unknown[][] = [];
        for (let i = 0; i < p.length; i += 3) out.push([p[i], p[i + 1], p[i + 2]]);
        return out;
      });
    }

    it('con "Utenze da volturare": decisione vuota (da decidere); senza: STAYS', async () => {
      expect(
        await decisions([
          grantRow({ grant_id: 100, utility_id: 1, utilities_to_be_taken_over: 1 }),
          grantRow({ grant_id: 101, utility_id: 2, utilities_to_be_taken_over: 0 }),
        ]),
      ).toEqual([
        [100, 1, null],
        [101, 2, 'STAYS'],
      ]);
    });

    it('un contratto scaduto per data non è attivo, uno con rinnovo tacito sì', async () => {
      expect(
        await decisions([
          grantRow({ grant_id: 100, utility_id: 1, end_date: '2020-01-01' }),
          grantRow({
            grant_id: 101,
            utility_id: 2,
            end_date: '2020-01-01',
            tacit_renewal: 1,
            renewal_months: 12,
          }),
          grantRow({ grant_id: 102, utility_id: 3, end_date: '2999-01-01' }),
        ]),
      ).toEqual([
        [101, 2, 'STAYS'],
        [102, 3, 'STAYS'],
      ]);
    });

    it('la stessa coppia contratto-utenza non è inserita due volte', async () => {
      expect(await decisions([grantRow({}), grantRow({})])).toEqual([[100, 1, 'STAYS']]);
    });
  });

  it('down: toglie colonne e tabelle senza toccare transfer_required', async () => {
    const { q, calls } = runner();
    await new UtilitySupplyHistory1794700000000().down(q);
    const sql = calls.map((c) => c.sql).join('\n');
    expect(sql).toMatch(/DROP TABLE `utilizer_grant_utility_decisions`/);
    expect(sql).toMatch(/DROP TABLE `utility_supply_events`/);
    expect(sql).toMatch(/DROP COLUMN `cost_status`/);
    expect(sql).not.toMatch(/transfer_required/);
  });
});
