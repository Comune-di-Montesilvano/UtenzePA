import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateUtilityDto } from './create-utility.dto';
import { UpdateUtilityDto } from './update-utility.dto';

// Deposito cauzionale: vuoto = non noto (null), mai 0.
describe('security_deposit', () => {
  it.each([
    ['create', CreateUtilityDto],
    ['update', UpdateUtilityDto],
  ])('%s: stringa vuota → null, valido', async (_l, Dto) => {
    const dto = plainToInstance(Dto as never, { security_deposit: '' }) as {
      security_deposit: unknown;
    };
    expect(dto.security_deposit).toBeNull();
    const errors = (await validate(dto as object)).filter((e) => e.property === 'security_deposit');
    expect(errors).toEqual([]);
  });

  it('update: importo negativo rifiutato', async () => {
    const dto = plainToInstance(UpdateUtilityDto, { security_deposit: '-1' });
    const errors = (await validate(dto)).filter((e) => e.property === 'security_deposit');
    expect(errors).not.toEqual([]);
  });
});

// null resta null (prima l'update faceva Number(null) = 0 a ogni salvataggio).
describe('numeri facoltativi null', () => {
  it.each([
    ['create', CreateUtilityDto],
    ['update', UpdateUtilityDto],
  ])('%s: null resta null, valido', async (_l, Dto) => {
    const dto = plainToInstance(Dto as never, { security_deposit: null, power_kw_electric: null }) as Record<
      string,
      unknown
    >;
    expect(dto.security_deposit).toBeNull();
    expect(dto.power_kw_electric).toBeNull();
    const errors = (await validate(dto as object)).filter((e) =>
      ['security_deposit', 'power_kw_electric'].includes(e.property),
    );
    expect(errors).toEqual([]);
  });

  it('update: stringa numerica convertita', () => {
    const dto = plainToInstance(UpdateUtilityDto, { security_deposit: '12.5', power_kw_electric: '3' });
    expect(dto.security_deposit).toBe(12.5);
    expect(dto.power_kw_electric).toBe(3);
  });
});

// Testi facoltativi non compilati: null, mai ''.
describe('testi facoltativi vuoti', () => {
  it.each([
    ['create', CreateUtilityDto],
    ['update', UpdateUtilityDto],
  ])("%s: '' e spazi diventano null, testo invariato", (_l, Dto) => {
    const dto = plainToInstance(Dto as never, {
      utility_code: '',
      meter_number: '  ',
      notes: '',
      supplier_address: 'Via Roma 1',
    }) as Record<string, unknown>;
    expect(dto.utility_code).toBeNull();
    expect(dto.meter_number).toBeNull();
    expect(dto.notes).toBeNull();
    expect(dto.supplier_address).toBe('Via Roma 1');
  });
});
