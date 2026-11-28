import { DataSource } from 'typeorm';
import { AuditLogService } from '@apis/audit-log/audit-log.service';
import { AuditLog } from '@apis/audit-log/entity/audit-log.entity';
import { Asset } from '@apis/asset/entity/asset.entity';
import { Utility } from '@apis/utility/entity/utility.entity';
import { SYSTEM_USER_ID } from '@apis/system-users/system-user.constants';
import { itDataSource, resetTables } from '../../test/integration/data-source';
import {
  insert,
  insertInvoice,
  insertInvoiceLine,
  insertPlant,
  insertUtility,
  insertUtilityType,
} from '../../test/integration/fixtures';
import { ChapterDerivationService } from './chapter-derivation.service';
import * as q from './chapter-derivation.queries';

const AUTHOR = { created_by_user_id: SYSTEM_USER_ID, updated_by_user_id: SYSTEM_USER_ID };

describe('ChapterDerivationService (integrazione)', () => {
  let ds: DataSource;
  let service: ChapterDerivationService;
  const reconcile = { reconcileUtilities: jest.fn().mockResolvedValue(undefined) };
  let seq = 0;

  beforeAll(async () => {
    ds = await itDataSource();
    const audit = new AuditLogService(
      ds.getRepository(AuditLog),
      ds.getRepository(Asset),
      ds.getRepository(Utility),
    );
    service = new ChapterDerivationService(ds, audit, reconcile as never);
  });

  afterAll(() => ds.destroy());

  beforeEach(async () => {
    reconcile.reconcileUtilities.mockClear();
    await resetTables(ds, [
      'audit_logs',
      'invoice_commitment_shares',
      'budget_commitment_years',
      'budget_commitments',
      'invoice_lines',
      'invoices',
      'utility_assets',
      'utility_plants',
      'plant_assets',
      'plants',
      'assets',
      'utilities',
      'budget_chapters',
      'spending_destinations',
    ]);
  });

  const destination = (name: string) => insert(ds, 'spending_destinations', { ...AUTHOR, name });
  const asset = (over: Record<string, unknown> = {}) =>
    insert(ds, 'assets', { ...AUTHOR, asset_name: `Immobile ${++seq}`, ownership: 1, ...over });
  const chapter = (code: string, over: Record<string, unknown> = {}) =>
    insert(ds, 'budget_chapters', {
      ...AUTHOR,
      chapter_code: code,
      article: 0,
      description: `Capitolo ${code}`,
      ...over,
    });
  const utilityOf = async (id: number) =>
    (
      await ds.query(
        'SELECT budget_chapter_code_fk AS chapter, chapter_source AS source, update_date FROM utilities WHERE id = ?',
        [id],
      )
    )[0];

  it("ricava il capitolo dalla destinazione dell'immobile e segue i cambi", async () => {
    const d = await destination('Scuola materna');
    const c1 = await chapter('1210', { spending_destination_id: d, hard_type: 'LIGHT' });
    const c2 = await chapter('9999');
    const c3 = await chapter('1300');
    const a = await asset({ spending_destination_id: d });
    const light = await insertUtilityType(ds, { hard_type: 'LIGHT' });
    const u = await insertUtility(ds, { utility_type_id_fk: light, budget_chapter_code_fk: c2 });
    await insert(ds, 'utility_assets', { utility_id: u, asset_id: a });
    const before = (await utilityOf(u)).update_date;

    await service.requestAll();
    let row = await utilityOf(u);
    expect(Number(row.chapter)).toBe(c1);
    expect(row.source).toBe('DERIVED');
    expect(row.update_date).toEqual(before);
    const audits = await ds.query(
      "SELECT user_id, old_value, new_value FROM audit_logs WHERE entity_name = 'utilities' AND entity_id = ?",
      [u],
    );
    expect(audits).toHaveLength(1);
    expect(Number(audits[0].user_id)).toBe(SYSTEM_USER_ID);
    expect(reconcile.reconcileUtilities).toHaveBeenCalledWith([u]);
    expect(service.lastResults().get(u)?.chapter_id).toBe(c1);

    // Secondo giro senza cambi: nessuna scrittura.
    reconcile.reconcileUtilities.mockClear();
    await service.requestAll();
    expect(reconcile.reconcileUtilities).not.toHaveBeenCalled();

    // Etichetta spostata da C1 a C3: l'utenza segue.
    await ds.query(
      'UPDATE budget_chapters SET spending_destination_id = NULL, hard_type = NULL WHERE id = ?',
      [c1],
    );
    await ds.query(
      "UPDATE budget_chapters SET spending_destination_id = ?, hard_type = 'LIGHT' WHERE id = ?",
      [d, c3],
    );
    await service.requestAll();
    expect(Number((await utilityOf(u)).chapter)).toBe(c3);

    // Immobile cancellato: capitolo invariato, torna a mano.
    await ds.query('UPDATE assets SET deleted = 1 WHERE id = ?', [a]);
    await service.requestAll();
    row = await utilityOf(u);
    expect(Number(row.chapter)).toBe(c3);
    expect(row.source).toBe('MANUAL');
    expect(service.lastResults().get(u)?.reason).toBe('no_destination');
  });

  it('chapterInfo: destinazione, immobile e spesa pagata su altri capitoli', async () => {
    const d = await destination('Scuola primaria');
    const own = await chapter('1300', { spending_destination_id: d });
    const other = await chapter('1400');
    const a = await asset({ spending_destination_id: d, asset_name: 'Scuola Rossi' });
    const u = await insertUtility(ds);
    await insert(ds, 'utility_assets', { utility_id: u, asset_id: a });
    await service.requestAll();
    const k = await insert(ds, 'budget_commitments', {
      ...AUTHOR,
      commitment_num: 1,
      budget_chapter_id_fk: other,
    });
    const day = new Date().toISOString().slice(0, 10);
    const inv = await insertInvoice(ds, { invoice_date: day });
    await insertInvoiceLine(ds, inv, 80, { utility_id_fk: u });
    await insert(ds, 'invoice_commitment_shares', {
      invoice_id_fk: inv,
      commitment_id_fk: k,
      fiscal_year: Number(day.slice(0, 4)),
      amount: 80,
      source: 'MANUAL',
    });

    const info = await service.chapterInfo(u);
    expect(info).toMatchObject({
      source: 'DERIVED',
      reason: null,
      destination: { id: d, name: 'Scuola primaria' },
      via: { kind: 'asset', id: a, label: 'Scuola Rossi' },
      chapter_label: '1300/0',
    });
    expect(info!.paid_elsewhere).toEqual([
      { chapter_label: '1400/0', amount: 80, months: [day.slice(0, 7)] },
    ]);
    expect(own).toBeGreaterThan(0);
  });

  it('chapterInfo: fattura multi-POD divisa correttamente tra i capitoli = niente pagato altrove', async () => {
    const d = await destination('Scuola media');
    const own = await chapter('1500', { spending_destination_id: d });
    const other = await chapter('1600');
    const a = await asset({ spending_destination_id: d, asset_name: 'Scuola Verdi' });
    const u = await insertUtility(ds);
    const v = await insertUtility(ds, { budget_chapter_code_fk: other });
    await insert(ds, 'utility_assets', { utility_id: u, asset_id: a });
    await service.requestAll();
    const day = new Date().toISOString().slice(0, 10);
    const year = Number(day.slice(0, 4));
    const kOwn = await insert(ds, 'budget_commitments', {
      ...AUTHOR,
      commitment_num: 11,
      budget_chapter_id_fk: own,
    });
    const kOther = await insert(ds, 'budget_commitments', {
      ...AUTHOR,
      commitment_num: 12,
      budget_chapter_id_fk: other,
    });
    const inv = await insertInvoice(ds, { invoice_date: day });
    await insertInvoiceLine(ds, inv, 80, { utility_id_fk: u });
    await insertInvoiceLine(ds, inv, 20, { utility_id_fk: v });
    for (const [k, amount] of [
      [kOwn, 80],
      [kOther, 20],
    ])
      await insert(ds, 'invoice_commitment_shares', {
        invoice_id_fk: inv,
        commitment_id_fk: k,
        fiscal_year: year,
        amount,
        source: 'MANUAL',
      });

    expect((await service.chapterInfo(u))!.paid_elsewhere).toEqual([]);
    expect((await service.chapterInfo(v))!.paid_elsewhere).toEqual([]);
  });

  it('destinazione inesistente o cancellata: 400; nessuna destinazione: ok', async () => {
    const d = await destination('Asilo nido');
    await expect(service.assertDestinationUsable(null)).resolves.toBeUndefined();
    await expect(service.assertDestinationUsable(undefined)).resolves.toBeUndefined();
    await expect(service.assertDestinationUsable(d)).resolves.toBeUndefined();
    await expect(service.assertDestinationUsable(d + 1000)).rejects.toThrow(
      'Destinazione di spesa non trovata',
    );
    await ds.query('UPDATE spending_destinations SET deleted = 1 WHERE id = ?', [d]);
    await expect(service.assertDestinationUsable(d)).rejects.toThrow(
      'Destinazione di spesa non trovata',
    );
  });

  it('tipo utenza cancellato: natura sconosciuta, vale il capitolo «tutte le nature»', async () => {
    const d = await destination('Palestre');
    await chapter('1700', { spending_destination_id: d, hard_type: 'GAS' });
    const all = await chapter('1701', { spending_destination_id: d });
    const t = await insertUtilityType(ds, { hard_type: 'GAS', deleted: 1 });
    const a = await asset({ spending_destination_id: d });
    const u = await insertUtility(ds, { utility_type_id_fk: t });
    await insert(ds, 'utility_assets', { utility_id: u, asset_id: a });
    await service.requestAll();
    expect(Number((await utilityOf(u)).chapter)).toBe(all);
  });

  it('nessuna utenza: currentResults non ricalcola a ogni chiamata', async () => {
    await service.requestAll();
    const spy = jest.spyOn(q, 'derivationUtilities');
    try {
      await service.currentResults();
      await service.currentResults();
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it('indice unico su destinazione + natura tra i capitoli non cancellati', async () => {
    const d = await destination('Uffici');
    await chapter('1800', { spending_destination_id: d, hard_type: 'LIGHT' });
    await expect(
      chapter('1801', { spending_destination_id: d, hard_type: 'LIGHT' }),
    ).rejects.toThrow(/Duplicate entry/);
    await chapter('1802', { spending_destination_id: d });
    await expect(chapter('1803', { spending_destination_id: d })).rejects.toThrow(
      /Duplicate entry/,
    );
    await chapter('1804', { spending_destination_id: d, hard_type: 'LIGHT', deleted: 1 });
    await chapter('1805');
    await chapter('1806');
  });

  it("impianto senza destinazione: vale quella dell'immobile dell'impianto", async () => {
    const d = await destination('Illuminazione pubblica');
    const c = await chapter('1500', { spending_destination_id: d });
    const a = await asset({ spending_destination_id: d });
    const p = await insertPlant(ds);
    await insert(ds, 'plant_assets', { plant_id: p, asset_id: a });
    const u = await insertUtility(ds);
    await insert(ds, 'utility_plants', { utility_id: u, plant_id: p });

    await service.requestAll();
    expect(Number((await utilityOf(u)).chapter)).toBe(c);
  });
});
