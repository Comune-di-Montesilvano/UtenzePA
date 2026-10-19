import { QueryRunner } from 'typeorm';
import { UtilitySupplyHistory1794700000000 } from './migrations/1794700000000-UtilitySupplyHistory';
import { currentSnapshot, SupplyEventLike } from '../apis/utility-supply/supply-state';
import { SupplyEventType } from '../apis/utility-supply/enum/supply-event-type.enum';
import { todayIso } from '../apis/utilizer-grant/real-estate-contract.calc';

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

// Parametri di ogni riga inserita, nell'ordine delle colonne dell'INSERT:
// utility, type, third_party, requested_on, effective_on, date_unknown, notes, autori.
async function insertedRows(rows: unknown[]): Promise<unknown[][]> {
  const { q, calls } = runner([{ match: /-- utenze da convertire/, rows }]);
  await new UtilitySupplyHistory1794700000000().up(q);
  const insert = calls.filter((c) => /INSERT INTO `utility_supply_events`/.test(c.sql));
  return insert.flatMap((c) => {
    const p = c.params as unknown[];
    const out: unknown[][] = [];
    for (let i = 0; i < p.length; i += 9) out.push(p.slice(i, i + 9));
    return out;
  });
}

// Eventi inseriti dalla migration: [utility, type, third_party, effective_on, date_unknown, notes].
async function events(rows: unknown[]) {
  return (await insertedRows(rows)).map((r) => [r[0], r[1], r[2], r[4], r[5], r[6]]);
}

// Righe inserite come le legge lo storico (id = ordine di inserimento).
async function insertedLikes(rows: unknown[]): Promise<SupplyEventLike[]> {
  return (await insertedRows(rows)).map((r, i) => ({
    id: i + 1,
    type: r[1] as SupplyEventType,
    third_party_id_fk: r[2] as number | null,
    requested_on: r[3] as string | null,
    effective_on: r[4] as string | null,
    date_unknown: r[5] === 1,
    cancelled_on: null,
    deleted: false,
    utilizer_grant_id_fk: null,
    create_date: todayIso(),
  }));
}

describe('Migration UtilitySupplyHistory1794700000000', () => {
  it('utenza attiva con data di attivazione: ACTIVATION effettiva', async () => {
    expect(await events([utility({ activated_on: '2025-03-01' })])).toEqual([
      [1, 'ACTIVATION', null, '2025-03-01', 0, null],
    ]);
  });

  it('utenza attiva senza data: ACTIVATION a data non nota', async () => {
    expect(await events([utility({})])).toEqual([[1, 'ACTIVATION', null, null, 1, null]]);
  });

  it('utenza cessata senza date: ACTIVATION e CESSATION a data non nota', async () => {
    expect(await events([utility({ supply_active: 0 })])).toEqual([
      [1, 'ACTIVATION', null, null, 1, null],
      [1, 'CESSATION', null, null, 1, null],
    ]);
  });

  it('utenza cessata con data di cessazione e senza attivazione', async () => {
    expect(await events([utility({ supply_active: 0, ceased_on: '2025-07-07' })])).toEqual([
      [1, 'ACTIVATION', null, null, 1, null],
      [1, 'CESSATION', null, '2025-07-07', 0, null],
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
      [3, 'ACTIVATION', null, '2020-01-01', 0, null],
      [3, 'TRANSFER', 5, '2024-01-10', 0, null],
      [4, 'ACTIVATION', null, '2020-01-01', 0, null],
      [4, 'TRANSFER', 5, null, 1, null],
    ]);
  });

  it('ceased_on < activated_on con utenza attiva: riattivazione, stato invariato', async () => {
    expect(
      await events([utility({ id: 11, activated_on: '2025-05-01', ceased_on: '2025-01-01' })]),
    ).toEqual([
      [11, 'ACTIVATION', null, null, 1, null],
      [11, 'CESSATION', null, '2025-01-01', 0, null],
      [11, 'ACTIVATION', null, '2025-05-01', 0, null],
    ]);
  });

  it('ceased_on < activated_on con utenza cessata: entrambe a data non nota, date nelle note', async () => {
    expect(
      await events([
        utility({ id: 11, supply_active: 0, activated_on: '2025-05-01', ceased_on: '2025-01-01' }),
      ]),
    ).toEqual([
      [11, 'ACTIVATION', null, null, 1, 'Attivazione indicata il 01/05/2025: da verificare'],
      [
        11,
        'CESSATION',
        null,
        null,
        1,
        'Date incoerenti nei dati di partenza (attivazione 01/05/2025, cessazione 01/01/2025): da verificare',
      ],
    ]);
  });

  it('utenza attiva con cessazione indicata: solo ACTIVATION, con nota', async () => {
    const note = 'Cessazione indicata il 01/06/2025 ma fornitura attiva: da verificare';
    expect(
      await events([
        utility({ id: 12, activated_on: '2025-01-01', ceased_on: '2025-06-01' }),
        utility({ id: 13, ceased_on: '2025-06-01' }),
      ]),
    ).toEqual([
      [12, 'ACTIVATION', null, '2025-01-01', 0, note],
      [13, 'ACTIVATION', null, null, 1, note],
    ]);
  });

  it('utenza cessata con sola data di attivazione: entrambe a data non nota, data nella nota', async () => {
    expect(
      await events([utility({ id: 14, supply_active: 0, activated_on: '2024-02-01' })]),
    ).toEqual([
      [
        14,
        'ACTIVATION',
        null,
        null,
        1,
        'Attivazione indicata il 01/02/2024, cessazione senza data: da verificare',
      ],
      [14, 'CESSATION', null, null, 1, null],
    ]);
  });

  describe('date future: riga in sospeso con la data come richiesta', () => {
    it('attivazione futura su utenza attiva: attiva da prima + attivazione in sospeso', async () => {
      const rows = await insertedRows([utility({ id: 15, activated_on: '2999-03-01' })]);
      expect(rows.map((r) => r.slice(0, 7))).toEqual([
        [15, 'ACTIVATION', null, null, null, 1, null],
        [15, 'ACTIVATION', null, '2999-03-01', null, 0, 'Data futura da verificare: 01/03/2999'],
      ]);
    });

    it('cessazione futura su utenza attiva: cessazione in sospeso, nessuna nota di incoerenza', async () => {
      const rows = await insertedRows([
        utility({ id: 16, activated_on: '2024-01-01', ceased_on: '2999-06-30' }),
      ]);
      expect(rows.map((r) => r.slice(0, 7))).toEqual([
        [16, 'ACTIVATION', null, null, '2024-01-01', 0, null],
        [16, 'CESSATION', null, '2999-06-30', null, 0, 'Data futura da verificare: 30/06/2999'],
      ]);
    });

    it('cessazione futura su utenza cessata: cessata a data non nota + cessazione in sospeso', async () => {
      const rows = await insertedRows([
        utility({ id: 17, supply_active: 0, ceased_on: '2999-06-30' }),
      ]);
      expect(rows.map((r) => r.slice(0, 7))).toEqual([
        [17, 'ACTIVATION', null, null, null, 1, null],
        [17, 'CESSATION', null, null, null, 1, null],
        [17, 'CESSATION', null, '2999-06-30', null, 0, 'Data futura da verificare: 30/06/2999'],
      ]);
    });
  });

  // Ogni ramo di convert: lo stato ricavato dalle righe = supply_active di partenza.
  describe('stato ricavato dallo storico = supply_active, per ogni ramo', () => {
    const cases: [string, Record<string, unknown>][] = [
      ['attiva con data di attivazione', { activated_on: '2025-03-01' }],
      ['attiva senza date', {}],
      ['attiva con cessazione indicata', { activated_on: '2025-01-01', ceased_on: '2025-06-01' }],
      ['attiva con sola cessazione', { ceased_on: '2025-06-01' }],
      ['riattivata (cessazione < attivazione)', { activated_on: '2025-05-01', ceased_on: '2025-01-01' }],
      ['attiva con attivazione futura', { activated_on: '2999-01-01' }],
      ['attiva con cessazione futura', { activated_on: '2024-01-01', ceased_on: '2999-01-01' }],
      ['cessata con entrambe le date', { supply_active: 0, activated_on: '2024-01-01', ceased_on: '2025-01-01' }],
      [
        'cessata con cessazione < attivazione',
        { supply_active: 0, activated_on: '2025-05-01', ceased_on: '2025-01-01' },
      ],
      ['cessata con sola attivazione', { supply_active: 0, activated_on: '2024-01-01' }],
      ['cessata con sola cessazione', { supply_active: 0, ceased_on: '2025-01-01' }],
      ['cessata senza date', { supply_active: 0 }],
      ['cessata con attivazione futura', { supply_active: 0, activated_on: '2999-01-01' }],
      ['cessata con cessazione futura', { supply_active: 0, ceased_on: '2999-01-01' }],
      ['cessata con supply_active null', { supply_active: null, activated_on: '2024-01-01' }],
    ];
    it.each(cases)('%s', async (_name, o) => {
      const u = utility(o);
      const likes = await insertedLikes([u]);
      expect(currentSnapshot(likes, todayIso()).supply_active).toBe(!!Number(u.supply_active ?? 0));
    });
  });

  describe('controllo finale dello stato', () => {
    afterEach(() => jest.restoreAllMocks());

    it('confronta lo stato ricavato con supply_active, dopo gli INSERT', async () => {
      const { q, calls } = runner();
      await new UtilitySupplyHistory1794700000000().up(q);
      const i = calls.findIndex((c) => /-- controllo stato/.test(c.sql));
      expect(i).toBeGreaterThan(
        calls.findIndex((c) => /INSERT INTO `utility_supply_events`/.test(c.sql)),
      );
      expect(calls[i].sql).toMatch(/ORDER BY e\.date_unknown ASC, e\.effective_on DESC, e\.id DESC/);
      expect(calls[i].params).toEqual([todayIso()]);
    });

    it('differenze: avviso con gli id, mai un errore', async () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
      const { q } = runner([
        { match: /-- utenze da convertire/, rows: [utility({ id: 31 })] },
        { match: /-- controllo stato/, rows: [{ id: 31 }, { id: 32 }] },
      ]);
      await expect(new UtilitySupplyHistory1794700000000().up(q)).resolves.toBeUndefined();
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).toMatch(/31, 32/);
    });

    it('nessuna differenza: nessun avviso', async () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
      const { q } = runner([{ match: /-- utenze da convertire/, rows: [utility({})] }]);
      await new UtilitySupplyHistory1794700000000().up(q);
      expect(warn).not.toHaveBeenCalled();
    });
  });

  it('non blocca mai per date incoerenti: esegue le DDL', async () => {
    const { q, calls } = runner([
      {
        match: /-- utenze da convertire/,
        rows: [utility({ id: 12, activated_on: '2025-06-01', ceased_on: '2025-01-01' })],
      },
    ]);
    await new UtilitySupplyHistory1794700000000().up(q);
    expect(calls.some((c) => /CREATE TABLE/.test(c.sql))).toBe(true);
  });

  it("l'autore è risolto in SQL: creatore mancante = primo utente", async () => {
    const { q, calls } = runner();
    await new UtilitySupplyHistory1794700000000().up(q);
    const select = calls.find((c) => /-- utenze da convertire/.test(c.sql))!.sql;
    expect(select).toMatch(/COALESCE\(\(SELECT s\.id FROM `system_users` s WHERE s\.id = utilities\.created_by_user_id\), \(SELECT MIN\(id\) FROM `system_users`\)\) AS created_by_user_id/);
  });

  it('si ferma prima di qualunque DDL se un autore non è risolvibile, elencando gli id', async () => {
    const { q, calls } = runner([
      {
        match: /-- utenze da convertire/,
        rows: [utility({ id: 21, created_by_user_id: null }), utility({ id: 22 })],
      },
    ]);
    await expect(new UtilitySupplyHistory1794700000000().up(q)).rejects.toThrow(/21/);
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
