import { DataSource } from 'typeorm';
import { itDataSource, resetTables } from '../../test/integration/data-source';
import {
  insertConsipAgreement,
  insertContract,
  insertGrant,
  insertThirdParty,
} from '../../test/integration/fixtures';
import { PartyRole } from './enum/third-party.enum';
import { ThirdParty } from './entity/third-party.entity';
import { ThirdPartiesService } from './third-parties.service';

describe('ThirdPartiesService (integrazione): ruoli dai collegamenti', () => {
  let ds: DataSource;
  let service: ThirdPartiesService;

  beforeAll(async () => {
    ds = await itDataSource();
    service = new ThirdPartiesService(ds.getRepository(ThirdParty), ds);
  });

  afterAll(() => ds.destroy());

  beforeEach(() =>
    resetTables(ds, [
      'utilizer_grant_parties',
      'utilizer_grant',
      'consip_agreement',
      'contracts',
      'third_parties',
    ]),
  );

  const roles = async (id: number) => (await service.findOne(id))?.roles;

  it('fornitore: contratto di fornitura o convenzione non cancellati', async () => {
    const byContract = await insertThirdParty(ds);
    await insertContract(ds, { supplier_id_fk: byContract });
    const byAgreement = await insertThirdParty(ds);
    await insertConsipAgreement(ds, byAgreement);
    expect(await roles(byContract)).toEqual([PartyRole.SUPPLIER]);
    expect(await roles(byAgreement)).toEqual([PartyRole.SUPPLIER]);
  });

  it('contratti e convenzioni cancellati non danno il ruolo di fornitore', async () => {
    const party = await insertThirdParty(ds);
    await insertContract(ds, { supplier_id_fk: party, deleted: 1 });
    await insertConsipAgreement(ds, party, { deleted: 1 });
    expect(await roles(party)).toEqual([]);
  });

  it('locatore e conduttore dai contratti immobiliari non cancellati', async () => {
    const lessor = await insertThirdParty(ds);
    const tenant = await insertThirdParty(ds);
    const gone = await insertThirdParty(ds);
    await insertGrant(ds, [lessor], { direction: 'PASSIVE' });
    await insertGrant(ds, [tenant], { direction: 'ACTIVE' });
    await insertGrant(ds, [gone], { direction: 'ACTIVE', deleted: 1 });
    expect(await roles(lessor)).toEqual([PartyRole.LESSOR]);
    expect(await roles(tenant)).toEqual([PartyRole.TENANT]);
    expect(await roles(gone)).toEqual([]);
  });

  it('findAll: filtro per ruolo e ruoli completi su ogni riga', async () => {
    const both = await insertThirdParty(ds, { company_name: 'Alfa' });
    await insertContract(ds, { supplier_id_fk: both });
    await insertGrant(ds, [both], { direction: 'PASSIVE' });
    await insertThirdParty(ds, { company_name: 'Beta' });
    const rows = await service.findAll({ roles: [PartyRole.LESSOR] });
    expect(rows.map((r) => [r.id, r.roles])).toEqual([
      [both, [PartyRole.SUPPLIER, PartyRole.LESSOR]],
    ]);
  });
});
