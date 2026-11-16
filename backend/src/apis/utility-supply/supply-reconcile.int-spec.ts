import { DataSource } from 'typeorm';
import { SYSTEM_USER_ID } from '@apis/system-users/system-user.constants';
import { itDataSource, resetTables } from '../../test/integration/data-source';
import {
  insert,
  insertGrant,
  insertThirdParty,
  insertUtility,
} from '../../test/integration/fixtures';
import { SupplyReconcileService } from './supply-reconcile.service';

const AUTHOR = { created_by_user_id: SYSTEM_USER_ID, updated_by_user_id: SYSTEM_USER_ID };

describe('SupplyReconcileService (integrazione)', () => {
  let ds: DataSource;
  let service: SupplyReconcileService;
  let seq = 0;

  beforeAll(async () => {
    ds = await itDataSource();
    service = new SupplyReconcileService(ds);
  });

  afterAll(() => ds.destroy());

  beforeEach(() =>
    resetTables(ds, [
      'utility_supply_events',
      'utilizer_grant_utility_decisions',
      'utilizer_grant_assets',
      'utilizer_grant_parties',
      'utilizer_grant',
      'utility_assets',
      'assets',
      'utilities',
      'third_parties',
    ]),
  );

  const asset = (over: Record<string, unknown> = {}) =>
    insert(ds, 'assets', { ...AUTHOR, asset_name: `Immobile ${++seq}`, ownership: 1, ...over });
  const link = (utility: number, assetId: number) =>
    insert(ds, 'utility_assets', { utility_id: utility, asset_id: assetId });
  const cover = (grant: number, assetId: number) =>
    insert(ds, 'utilizer_grant_assets', { utilizer_grant_id: grant, asset_id: assetId });
  const event = (utility: number, over: Record<string, unknown> = {}) =>
    insert(ds, 'utility_supply_events', {
      ...AUTHOR,
      utility_id_fk: utility,
      type: 'ACTIVATION',
      effective_on: '2020-01-01',
      ...over,
    });
  const decision = (grant: number, utility: number, over: Record<string, unknown> = {}) =>
    insert(ds, 'utilizer_grant_utility_decisions', {
      utilizer_grant_id_fk: grant,
      utility_id_fk: utility,
      ...over,
    });
  // Utenza attiva dal 2020 coperta dal contratto tramite un immobile.
  const activeCovered = async (grant: number) => {
    const u = await insertUtility(ds);
    await event(u);
    const a = await asset();
    await link(u, a);
    await cover(grant, a);
    return u;
  };
  const events = async (utility: number) =>
    (
      await ds.query(
        'SELECT type, third_party_id_fk, utilizer_grant_id_fk, cancelled_on IS NOT NULL AS cancelled, created_by_user_id FROM utility_supply_events WHERE utility_id_fk = ? AND deleted = 0 ORDER BY id',
        [utility],
      )
    ).map((e: Record<string, unknown>) => ({ ...e, cancelled: Number(e.cancelled) }));
  const state = async (utility: number) =>
    (
      await ds.query(
        'SELECT supply_active, cost_status, transferred_to_third_party_id FROM utilities WHERE id = ?',
        [utility],
      )
    )[0];
  const grantOf = (parties: number[], over: Record<string, unknown> = {}) =>
    insertGrant(ds, parties, { status: 'ACTIVE', start_date: '2020-01-01', ...over });

  describe('utilityIdsOfGrant', () => {
    it('utenze da immobili, decisioni e storico; mai cancellate né da immobili cancellati', async () => {
      const g = await grantOf([]);
      const byAsset = await insertUtility(ds);
      const a = await asset();
      await link(byAsset, a);
      await cover(g, a);
      const byDeletedAsset = await insertUtility(ds);
      const gone = await asset({ deleted: 1 });
      await link(byDeletedAsset, gone);
      await cover(g, gone);
      const deletedUtility = await insertUtility(ds, { deleted: 1 });
      await link(deletedUtility, a);
      const byDecision = await insertUtility(ds);
      await decision(g, byDecision);
      const byEvent = await insertUtility(ds);
      await event(byEvent, { utilizer_grant_id_fk: g });
      const byDeletedEvent = await insertUtility(ds);
      await event(byDeletedEvent, { utilizer_grant_id_fk: g, deleted: 1 });
      // Stessa utenza da più strade: una volta sola.
      await decision(g, byAsset);

      const ids = await service.utilityIdsOfGrant(g);
      expect([...ids].sort((x, y) => x - y)).toEqual([byAsset, byDecision, byEvent]);
    });
  });

  describe('lockUtility', () => {
    it('restituisce id e stato di cancellazione, null se non esiste', async () => {
      const live = await insertUtility(ds);
      const deleted = await insertUtility(ds, { deleted: 1 });
      await ds.transaction(async (m) => {
        expect(await service.lockUtility(m, live)).toEqual({ id: live, deleted: false });
        expect(await service.lockUtility(m, deleted)).toEqual({ id: deleted, deleted: true });
        expect(await service.lockUtility(m, 999999)).toBeNull();
      });
    });
  });

  describe('reconcileAll', () => {
    it('passa tutte le utenze non cancellate', async () => {
      await activeCovered(await grantOf([]));
      await insertUtility(ds);
      await insertUtility(ds, { deleted: 1 });
      const result = await service.reconcileAll();
      expect(result).toEqual({ processed: 2, changed: 1, failed: 0 });
    });
  });

  describe('listDecisions', () => {
    it('solo utenze attive coperte da immobili non cancellati, in ordine di id', async () => {
      const party = await insertThirdParty(ds);
      const g = await grantOf([party], { utilities_to_be_taken_over: 1 });
      const first = await activeCovered(g);
      const second = await activeCovered(g);
      // Senza riga: la proposta del contratto la applica solo applyProposal.
      // Coperta ma senza storico (non attiva): niente da decidere.
      const inactive = await insertUtility(ds);
      const a = await asset();
      await link(inactive, a);
      await cover(g, a);
      await decision(g, second, { decision: 'STAYS' });

      const rows = await service.listDecisions(g);
      expect(rows.map((r) => [r.utility_id, r.decision, r.proposal])).toEqual([
        [first, null, 'FOLLOWS'],
        [second, 'STAYS', 'FOLLOWS'],
      ]);
    });

    it('contratto cancellato o passivo: non trovato', async () => {
      const deleted = await grantOf([], { deleted: 1 });
      const passive = await grantOf([], { direction: 'PASSIVE' });
      await expect(service.listDecisions(deleted)).rejects.toThrow(
        'Contratto immobiliare non trovato.',
      );
      await expect(service.listDecisions(passive)).rejects.toThrow(
        'Contratto immobiliare non trovato.',
      );
    });
  });

  describe('setDecision', () => {
    it('FOLLOWS senza parte indicata: l’unica parte non cancellata, voltura in sospeso', async () => {
      const party = await insertThirdParty(ds);
      const deletedParty = await insertThirdParty(ds, { deleted: 1 });
      const g = await grantOf([party, deletedParty]);
      const u = await activeCovered(g);

      await service.setDecision(g, u, { decision: 'FOLLOWS' as never }, SYSTEM_USER_ID);
      expect(await events(u)).toEqual([
        expect.objectContaining({ type: 'ACTIVATION', cancelled: 0 }),
        expect.objectContaining({
          type: 'TRANSFER',
          third_party_id_fk: party,
          utilizer_grant_id_fk: g,
          cancelled: 0,
        }),
      ]);
      expect(await state(u)).toEqual(
        expect.objectContaining({ supply_active: 1, cost_status: 'TO_TRANSFER' }),
      );
    });

    it('STAYS dopo FOLLOWS: la voltura in sospeso viene annullata', async () => {
      const party = await insertThirdParty(ds);
      const g = await grantOf([party]);
      const u = await activeCovered(g);
      await service.setDecision(g, u, { decision: 'FOLLOWS' as never }, SYSTEM_USER_ID);
      await service.setDecision(g, u, { decision: 'STAYS' as never }, SYSTEM_USER_ID);
      expect(
        (await events(u)).map((e: { type: string; cancelled: number }) => [e.type, e.cancelled]),
      ).toEqual([
        ['ACTIVATION', 0],
        ['TRANSFER', 1],
      ]);
      expect((await state(u)).cost_status).toBe('COMUNE');
    });

    it('contratto scaduto: non in corso', async () => {
      const party = await insertThirdParty(ds);
      const g = await grantOf([party], { end_date: '2021-01-01' });
      const u = await activeCovered(g);
      await expect(
        service.setDecision(g, u, { decision: 'FOLLOWS' as never }, SYSTEM_USER_ID),
      ).rejects.toThrow('Il contratto immobiliare non è in corso.');
    });

    it('utenza non coperta dal contratto: rifiutata', async () => {
      const party = await insertThirdParty(ds);
      const g = await grantOf([party]);
      const u = await insertUtility(ds);
      await event(u);
      await expect(
        service.setDecision(g, u, { decision: 'FOLLOWS' as never }, SYSTEM_USER_ID),
      ).rejects.toThrow("L'utenza non è collegata al contratto immobiliare.");
    });
  });

  describe('reconcile', () => {
    it('contratto con decisione da prendere: utenza «Da decidere»', async () => {
      const party = await insertThirdParty(ds);
      const g = await grantOf([party]);
      const u = await activeCovered(g);
      await service.reconcile(u);
      expect((await state(u)).cost_status).toBe('TO_DECIDE');
    });

    it('voltura legata a un contratto poi eliminato: si torna al Comune', async () => {
      const party = await insertThirdParty(ds);
      const g = await grantOf([party]);
      const u = await activeCovered(g);
      await service.setDecision(g, u, { decision: 'FOLLOWS' as never }, SYSTEM_USER_ID);
      await ds.query(
        "UPDATE utility_supply_events SET effective_on = '2021-01-01' WHERE type = 'TRANSFER'",
      );
      await service.reconcile(u);
      expect((await state(u)).cost_status).toBe('TRANSFERRED');

      await ds.query('UPDATE utilizer_grant SET deleted = 1 WHERE id = ?', [g]);
      await service.reconcile(u);
      expect((await events(u)).map((e: { type: string }) => e.type)).toEqual([
        'ACTIVATION',
        'TRANSFER',
        'RETURN',
      ]);
      // Riga automatica del giro senza utente: autore = primo utente (di sistema).
      expect((await events(u))[2].created_by_user_id).toBe(SYSTEM_USER_ID);
      expect((await state(u)).cost_status).toBe('TO_RECOVER');
    });
  });
});
