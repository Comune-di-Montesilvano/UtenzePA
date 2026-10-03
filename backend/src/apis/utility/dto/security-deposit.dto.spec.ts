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
