import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { itDataSource, resetTables } from '../../test/integration/data-source';
import { insertUtility, insertUtilityType } from '../../test/integration/fixtures';
import { UtilityType } from './entity/utility_type.entity';
import { HardTypeEnum } from './enum/hard-type.enum';
import { UtilityTypesService } from './utility-types.service';

describe('UtilityTypesService (integrazione): cambio del tipo contatore', () => {
  let ds: DataSource;
  let service: UtilityTypesService;

  beforeAll(async () => {
    ds = await itDataSource();
    service = new UtilityTypesService(ds.getRepository(UtilityType));
  });

  afterAll(() => ds.destroy());

  beforeEach(() => resetTables(ds, ['utilities']));

  it('rifiuta il cambio se una utenza ha una tipologia ARERA del tipo vecchio', async () => {
    const type = await insertUtilityType(ds, { hard_type: HardTypeEnum.LIGHT });
    await insertUtility(ds, { utility_type_id_fk: type, arera_category: 'EL_BT_OTHER' });
    await expect(service.update(type, { hard_type: HardTypeEnum.GAS }, -1)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rifiuta il cambio da gas se una utenza ha la categoria d’uso', async () => {
    const type = await insertUtilityType(ds, { hard_type: HardTypeEnum.GAS });
    await insertUtility(ds, { utility_type_id_fk: type, gas_use_category: 'C1' });
    await expect(service.update(type, { hard_type: HardTypeEnum.LIGHT }, -1)).rejects.toThrow(
      /1 utenze/,
    );
  });

  it('ammette il cambio con categorie compatibili, senza categorie o su utenze cancellate', async () => {
    const type = await insertUtilityType(ds, { hard_type: HardTypeEnum.LIGHT });
    await insertUtility(ds, { utility_type_id_fk: type, arera_category: 'GAS_DOMESTIC' });
    await insertUtility(ds, { utility_type_id_fk: type });
    await insertUtility(ds, {
      utility_type_id_fk: type,
      arera_category: 'EL_BT_OTHER',
      deleted: 1,
    });
    await expect(service.update(type, { hard_type: HardTypeEnum.GAS }, -1)).resolves.toBeDefined();
  });

  it('verso Internet (nessuna categoria ammessa) blocca ogni tipologia valorizzata', async () => {
    const type = await insertUtilityType(ds, { hard_type: HardTypeEnum.LIGHT });
    await insertUtility(ds, { utility_type_id_fk: type, arera_category: 'EL_BT_OTHER' });
    await expect(service.update(type, { hard_type: HardTypeEnum.INTERNET }, -1)).rejects.toThrow(
      BadRequestException,
    );
  });
});
