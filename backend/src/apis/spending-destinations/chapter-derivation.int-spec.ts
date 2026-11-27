import { DataSource } from 'typeorm';
import { AuditLogService } from '@apis/audit-log/audit-log.service';
import { AuditLog } from '@apis/audit-log/entity/audit-log.entity';
import { Asset } from '@apis/asset/entity/asset.entity';
import { Utility } from '@apis/utility/entity/utility.entity';
import { SYSTEM_USER_ID } from '@apis/system-users/system-user.constants';
import { itDataSource, resetTables } from '../../test/integration/data-source';
import {
  insert,
  insertPlant,
  insertUtility,
  insertUtilityType,
} from '../../test/integration/fixtures';
import { ChapterDerivationService } from './chapter-derivation.service';

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
