import { DataSource } from 'typeorm';
import { SdiStatus } from '@apis/invoices/enum/sdi-status.enum';
import { itDataSource, resetTables } from '../../test/integration/data-source';
import { SYSTEM_USER_ID } from '@apis/system-users/system-user.constants';
import {
  insert,
  insertContract,
  insertInvoice,
  insertInvoiceLine,
  insertThirdParty,
  insertUtility,
} from '../../test/integration/fixtures';
import { SpendingService } from './spending.service';

describe('SpendingService (integrazione)', () => {
  let ds: DataSource;
  let service: SpendingService;

  beforeAll(async () => {
    ds = await itDataSource();
    service = new SpendingService(ds);
  });

  afterAll(() => ds.destroy());

  beforeEach(() => resetTables(ds, ['invoice_lines', 'invoices', 'utilities']));

  describe('forUtility', () => {
    let utilityId: number;

    beforeEach(async () => {
      utilityId = await insertUtility(ds);
      await insertInvoiceLine(ds, await insertInvoice(ds), 100, { utility_id_fk: utilityId });
      await insertInvoiceLine(ds, await insertInvoice(ds), 50, { utility_id_fk: utilityId });
      // Riga di un'altra utenza: mai nella spesa di questa.
      const other = await insertUtility(ds);
      await insertInvoiceLine(ds, await insertInvoice(ds), 999, { utility_id_fk: other });
    });

    it('somma le righe per anno di competenza e conta le fatture', async () => {
      expect(await service.forUtility(utilityId)).toStrictEqual([
        { year: 2025, total: 150, invoices: 2 },
      ]);
    });

    it('esclude le fatture rifiutate dallo SDI', async () => {
      const rejected = await insertInvoice(ds, { sdi_status: SdiStatus.REJECTED });
      await insertInvoiceLine(ds, rejected, 70, { utility_id_fk: utilityId });
      expect(await service.forUtility(utilityId)).toStrictEqual([
        { year: 2025, total: 150, invoices: 2 },
      ]);
    });

    it('esclude le fatture cancellate', async () => {
      const deleted = await insertInvoice(ds, { deleted: 1 });
      await insertInvoiceLine(ds, deleted, 30, { utility_id_fk: utilityId });
      expect(await service.forUtility(utilityId)).toStrictEqual([
        { year: 2025, total: 150, invoices: 2 },
      ]);
    });
  });
  // Capitolo A con bilancio 2025, impegno pluriennale c1 (2025: 500, 2026 senza
  // importo) e preimpegno c4; capitolo B con c3. Fatture: I1 con quota su c1 (le
  // sue righe non contano sul capitolo), I2 senza quote (righe su uA e uB), I3
  // rifiutata, I4 compensata, I5 a cavallo d'anno (competenza 2026).
  describe('capitoli, contratto e immobile', () => {
    const who = { created_by_user_id: SYSTEM_USER_ID, updated_by_user_id: SYSTEM_USER_ID };
    let chA: number;
    let chB: number;
    let budget: number;
    let enel: number;
    let k: number;
    let c1: number;
    let c3: number;
    let c4: number;
    let uA: number;
    let uB: number;
    let i1: number;
    let i2: number;
    let i5: number;
    let s1: number;
    let l2a: number;
    let l5: number;

    const commitment = async (
      row: Record<string, unknown>,
      years: Record<number, number | null>,
      contracts: number[] = [],
    ) => {
      const id = await insert(ds, 'budget_commitments', { ...who, ...row });
      for (const [year, amount] of Object.entries(years))
        await insert(ds, 'budget_commitment_years', {
          commitment_id: id,
          fiscal_year: year,
          amount,
        });
      for (const c of contracts)
        await insert(ds, 'budget_commitment_contracts', { commitment_id: id, contract_id: c });
      return id;
    };

    beforeEach(async () => {
      await resetTables(ds, [
        'invoice_commitment_shares',
        'budget_commitment_contracts',
        'budget_commitment_years',
        'budget_commitments',
        'budget_chapter_spending',
        'utility_consumptions',
        'utility_assets',
        'contract_utilities',
        'assets',
        'budget_chapters',
        'contracts',
        'third_parties',
      ]);
      chA = await insert(ds, 'budget_chapters', {
        ...who,
        chapter_code: '1000',
        article: 0,
        description: 'Luce',
      });
      chB = await insert(ds, 'budget_chapters', {
        ...who,
        chapter_code: '2000',
        article: 1,
        description: 'Gas',
      });
      budget = await insert(ds, 'budget_chapter_spending', {
        ...who,
        budget_chapter_id_fk: chA,
        year: 2025,
        initial_budget: 1000,
        adjusted_budget: 1200,
        amount: 300,
        notes: 'Nota',
      });
      // Esercizio cancellato: mai contato.
      await insert(ds, 'budget_chapter_spending', {
        ...who,
        budget_chapter_id_fk: chA,
        year: 2024,
        adjusted_budget: 1,
        deleted: 1,
      });
      await insert(ds, 'budget_chapter_spending', {
        ...who,
        budget_chapter_id_fk: chB,
        year: 2025,
        adjusted_budget: 1,
        deleted: 1,
      });
      enel = await insertThirdParty(ds, { company_name: 'Enel' });
      k = await insertContract(ds, { supplier_id_fk: enel });
      c1 = await commitment(
        {
          commitment_year: 2025,
          commitment_num: 1,
          commitment_sub: 1,
          budget_chapter_id_fk: chA,
          supplier_id_fk: enel,
        },
        { 2025: 500, 2026: null },
        [k],
      );
      c4 = await commitment({ budget_chapter_id_fk: chA }, { 2024: 50 });
      await commitment(
        {
          commitment_year: 2025,
          commitment_num: 2,
          commitment_sub: 1,
          budget_chapter_id_fk: chA,
          deleted: 1,
        },
        { 2025: 9999 },
        [k],
      );
      c3 = await commitment(
        { commitment_year: 2025, commitment_num: 3, commitment_sub: 1, budget_chapter_id_fk: chB },
        { 2025: 300 },
        [k],
      );
      uA = await insertUtility(ds, {
        utility_id: 'POD-A',
        budget_chapter_code_fk: chA,
        supply_active: 1,
      });
      uB = await insertUtility(ds, { budget_chapter_code_fk: chB, supply_active: 1 });
      // Volturata: fuori dalle utenze in carico del contratto.
      const transferred = await insertUtility(ds, {
        budget_chapter_code_fk: chA,
        supply_active: 1,
        transferred_to_third_party_id: enel,
      });
      for (const u of [uA, uB, transferred])
        await insert(ds, 'contract_utilities', { contract_id: k, utility_id: u });

      i1 = await insertInvoice(ds, {
        invoice_id: 'F1',
        invoice_date: '2025-03-01',
        supplier_id_fk: enel,
        contratto_id_fk: k,
      });
      await insertInvoiceLine(ds, i1, 80, {
        utility_id_fk: uA,
        period_start: '2025-03-01',
        period_end: '2025-03-31',
      });
      s1 = await insert(ds, 'invoice_commitment_shares', {
        invoice_id_fk: i1,
        commitment_id_fk: c1,
        fiscal_year: 2025,
        amount: 80,
        source: 'AUTO',
      });
      i2 = await insertInvoice(ds, {
        invoice_id: 'F2',
        invoice_date: '2025-04-01',
        supplier_id_fk: enel,
        contratto_id_fk: k,
      });
      l2a = await insertInvoiceLine(ds, i2, 40, {
        utility_id_fk: uA,
        period_start: '2025-01-01',
        period_end: '2025-01-31',
      });
      await insertInvoiceLine(ds, i2, 10, { utility_id_fk: uB });
      const i3 = await insertInvoice(ds, { sdi_status: 'REJECTED', contratto_id_fk: k });
      await insertInvoiceLine(ds, i3, 999, { utility_id_fk: uA });
      const i4 = await insertInvoice(ds, {
        payment_status: 'COMPENSATED',
        invoice_date: '2025-05-01',
        contratto_id_fk: k,
      });
      await insertInvoiceLine(ds, i4, 7, { utility_id_fk: uA });
      i5 = await insertInvoice(ds, {
        invoice_id: 'F5',
        invoice_date: '2026-02-15',
        supplier_id_fk: enel,
      });
      l5 = await insertInvoiceLine(ds, i5, 25, {
        utility_id_fk: uA,
        period_start: '2025-12-20',
        period_end: '2026-02-10',
      });
    });

    it('forChapter: esercizi con bilancio, impegni e fatturato (quote, altrimenti righe)', async () => {
      const years = await service.forChapter(chA);
      expect(years.map((y) => y.year)).toEqual([2026, 2025, 2024]);
      expect(years[0]).toEqual(
        expect.objectContaining({
          spending_id: null,
          committed: 0,
          commitments: 1,
          commitments_without_amount: 1,
          remaining: null,
          invoiced: 25,
          invoices: 1,
          available: null,
          over_budget: false,
        }),
      );
      expect(years[1]).toStrictEqual({
        year: 2025,
        spending_id: budget,
        spending_source: 'MANUAL',
        initial_budget: 1000,
        adjusted_budget: 1200,
        recorded_spending: 300,
        notes: 'Nota',
        committed: 500,
        commitments: 1,
        commitments_without_amount: 0,
        remaining: 420,
        invoiced: 120,
        invoices: 2,
        available: 700,
        over_budget: false,
      });
      expect(years[2]).toEqual(
        expect.objectContaining({ committed: 50, remaining: 50, invoiced: 0, spending_id: null }),
      );
    });

    it('chaptersYear: un riepilogo per capitolo con dati nell’esercizio', async () => {
      const rows = await service.chaptersYear(2025);
      expect(rows.map((r) => [r.budget_chapter_id, r.committed, r.invoiced, r.invoices])).toEqual([
        [chA, 500, 120, 2],
        [chB, 300, 10, 1],
      ]);
      expect(rows[0].remaining).toBe(420);
      expect(rows[1].adjusted_budget).toBeNull();
    });

    it('chapterCommitments: impegni del capitolo con annualità, speso e contratti', async () => {
      expect(await service.chapterCommitments(chA)).toStrictEqual([
        {
          id: c1,
          label: '2025/1/1',
          fiscal_year: 2025,
          fiscal_years: [2025, 2026],
          amount: null,
          spent: 80,
          remaining: null,
          supplier: 'Enel',
          contract_ids: [k],
        },
        {
          id: c4,
          label: expect.any(String),
          fiscal_year: 2024,
          fiscal_years: [2024],
          amount: 50,
          spent: 0,
          remaining: 50,
          supplier: null,
          contract_ids: [],
        },
      ]);
    });

    it('chapterInvoiceLines: quote e righe delle fatture senza quote, dalla più recente', async () => {
      expect(await service.chapterInvoiceLines(chA)).toStrictEqual([
        {
          id: l5,
          kind: 'line',
          invoice_id: i5,
          number: 'F5',
          invoice_date: '2026-02-15',
          supplier: 'Enel',
          utility_id: uA,
          utility_code: 'POD-A',
          year: 2026,
          amount: 25,
        },
        {
          id: l2a,
          kind: 'line',
          invoice_id: i2,
          number: 'F2',
          invoice_date: '2025-04-01',
          supplier: 'Enel',
          utility_id: uA,
          utility_code: 'POD-A',
          year: 2025,
          amount: 40,
        },
        {
          id: s1,
          kind: 'share',
          invoice_id: i1,
          number: 'F1',
          invoice_date: '2025-03-01',
          supplier: 'Enel',
          utility_id: null,
          utility_code: null,
          year: 2025,
          amount: 80,
        },
      ]);
    });

    it('chaptersSummary: utenze in carico, impegni e speso per capitolo del contratto', async () => {
      const rows = await service.chaptersSummary(k);
      const a = rows.find((r) => r.budget_chapter_id === chA)!;
      const b = rows.find((r) => r.budget_chapter_id === chB)!;
      expect(rows).toHaveLength(2);
      expect(a).toEqual({
        budget_chapter_id: chA,
        chapter_code: '1000',
        article: 0,
        description: 'Luce',
        utilities: 1,
        committed: expect.arrayContaining([
          { year: 2025, amount: 500, commitment_id: c1 },
          { year: 2026, amount: null, commitment_id: c1 },
        ]),
        spent: [{ year: 2025, total: 120 }],
      });
      expect(a.committed).toHaveLength(2);
      expect(b).toEqual(
        expect.objectContaining({
          utilities: 1,
          committed: [{ year: 2025, amount: 300, commitment_id: c3 }],
          spent: [{ year: 2025, total: 10 }],
        }),
      );
    });

    it('forAsset: righe delle utenze dell’immobile e utenze condivise', async () => {
      const asset = await insert(ds, 'assets', { ...who, asset_name: 'Scuola', ownership: 1 });
      const otherAsset = await insert(ds, 'assets', {
        ...who,
        asset_name: 'Palestra',
        ownership: 1,
      });
      await insert(ds, 'utility_assets', { utility_id: uA, asset_id: asset });
      await insert(ds, 'utility_assets', { utility_id: uB, asset_id: asset });
      await insert(ds, 'utility_assets', { utility_id: uB, asset_id: otherAsset });
      expect(await service.forAsset(asset)).toStrictEqual({
        years: [
          { year: 2026, total: 25, invoices: 1 },
          { year: 2025, total: 137, invoices: 3 },
        ],
        shared_utilities: 1,
      });
    });

    it('budgetCheck: righe sul capitolo dell’utenza, quote sull’annualità; fattura stessa esclusa', async () => {
      expect(
        await service.budgetCheck({
          invoice_date: '2025-06-01',
          lines: [
            {
              utility_id_fk: uA,
              amount: 1081,
              period_start: '2025-05-01',
              period_end: '2025-05-31',
            },
          ],
        } as never),
      ).toStrictEqual([
        {
          budget_chapter_id: chA,
          chapter: '1000/0',
          year: 2025,
          invoiced: 1201,
          adjusted_budget: 1200,
        },
      ]);
      expect(
        await service.budgetCheck({
          invoice_id: i2,
          invoice_date: '2025-06-01',
          lines: [
            { utility_id_fk: uA, amount: 1120 },
            { utility_id_fk: uB, amount: 5000 },
          ],
        } as never),
      ).toEqual([]);
      expect(
        await service.budgetCheck({
          invoice_date: '2025-05-01',
          lines: [],
          commitment_shares: [{ commitment_id_fk: c1, amount: 1081 }],
        } as never),
      ).toStrictEqual([
        {
          budget_chapter_id: chA,
          chapter: '1000/0',
          year: 2025,
          invoiced: 1201,
          adjusted_budget: 1200,
        },
      ]);
    });

    it('chapterUtilityStats: utenze del capitolo, righe nei due periodi, anni con fatture', async () => {
      await insert(ds, 'utility_consumptions', {
        ...who,
        utility_id_fk: uA,
        kind: 'PERIOD',
        period_start: '2025-12-20',
        period_end: '2026-02-10',
        consumption: 100,
      });
      // Esercizio chiuso: finestre intere (2025 contro 2024), indipendenti da oggi.
      const stats = await service.chapterUtilityStats(chA, 2025);
      // Anni con fatture delle utenze del capitolo, più l'esercizio in corso.
      expect(stats.years).toEqual(
        [...new Set([new Date().getFullYear(), 2026, 2025])].sort((x, y) => y - x),
      );
      expect(stats.utilities.map((u) => [u.id, u.utility_code, u.active])).toEqual([
        [uA, 'POD-A', true],
        [expect.any(Number), expect.any(String), true],
      ]);
      const a = stats.utilities.find((u) => u.id === uA)!;
      // I1 + I2 + I4 (compensata: conta sull'utenza) + 12 dei 53 giorni di I5; I3 rifiutata no.
      expect(a.spend).toBeCloseTo(80 + 40 + 7 + (25 * 12) / 53, 2);
      expect(a.consumption).toBeCloseTo((100 * 12) / 53, 2);
      expect(a.previous_spend).toBe(0);
    });

    it('chapterUtilityStats: utenze di altri capitoli pagate sul capitolo, mesi e riconciliazione', async () => {
      // Fattura dell'utenza di chB liquidata su un impegno di chA, con una riga senza utenza.
      const i6 = await insertInvoice(ds, {
        invoice_id: 'F6',
        invoice_date: '2025-07-05',
        supplier_id_fk: enel,
        contratto_id_fk: k,
      });
      await insertInvoiceLine(ds, i6, 30, {
        utility_id_fk: uB,
        period_start: '2025-06-01',
        period_end: '2025-06-30',
      });
      await insertInvoiceLine(ds, i6, 5, { period_start: '2025-06-01', period_end: '2025-06-30' });
      await insert(ds, 'invoice_commitment_shares', {
        invoice_id_fk: i6,
        commitment_id_fk: c1,
        fiscal_year: 2025,
        amount: 35,
        source: 'AUTO',
      });

      const stats = await service.chapterUtilityStats(chA, 2025);
      const a = stats.utilities.find((u) => u.id === uA)!;
      const b = stats.utilities.find((u) => u.id === uB)!;
      // uA: I1 con quota su chA, I2 e I5 senza quote (capitolo dell'utenza), I4 compensata no.
      expect(a).toMatchObject({ on_chapter: true, months_elsewhere: ['2025-05'] });
      expect(a.paid_here).toBeCloseTo(80 + 40 + (25 * 12) / 53, 2);
      expect(a.paid_elsewhere).toBeCloseTo(7, 2);
      // uB (chB): I2 senza quote resta su chB, I6 pagata su chA.
      expect(b).toMatchObject({
        on_chapter: false,
        chapter_label: '2000/1',
        spend: 40,
        paid_here: 30,
        paid_elsewhere: 10,
        months_here: ['2025-06'],
        months_elsewhere: ['2025-04'],
      });
      expect(stats.summary.paid_here.others).toBe(30);
      expect(stats.summary.paid_here.without_utility).toBe(5);
      expect(stats.summary.own_elsewhere).toBeCloseTo(7, 2);
      // Riepilogo per tipo solo sulle utenze del capitolo.
      expect(stats.summary.types.reduce((t, x) => t + x.utilities + x.ceased, 0)).toBe(2);
    });
  });
});
