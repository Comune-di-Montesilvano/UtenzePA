import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SearchUtilityDto } from './search-utility.dto';

const parse = async (query: Record<string, string>) => {
  const dto = plainToInstance(SearchUtilityDto, query);
  return { dto, errors: await validate(dto) };
};

describe('SearchUtilityDto filtri nuovi', () => {
  it('asset_function_ids da CSV a numeri; vuoto = nessun filtro', async () => {
    expect((await parse({ asset_function_ids: '3,5' })).dto.asset_function_ids).toEqual([3, 5]);
    expect((await parse({ asset_function_ids: '3' })).dto.asset_function_ids).toEqual([3]);
    const empty = await parse({ asset_function_ids: '' });
    expect(empty.dto.asset_function_ids).toBeUndefined();
    expect(empty.errors).toEqual([]);
  });

  it("plant_types accetta solo tipi d'impianto", async () => {
    const ok = await parse({ plant_types: 'FOUNTAIN,PUBLIC_LIGHTING' });
    expect(ok.dto.plant_types).toEqual(['FOUNTAIN', 'PUBLIC_LIGHTING']);
    expect(ok.errors).toEqual([]);
    expect((await parse({ plant_types: 'XYZ' })).errors).not.toEqual([]);
  });

  it('cost_status accetta solo i quattro stati', async () => {
    for (const s of ['COMUNE', 'TO_TRANSFER', 'TRANSFERRED', 'TO_RECOVER']) {
      expect((await parse({ cost_status: s })).errors).toEqual([]);
    }
    expect((await parse({ cost_status: 'ALTRO' })).errors).not.toEqual([]);
  });

  it('maintenance_status accetta solo i tre stati', async () => {
    for (const s of ['COMUNE', 'SUPPLIER', 'COUNTERPARTY']) {
      expect((await parse({ maintenance_status: s })).errors).toEqual([]);
    }
    expect((await parse({ maintenance_status: 'ALTRO' })).errors).not.toEqual([]);
  });

  it('grant_id numerico', async () => {
    expect((await parse({ grant_id: '12' })).dto.grant_id).toBe(12);
  });
});
