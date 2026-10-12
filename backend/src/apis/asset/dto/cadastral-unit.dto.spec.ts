import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AssetMefFieldsDto, CadastralUnitDto } from './cadastral-unit.dto';

const errorsOf = async (cls: new () => object, plain: object) =>
  (await validate(plainToInstance(cls, plain))).map((e) => e.property);

describe('CadastralUnitDto', () => {
  it('rifiuta foglio o particella di soli spazi', async () => {
    expect(await errorsOf(CadastralUnitDto, { sheet: '  ', parcel: '' })).toEqual([
      'sheet',
      'parcel',
    ]);
  });

  it('rifiuta una rendita oltre decimal(15,2)', async () => {
    expect(
      await errorsOf(CadastralUnitDto, { sheet: '1', parcel: '2', cadastral_income: 1e14 }),
    ).toEqual(['cadastral_income']);
    expect(
      await errorsOf(CadastralUnitDto, {
        sheet: '1',
        parcel: '2',
        cadastral_income: 9999999999999.99,
      }),
    ).toEqual([]);
  });
});

describe('AssetMefFieldsDto', () => {
  it('rifiuta superfici e cubatura oltre le colonne', async () => {
    expect(
      await errorsOf(AssetMefFieldsDto, {
        reference_area_sqm: 1e8,
        appurtenance_area_sqm: 1e8,
        volume_m3: 1e10,
      }),
    ).toEqual(['reference_area_sqm', 'appurtenance_area_sqm', 'volume_m3']);
  });
});
