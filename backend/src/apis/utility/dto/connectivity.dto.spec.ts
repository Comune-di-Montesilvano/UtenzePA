import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateUtilityDto } from './create-utility.dto';
import { UpdateUtilityDto } from './update-utility.dto';

// Dati tecnici della connettività e date di attivazione/cessazione.
describe('connettività e date', () => {
  const errorsOf = async (Dto: new () => object, plain: Record<string, unknown>, property: string) =>
    (await validate(plainToInstance(Dto as never, plain) as object)).filter((e) => e.property === property);

  it.each([
    ['create', CreateUtilityDto],
    ['update', UpdateUtilityDto],
  ])('%s: tecnologia fuori elenco rifiutata, FTTH ammessa, null ammesso', async (_l, Dto) => {
    expect(await errorsOf(Dto, { internet_technology: 'PIGEON' }, 'internet_technology')).not.toEqual([]);
    expect(await errorsOf(Dto, { internet_technology: 'FTTH' }, 'internet_technology')).toEqual([]);
    expect(await errorsOf(Dto, { internet_technology: null }, 'internet_technology')).toEqual([]);
  });

  it.each([
    ['create', CreateUtilityDto],
    ['update', UpdateUtilityDto],
  ])('%s: velocità in Mbit/s non negative, stringa vuota = non nota', async (_l, Dto) => {
    for (const field of ['download_mbps', 'upload_mbps', 'guaranteed_mbps']) {
      expect(await errorsOf(Dto, { [field]: -1 }, field)).not.toEqual([]);
      expect(await errorsOf(Dto, { [field]: '1000' }, field)).toEqual([]);
      const dto = plainToInstance(Dto as never, { [field]: '' }) as Record<string, unknown>;
      expect(dto[field]).toBeNull();
    }
  });

  it('modem incluso e IP statico: sì/no/non noto', async () => {
    for (const field of ['modem_included', 'static_ip']) {
      expect(await errorsOf(UpdateUtilityDto, { [field]: true }, field)).toEqual([]);
      expect(await errorsOf(UpdateUtilityDto, { [field]: null }, field)).toEqual([]);
      expect(await errorsOf(UpdateUtilityDto, { [field]: 'forse' }, field)).not.toEqual([]);
    }
  });

  it('date di attivazione e cessazione nel formato AAAA-MM-GG', async () => {
    expect(await errorsOf(UpdateUtilityDto, { activated_on: '2024-03-01' }, 'activated_on')).toEqual([]);
    expect(await errorsOf(UpdateUtilityDto, { ceased_on: null }, 'ceased_on')).toEqual([]);
  });
});
