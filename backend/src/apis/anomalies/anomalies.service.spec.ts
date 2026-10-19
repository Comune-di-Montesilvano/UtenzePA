import { CostStatus, costStatusSql } from '@apis/utility/cost-status';
import { AnomaliesService } from './anomalies.service';

describe('AnomaliesService', () => {
  let query: jest.Mock;
  let service: AnomaliesService;

  beforeEach(() => {
    // Query non mockate esplicitamente: nessuna riga.
    query = jest.fn().mockResolvedValue([]);
    service = new AnomaliesService({ query } as never);
  });

  it('immobili senza natura o funzione, esclusi i cancellati', async () => {
    query.mockImplementation(async (sql: string) =>
      sql.includes('FROM assets a')
        ? [{ id: '5', asset_name: 'Immobile prova', missing: 'natura e funzione' }]
        : [],
    );
    const result = await service.getAnomalies();
    expect(result.assets_without_classification).toEqual({
      count: 1,
      items: [{ id: 5, asset_name: 'Immobile prova', missing: 'natura e funzione' }],
    });
    const sql = query.mock.calls.map(([s]) => String(s)).find((s) => s.includes('FROM assets a'));
    expect(sql).toContain('a.deleted = 0');
    expect(sql).toContain('a.nature_id IS NULL OR a.function_id IS NULL');
  });

  it('utenze attive senza posizione propria, dell’immobile o dell’impianto', async () => {
    query.mockImplementation(async (sql: string) =>
      sql.includes('FROM utility_plants up')
        ? [{ id: 12, utility_id: 'IT002', type: 'Acqua' }]
        : [],
    );
    const result = await service.getAnomalies();
    expect(result.active_utilities_without_position).toEqual({
      count: 1,
      items: [{ id: 12, utility_id: 'IT002', type: 'Acqua' }],
    });
    const sql = query.mock.calls
      .map(([s]) => String(s))
      .find((s) => s.includes('FROM utility_plants up'));
    expect(sql).toContain('u.supply_active = 1');
    expect(sql).toContain('FROM utility_assets ua');
    expect(sql).toContain('a.geocoded_latitude');
    expect(sql).toContain('FROM plant_assets pa');
  });

  it('immobili attivi non di proprietà senza contratto passivo attivo', async () => {
    query.mockImplementation(async (sql: string) =>
      sql.includes('a.ownership = 0') ? [{ id: '8', asset_name: 'Locale in affitto' }] : [],
    );
    const result = await service.getAnomalies();
    expect(result.rented_assets_without_passive_contract).toEqual({
      count: 1,
      items: [{ id: 8, asset_name: 'Locale in affitto' }],
    });
    const sql = query.mock.calls.map(([s]) => String(s)).find((s) => s.includes('a.ownership = 0'));
    expect(sql).toContain("a.status = 'Attivo'");
    expect(sql).toContain("g.direction = 'PASSIVE'");
    expect(sql).toContain("g.status = 'ACTIVE'");
  });

  it('aggrega le 5 categorie con conteggio ed elenco, numeri convertiti', async () => {
    query
      .mockResolvedValueOnce([
        {
          id: 7,
          supplier: 'ENGIE',
          agreement: 'luce 3',
          supply_expiry_date: '2027-12-31',
          utilities: '125',
        },
      ])
      .mockResolvedValueOnce([{ id: 11, utility_id: 'IT001', type: 'energia elettrica' }])
      .mockResolvedValueOnce([
        { id: 12, utility_id: 'IT002', type: 'energia elettrica', contracts: '#7 ENGIE' },
        { id: 13, utility_id: 'IT003', type: 'energia elettrica', contracts: '#7 ENGIE' },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ cig: 'ABC', contracts: '3,4' }])
      .mockResolvedValueOnce([]);

    const result = await service.getAnomalies();

    expect(result.contracts_without_cig).toEqual({
      count: 1,
      items: [
        {
          id: 7,
          supplier: 'ENGIE',
          agreement: 'luce 3',
          supply_expiry_date: '2027-12-31',
          utilities: 125,
        },
      ],
    });
    expect(result.active_utilities_without_contract.count).toBe(1);
    expect(result.active_utilities_without_cig_contract.count).toBe(2);
    expect(result.utilities_with_overlapping_contracts).toEqual({ count: 0, items: [] });
    expect(result.duplicate_cigs).toEqual({ count: 1, items: [{ cig: 'ABC', contracts: [3, 4] }] });
    expect(query).toHaveBeenCalledTimes(34);
    // Fornitore = nome del soggetto terzo, non più la sigla.
    expect(query.mock.calls[0][0]).toContain('LEFT JOIN third_parties s');
    // I contratti chiusi non sono né correnti né anomalie "senza CIG"
    // (le prime 5 query riguardano i contratti di fornitura).
    for (const [sql] of query.mock.calls.slice(0, 5)) {
      expect(sql).toContain('closed = 0');
    }
  });

  it('elenca i contratti immobiliari senza immobile', async () => {
    // Le 5 query dei contratti di fornitura restano in testa, la nuova è la sesta.
    query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: '4', counterparty: 'SPRAR', subject: null }]);
    const a = await service.getAnomalies();
    expect(a.real_estate_contracts_without_assets).toEqual({
      count: 1,
      items: [{ id: 4, counterparty: 'SPRAR', subject: null }],
    });
    expect(query.mock.calls[5][0]).toContain('utilizer_grant_assets');
  });

  it('elenca gli impianti senza posizione (né propria, né geocodificata, né dell’immobile)', async () => {
    query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: '7', code: 'fon_2', name: 'Fontana', type: 'FOUNTAIN' }]);
    const a = await service.getAnomalies();
    expect(a.plants_without_position).toEqual({
      count: 1,
      items: [{ id: 7, code: 'fon_2', name: 'Fontana', type: 'FOUNTAIN' }],
    });
    expect(query.mock.calls[6][0]).toContain('FROM plants');
  });

  it('elenca ascensori, antincendio e termici senza immobile collegato', async () => {
    query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: '9', code: 'ANT-57', name: 'Antincendio materna', type: 'FIRE_PROTECTION' },
      ]);
    const a = await service.getAnomalies();
    expect(a.plants_without_asset).toEqual({
      count: 1,
      items: [{ id: 9, code: 'ANT-57', name: 'Antincendio materna', type: 'FIRE_PROTECTION' }],
    });
    const sql = query.mock.calls[7][0] as string;
    expect(sql).toContain('plant_assets');
    expect(sql).toContain("'THERMAL', 'ELEVATOR', 'FIRE_PROTECTION'");
  });

  it('elenca i contratti immobiliari senza parti e i soggetti senza identificativo fiscale', async () => {
    for (let i = 0; i < 8; i++) query.mockResolvedValueOnce([]);
    query
      .mockResolvedValueOnce([{ id: '12', subject: 'Chiosco' }])
      .mockResolvedValueOnce([{ id: '1207', name: 'Rossi Mario', type: 'LEGAL' }]);
    const a = await service.getAnomalies();
    expect(a.real_estate_contracts_without_parties).toEqual({
      count: 1,
      items: [{ id: 12, subject: 'Chiosco' }],
    });
    expect(a.third_parties_without_identifier).toEqual({
      count: 1,
      items: [{ id: 1207, name: 'Rossi Mario', type: 'LEGAL' }],
    });
    expect(query.mock.calls[8][0]).toContain('utilizer_grant_parties');
    const sql = query.mock.calls[9][0] as string;
    expect(sql).toContain("tp.type = 'LEGAL' AND IFNULL(TRIM(tp.vat_number), '') = ''");
    expect(sql).toContain("tp.type = 'NATURAL' AND IFNULL(TRIM(tp.tax_code), '') = ''");
  });

  it('elenca le utenze attive senza tipologia ARERA (Internet escluso)', async () => {
    for (let i = 0; i < 10; i++) query.mockResolvedValueOnce([]);
    query.mockResolvedValueOnce([{ id: 21, utility_id: 'IT004', type: 'gas' }]);
    const a = await service.getAnomalies();
    expect(a.active_utilities_without_arera_category).toEqual({
      count: 1,
      items: [{ id: 21, utility_id: 'IT004', type: 'gas' }],
    });
    const sql = query.mock.calls[10][0] as string;
    expect(sql).toContain('u.supply_active = 1');
    expect(sql).toContain("t.hard_type <> 'INTERNET'");
    expect(sql).toContain('u.arera_category IS NULL');
  });

  it("elenca le utenze gas attive senza categoria d'uso", async () => {
    for (let i = 0; i < 11; i++) query.mockResolvedValueOnce([]);
    query.mockResolvedValueOnce([{ id: 22, utility_id: '0088', type: 'gas' }]);
    const a = await service.getAnomalies();
    expect(a.active_gas_utilities_without_use_category).toEqual({
      count: 1,
      items: [{ id: 22, utility_id: '0088', type: 'gas' }],
    });
    const sql = query.mock.calls[11][0] as string;
    expect(sql).toContain('u.supply_active = 1');
    expect(sql).toContain("t.hard_type = 'GAS'");
    expect(sql).toContain('u.gas_use_category IS NULL');
  });

  it('elenca le utenze da volturare e quelle da reintestare dalla colonna di stato', async () => {
    service.now = () => new Date('2026-10-19T10:00:00Z');
    for (let i = 0; i < 12; i++) query.mockResolvedValueOnce([]);
    query
      .mockResolvedValueOnce([
        { id: 31, utility_id: 'IT005', type: 'luce', contracts: 'Alfa Srl', pending_since: '2026-10-09' },
      ])
      .mockResolvedValueOnce([
        { id: 32, utility_id: 'IT006', type: 'luce', contracts: 'Beta Spa', pending_since: null },
      ]);

    const a = await service.getAnomalies();

    expect(a.utilities_to_transfer).toEqual({
      count: 1,
      items: [{ id: 31, utility_id: 'IT005', type: 'luce', contracts: 'Alfa Srl', pending_days: 10 }],
    });
    expect(a.utilities_to_recover.items).toEqual([
      { id: 32, utility_id: 'IT006', type: 'luce', contracts: 'Beta Spa', pending_days: 0 },
    ]);
    const toTransfer = query.mock.calls[12][0] as string;
    const toRecover = query.mock.calls[13][0] as string;
    expect(toTransfer).toContain(costStatusSql(CostStatus.TO_TRANSFER, 'u'));
    expect(toRecover).toContain(costStatusSql(CostStatus.TO_RECOVER, 'u'));
    for (const sql of [toTransfer, toRecover]) {
      expect(sql).toContain('u.supply_active = 1');
      expect(sql).toContain('u.pending_since');
      expect(sql).not.toContain('utilities_to_be_taken_over');
    }
    expect(toTransfer).toContain('LEFT JOIN');
  });

  it('parti dei contratti in corso: stato ACTIVE e fine effettiva non passata (oggi da Node)', async () => {
    service.now = () => new Date('2026-10-19T10:00:00Z');
    await service.getAnomalies();
    for (const status of [CostStatus.TO_TRANSFER, CostStatus.TO_DECIDE]) {
      const call = query.mock.calls.find(([s]) => String(s).includes(costStatusSql(status, 'u')));
      const sql = String(call?.[0]);
      expect(sql).toContain("g.status = 'ACTIVE'");
      expect(sql).toMatch(
        /g\.end_date IS NULL OR g\.end_date >= \?\s+OR \(g\.tacit_renewal = 1 AND IFNULL\(g\.renewal_months, 0\) > 0\)/,
      );
      expect(call?.[1]).toEqual(['2026-10-19']);
    }
  });

  describe('storico utenze (query in fondo)', () => {
    beforeEach(() => {
      service.now = () => new Date('2026-10-19T10:00:00Z');
    });

    it('utenze da decidere: colonna di stato e giorni di attesa', async () => {
      query.mockImplementation(async (sql: string) =>
        sql.includes(costStatusSql(CostStatus.TO_DECIDE, 'u'))
          ? [{ id: '40', utility_id: 'IT040', type: 'gas', contracts: null, pending_since: '2026-10-01' }]
          : [],
      );
      const a = await service.getAnomalies();
      expect(a.utilities_to_decide).toEqual({
        count: 1,
        items: [{ id: 40, utility_id: 'IT040', type: 'gas', contracts: null, pending_days: 18 }],
      });
      const sql = query.mock.calls
        .map(([s]) => String(s))
        .find((s) => s.includes(costStatusSql(CostStatus.TO_DECIDE, 'u')));
      expect(sql).toContain('u.supply_active = 1');
      expect(sql).toContain('u.deleted = 0');
    });

    it('attivazioni e cessazioni in sospeso: una per utenza, la più vecchia', async () => {
      query.mockImplementation(async (sql: string) =>
        sql.includes('FROM utility_supply_events e')
          ? [
              { utility_pk: '50', utility_id: 'IT050', type: 'luce', event_type: 'ACTIVATION', requested_on: '2026-10-14', create_date: new Date('2026-10-14T10:00:00Z') },
              { utility_pk: '50', utility_id: 'IT050', type: 'luce', event_type: 'ACTIVATION', requested_on: '2026-10-04', create_date: new Date('2026-10-10T10:00:00Z') },
              // Senza data richiesta: conta il giorno di inserimento a Roma
              // (23:30 UTC del 16 = 17 ottobre a Roma).
              { utility_pk: '51', utility_id: 'IT051', type: 'acqua', event_type: 'CESSATION', requested_on: null, create_date: new Date('2026-10-16T23:30:00Z') },
            ]
          : [],
      );
      const a = await service.getAnomalies();
      expect(a.pending_activations).toEqual({
        count: 1,
        items: [{ id: 50, utility_id: 'IT050', type: 'luce', pending_days: 15 }],
      });
      expect(a.pending_cessations).toEqual({
        count: 1,
        items: [{ id: 51, utility_id: 'IT051', type: 'acqua', pending_days: 2 }],
      });
      const sql = query.mock.calls
        .map(([s]) => String(s))
        .find((s) => s.includes('FROM utility_supply_events e'));
      for (const part of [
        'e.deleted = 0',
        'e.cancelled_on IS NULL',
        'e.effective_on IS NULL',
        'e.date_unknown = 0',
        'e.utilizer_grant_id_fk IS NULL',
        "e.type IN ('ACTIVATION', 'CESSATION')",
        'u.deleted = 0',
      ])
        expect(sql).toContain(part);
    });

    it('fatture fuori dai periodi di attività: due query, filtro in Node', async () => {
      query.mockImplementation(async (sql: string) => {
        if (sql.includes('FROM invoice_lines il') && sql.includes('il.period_start'))
          return [
            // Cessata il 2025-07-07: periodo oltre la tolleranza.
            { invoice_id: '741', number: 'F-1', invoice_date: '2025-10-05', utility_id: '3', utility_code: 'ACQ1', period_start: '2025-09-01', period_end: '2025-09-16' },
            // Stessa utenza, entro 30 giorni: non anomala.
            { invoice_id: '742', number: 'F-2', invoice_date: '2025-08-10', utility_id: '3', utility_code: 'ACQ1', period_start: '2025-07-20', period_end: '2025-08-05' },
            // Senza periodo: data della fattura.
            { invoice_id: '743', number: 'F-3', invoice_date: new Date(2025, 11, 1), utility_id: '3', utility_code: 'ACQ1', period_start: null, period_end: null },
            // Utenza attiva: mai anomala.
            { invoice_id: '744', number: 'F-4', invoice_date: '2026-01-10', utility_id: '4', utility_code: 'ACQ2', period_start: '2025-12-01', period_end: '2025-12-31' },
          ];
        if (sql.includes('FROM utility_supply_events') && sql.includes('utility_id_fk IN (?)'))
          return [
            { id: 1, utility_id_fk: 3, type: 'ACTIVATION', third_party_id_fk: null, requested_on: null, effective_on: null, date_unknown: 1, cancelled_on: null, deleted: 0, utilizer_grant_id_fk: null, create_date: new Date() },
            { id: 2, utility_id_fk: 3, type: 'CESSATION', third_party_id_fk: null, requested_on: null, effective_on: new Date(2025, 6, 7), date_unknown: 0, cancelled_on: null, deleted: 0, utilizer_grant_id_fk: null, create_date: new Date() },
            { id: 3, utility_id_fk: 4, type: 'ACTIVATION', third_party_id_fk: null, requested_on: null, effective_on: null, date_unknown: 1, cancelled_on: null, deleted: 0, utilizer_grant_id_fk: null, create_date: new Date() },
          ];
        return [];
      });
      const a = await service.getAnomalies();
      expect(a.invoices_outside_supply_periods).toEqual({
        count: 2,
        items: [
          { invoice_id: 743, number: 'F-3', invoice_date: '2025-12-01', utility_id: 3, utility_code: 'ACQ1', period: null },
          { invoice_id: 741, number: 'F-1', invoice_date: '2025-10-05', utility_id: 3, utility_code: 'ACQ1', period: '01/09/2025–16/09/2025' },
        ],
      });
      expect((a as unknown as Record<string, unknown>).invoices_on_ceased_utilities).toBeUndefined();
      const calls = query.mock.calls.map(([s, p]) => [String(s), p] as const);
      const lines = calls.find(([s]) => s.includes('FROM invoice_lines il') && s.includes('il.period_start'));
      expect(lines?.[0]).toContain('i.deleted = 0');
      expect(lines?.[0]).toContain('u.deleted = 0');
      expect(lines?.[0]).toContain('COALESCE(il.period_end, i.invoice_date)');
      expect(lines?.[0]).toContain('INTERVAL 12 MONTH');
      expect(lines?.[1]).toEqual(['2026-10-19']);
      const events = calls.filter(([s]) => s.includes('utility_id_fk IN (?)'));
      expect(events).toHaveLength(1);
      expect(events[0][0]).toContain('deleted = 0');
      expect(events[0][1]).toEqual([[3, 4]]);
    });

    it('nessuna riga fattura: nessuna query sugli eventi', async () => {
      await service.getAnomalies();
      expect(query.mock.calls.some(([s]) => String(s).includes('utility_id_fk IN (?)'))).toBe(false);
    });
  });

  it('utenze con capitolo non impegnato: solo contratti con almeno un impegno', async () => {
    query.mockImplementation(async (sql: string) =>
      sql.includes('NOT EXISTS (SELECT 1 FROM budget_commitments')
        ? [{ id: '5', utility_id: 'IT01', type: 'acqua', contracts: '#1 ACA', chapter: '11428/0' }]
        : [],
    );
    const result = await service.getAnomalies();
    expect(result.utilities_with_uncommitted_chapter.items).toEqual([
      { id: 5, utility_id: 'IT01', type: 'acqua', contracts: '#1 ACA', chapter: '11428/0' },
    ]);
    const sql = query.mock.calls
      .map(([s]) => String(s))
      .find((s) => s.includes('NOT EXISTS (SELECT 1 FROM budget_commitments'));
    expect(sql).toContain(
      'EXISTS (SELECT 1 FROM budget_commitments any_c WHERE any_c.contract_id_fk = c.id AND any_c.deleted = 0)',
    );
  });

  it('CIG: richiesto solo ai contratti ordinari (non esclusi né gratuiti)', async () => {
    await service.getAnomalies();
    const sqls = query.mock.calls.map(([s]) => String(s));
    expect(sqls.find((s) => s.includes('AS agreement'))).toContain("c.contract_kind = 'STANDARD'");
    expect(sqls.some((s) => s.includes("c.contract_kind <> 'STANDARD'"))).toBe(true);
    expect(sqls.some((s) => s.includes('cig_exempt'))).toBe(false);
  });

  it('utenze attive senza capitolo, escluse quelle di un contratto a titolo gratuito', async () => {
    query.mockImplementation(async (sql: string) =>
      sql.includes('u.budget_chapter_code_fk IS NULL')
        ? [{ id: '8', utility_id: 'IT08', type: 'gas', contracts: '#10 ACA' }]
        : [],
    );
    const result = await service.getAnomalies();
    expect(result.active_utilities_without_chapter).toEqual({
      count: 1,
      items: [{ id: 8, utility_id: 'IT08', type: 'gas', contracts: '#10 ACA' }],
    });
    const sql = query.mock.calls
      .map(([s]) => String(s))
      .find((s) => s.includes('u.budget_chapter_code_fk IS NULL'));
    expect(sql).toContain('u.supply_active = 1');
    expect(sql).toContain("c.contract_kind = 'FREE'");
  });

  it('capitoli oltre l’assestato dell’esercizio in corso, solo non cancellati', async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM budget_chapter_spending WHERE year = ?'))
        return [{ chapter_id: 7, adjusted_budget: '100' }];
      if (sql.includes('WHERE bcm.fiscal_year = ?'))
        return [{ chapter_id: 7, commitments: '1', total: '150', without_amount: '0' }];
      if (sql.includes('FROM budget_chapters WHERE deleted = 0 AND id IN'))
        return [{ id: 7, chapter_code: '12332', article: 0, description: 'Gas scuole' }];
      return [];
    });
    const result = await service.getAnomalies();
    expect(result.chapters_over_budget.items).toEqual([
      {
        id: 7,
        chapter: '12332/0',
        description: 'Gas scuole',
        adjusted_budget: 100,
        committed: 150,
        invoiced: 0,
      },
    ]);
    const yearCalls = query.mock.calls.filter(([s]) =>
      String(s).includes('FROM budget_chapter_spending WHERE year = ?'),
    );
    expect(yearCalls[0][1]).toEqual([new Date().getFullYear()]);
  });

  it('capitolo oltre l’assestato ma cancellato: non segnalato', async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM budget_chapter_spending WHERE year = ?'))
        return [{ chapter_id: 7, adjusted_budget: '100' }];
      if (sql.includes('WHERE bcm.fiscal_year = ?'))
        return [{ chapter_id: 7, commitments: '1', total: '150', without_amount: '0' }];
      return [];
    });
    const result = await service.getAnomalies();
    expect(result.chapters_over_budget.count).toBe(0);
  });

  it('capitoli usati nell’esercizio senza assestato', async () => {
    query.mockImplementation(async (sql: string) =>
      sql.includes('s.adjusted_budget IS NOT NULL')
        ? [{ id: 4, chapter_code: '11428', article: 0, description: 'Acqua' }]
        : [],
    );
    const result = await service.getAnomalies();
    expect(result.chapters_without_budget.items).toEqual([
      { id: 4, chapter: '11428/0', description: 'Acqua' },
    ]);
    const sql = query.mock.calls
      .map(([s]) => String(s))
      .find((s) => s.includes('s.adjusted_budget IS NOT NULL'));
    expect(sql).toContain('b.deleted = 0');
    expect(sql).toContain('u.supply_active = 1');
    expect(sql).toContain('c.fiscal_year = ?');
  });

  it('righe fattura senza utenza', async () => {
    query.mockImplementation(async (sql: string) =>
      sql.includes('il.utility_id_fk IS NULL')
        ? [{ invoice_id: '9', number: 'F-9', supply_code: 'POD-PROVA', amount: '12.30' }]
        : [],
    );
    const result = await service.getAnomalies();
    expect(result.invoice_lines_without_utility.items).toEqual([
      { invoice_id: 9, number: 'F-9', supply_code: 'POD-PROVA', amount: 12.3 },
    ]);
  });

  describe('catasto e MEF', () => {
    const only = (marker: string, rows: unknown[]) =>
      query.mockImplementation(async (sql: string) => (sql.includes(marker) ? rows : []));
    const sqlOf = (marker: string) =>
      query.mock.calls.map(([s]) => String(s)).find((s) => s.includes(marker)) ?? '';

    it('immobili di proprietà senza unità catastali', async () => {
      only('/* assets_without_cadastre */', [{ id: '3', asset_name: 'Scuola' }]);
      const r = await service.getAnomalies();
      expect(r.assets_without_cadastre).toEqual({
        count: 1,
        items: [{ id: 3, asset_name: 'Scuola' }],
      });
      const sql = sqlOf('/* assets_without_cadastre */');
      expect(sql).toContain('b.deleted = 0');
      expect(sql).toContain('b.ownership = 1');
      expect(sql).toContain('NOT EXISTS (SELECT 1 FROM asset_cadastral_units');
    });

    it('fabbricati di proprietà senza Id MEF', async () => {
      only('/* assets_without_mef_id */', [{ id: '4', asset_name: 'Municipio' }]);
      const r = await service.getAnomalies();
      expect(r.assets_without_mef_id).toEqual({
        count: 1,
        items: [{ id: 4, asset_name: 'Municipio' }],
      });
      const sql = sqlOf('/* assets_without_mef_id */');
      expect(sql).toContain('b.mef_id IS NULL');
      expect(sql).toContain("n.name = 'Fabbricato'");
      expect(sql).toContain('n.deleted = 0');
      expect(sql).toContain('b.ownership = 1');
    });

    it('unità senza subalterno su immobili con stessi via, civico, foglio e particella', async () => {
      only('/* units_without_subordinate */', [{ id: '6', asset_name: 'Alloggio' }]);
      const r = await service.getAnomalies();
      expect(r.units_without_subordinate).toEqual({
        count: 1,
        items: [{ id: 6, asset_name: 'Alloggio' }],
      });
      const sql = sqlOf('/* units_without_subordinate */');
      expect(sql).toContain('u.subordinate IS NULL');
      expect(sql).toContain('o.id <> b.id');
      expect(sql).toContain('o.civic_number');
      expect(sql).toContain('o.toponym');
      expect(sql).toContain('ou.parcel = u.parcel');
    });

    it('funzioni usate da immobili di proprietà senza tipologia MEF', async () => {
      only('/* functions_without_mef_type */', [{ id: '2', name: 'Istruzione' }]);
      const r = await service.getAnomalies();
      expect(r.functions_without_mef_type).toEqual({
        count: 1,
        items: [{ id: 2, name: 'Istruzione' }],
      });
      const sql = sqlOf('/* functions_without_mef_type */');
      expect(sql).toContain('f.mef_building_type IS NULL');
      expect(sql).toContain('f.deleted = 0');
      expect(sql).toContain('b.ownership = 1');
    });

    it('impianti con almeno un estintore scaduto (fine mese, controllo +6 mesi)', async () => {
      only('/* plants_fire_equipment_overdue */', [
        { id: '9', code: 'ANT-07', name: 'Antincendio campo', type: 'FIRE_PROTECTION' },
      ]);
      const r = await service.getAnomalies();
      expect(r.plants_fire_equipment_overdue).toEqual({
        count: 1,
        items: [{ id: 9, code: 'ANT-07', name: 'Antincendio campo', type: 'FIRE_PROTECTION' }],
      });
      const sql = sqlOf('/* plants_fire_equipment_overdue */');
      expect(sql).toContain("e.equipment_type = 'EXTINGUISHER'");
      expect(sql).toContain('e.deleted = 0');
      expect(sql).toContain('p.deleted = 0');
      expect(sql).toContain('LAST_DAY(e.revision_due_on) < t.today');
      expect(sql).toContain('LAST_DAY(e.test_due_on) < t.today');
      expect(sql).toContain('INTERVAL 6 MONTH');
      expect(sql).toContain("p.type = 'FIRE_PROTECTION'");
      // Stessa data di oggi del calcolo in Node (plant.calc), non CURDATE() di MySQL.
      expect(sql).not.toContain('CURDATE()');
      const call = query.mock.calls.find(([s]) => String(s).includes('/* plants_fire_equipment_overdue */'));
      expect(call?.[1]).toEqual([expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/)]);
    });

    it('impianti senza le verifiche obbligatorie per legge (registrate con data)', async () => {
      only('/* plants_missing_inspections */', [
        { id: '1', code: 'MSV 001', name: 'Ascensore', type: 'ELEVATOR', status: 'ACTIVE',
          grounding_class: null, lightning_protection: null, power_kw: null, dated_kinds: null },
        { id: '2', code: 'ELE-1', name: 'Scuola', type: 'ELECTRICAL_SYSTEM', status: 'ACTIVE',
          grounding_class: 'HIGH_RISK', lightning_protection: 1, power_kw: null,
          dated_kinds: 'Messa a terra (DPR 462/01)' },
        { id: '3', code: 'TERM-1', name: 'Caldaia piccola', type: 'THERMAL', status: 'ACTIVE',
          grounding_class: null, lightning_protection: null, power_kw: '8.00', dated_kinds: null },
        { id: '4', code: 'ELE-2', name: 'In regola', type: 'ELECTRICAL_SYSTEM', status: 'ACTIVE',
          grounding_class: 'ORDINARY', lightning_protection: 0, power_kw: null,
          dated_kinds: 'Manutenzione\nMessa a terra (DPR 462/01)' },
      ]);
      const r = await service.getAnomalies();
      expect(r.plants_missing_inspections).toEqual({
        count: 2,
        items: [
          { id: 1, code: 'MSV 001', name: 'Ascensore', type: 'ELEVATOR',
            missing: 'Verifica periodica (ente notificato)' },
          { id: 2, code: 'ELE-1', name: 'Scuola', type: 'ELECTRICAL_SYSTEM',
            missing: 'Scariche atmosferiche (DPR 462/01)' },
        ],
      });
      const sql = sqlOf('/* plants_missing_inspections */');
      expect(sql).toContain('p.deleted = 0');
      expect(sql).toContain('i.deleted = 0');
      expect(sql).toContain('i.last_date IS NOT NULL OR i.next_date IS NOT NULL');
    });

    it('utenze con penali per energia reattiva negli ultimi 12 mesi', async () => {
      only('/* utilities_with_reactive_penalty */', [{ id: '31', utility_id: 'IT001E00000001', type: 'energia elettrica' }]);
      const r = await service.getAnomalies();
      expect(r.utilities_with_reactive_penalty).toEqual({
        count: 1,
        items: [{ id: 31, utility_id: 'IT001E00000001', type: 'energia elettrica' }],
      });
      const sql = sqlOf('/* utilities_with_reactive_penalty */');
      expect(sql).toContain('uc.reactive_penalty = 1');
      expect(sql).toContain("uc.kind = 'PERIOD'");
      expect(sql).toContain('uc.deleted = 0');
      expect(sql).toContain('u.deleted = 0');
      expect(sql).toContain('INTERVAL 365 DAY');
      expect(sql).not.toContain('CURDATE()');
      const call = query.mock.calls.find(([s]) => String(s).includes('/* utilities_with_reactive_penalty */'));
      expect(call?.[1]).toEqual([expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/)]);
    });
  });
});
