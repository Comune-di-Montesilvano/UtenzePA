import { DataSource } from 'typeorm';
import { Asset } from '@apis/asset/entity/asset.entity';
import { Plant } from '@apis/plants/entity/plant.entity';
import { itDataSource, resetTables } from '../../test/integration/data-source';
import {
  insert,
  insertContract,
  insertThirdParty,
  insertUtility,
  insertUtilityType,
} from '../../test/integration/fixtures';
import { Utility } from './entity/utility.entity';
import { UtilitiesService } from './utility.service';

const day = (offset: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
};

describe('UtilitiesService (integrazione)', () => {
  let ds: DataSource;
  let service: UtilitiesService;

  beforeAll(async () => {
    ds = await itDataSource();
    service = new UtilitiesService(
      ds.getRepository(Utility),
      ds.getRepository(Asset),
      {} as never,
      ds.getRepository(Plant),
      {} as never,
      {} as never,
      {} as never,
    );
  });

  afterAll(() => ds.destroy());

  beforeEach(() =>
    resetTables(ds, ['contract_utilities', 'contracts', 'utilities', 'third_parties']),
  );

  describe('findOne: contratto corrente', () => {
    // Campi del contratto corrente aggiunti alla riga da withCurrentContractFields.
    const supplierOf = async (id: number) =>
      ((await service.findOne(id)) as unknown as { supplier_id_fk: number | null } | null)
        ?.supplier_id_fk;

    const link = (utility: number, contract: number) =>
      insert(ds, 'contract_utilities', { utility_id: utility, contract_id: contract });

    async function contractFor(utility: number, over: Record<string, unknown>) {
      const supplier = await insertThirdParty(ds);
      const id = await insertContract(ds, { supplier_id_fk: supplier, ...over });
      await link(utility, id);
      return supplier;
    }

    it('il più recente già partito; esclusi chiusi, bozze, scaduti e cancellati', async () => {
      const u = await insertUtility(ds);
      await contractFor(u, { supply_start_date: day(-400) });
      const current = await contractFor(u, { supply_start_date: day(-30) });
      await contractFor(u, { supply_start_date: day(-10), closed: 1 });
      await contractFor(u, { supply_start_date: day(-10), draft: 1 });
      await contractFor(u, { supply_start_date: day(-10), deleted: 1 });
      await contractFor(u, { supply_start_date: day(-20), supply_expiry_date: day(-2) });
      expect(await supplierOf(u)).toBe(current);
    });

    it('un contratto che parte più avanti conta solo se non ce ne sono già partiti', async () => {
      const u = await insertUtility(ds);
      const started = await contractFor(u, { supply_start_date: day(-30) });
      await contractFor(u, { supply_start_date: day(30) });
      expect(await supplierOf(u)).toBe(started);

      const onlyFuture = await insertUtility(ds);
      const future = await contractFor(onlyFuture, { supply_start_date: day(30) });
      expect(await supplierOf(onlyFuture)).toBe(future);
    });

    it('a parità di data vince l’id più alto; senza contratti nessun fornitore', async () => {
      const u = await insertUtility(ds);
      await contractFor(u, { supply_start_date: day(-5) });
      const last = await contractFor(u, { supply_start_date: day(-5) });
      expect(await supplierOf(u)).toBe(last);
      expect(await supplierOf(await insertUtility(ds))).toBeNull();
    });
  });

  describe('tipologia ARERA ammessa dal tipo di utenza', () => {
    // Metodo privato, chiamato da create e update prima di ogni salvataggio.
    const assertArera = (type: number | null, category: string | null, gasUse: string | null) =>
      (
        service as unknown as {
          assertAreraCategory: (
            t: number | null,
            c: string | null,
            g: string | null,
          ) => Promise<void>;
        }
      ).assertAreraCategory(type, category, gasUse);

    it('categoria del tipo giusto e categoria d’uso solo sul gas', async () => {
      const light = await insertUtilityType(ds, { hard_type: 'LIGHT' });
      const gas = await insertUtilityType(ds, { hard_type: 'GAS' });
      await expect(assertArera(light, 'EL_BT_OTHER', null)).resolves.toBeUndefined();
      await expect(assertArera(gas, 'GAS_DOMESTIC', 'C1')).resolves.toBeUndefined();
      await expect(assertArera(light, 'GAS_DOMESTIC', null)).rejects.toThrow('Tipologia ARERA');
      await expect(assertArera(light, null, 'C1')).rejects.toThrow("Categoria d'uso");
      await expect(assertArera(null, 'EL_BT_OTHER', null)).rejects.toThrow('Tipologia ARERA');
      await expect(assertArera(null, null, null)).resolves.toBeUndefined();
    });
  });
});
