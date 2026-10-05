import { plainToInstance } from 'class-transformer';
import { IsOptional, validateSync } from 'class-validator';
import { DateRange } from './date-range.decorator';

class Dto {
  @IsOptional()
  @DateRange()
  expiry_range?: (string | null)[];
}

const parse = (expiry_range: unknown) => {
  const dto = plainToInstance(Dto, { expiry_range });
  return { range: dto.expiry_range, errors: validateSync(dto) };
};

describe('DateRange', () => {
  it('da e a da query string', () => {
    expect(parse('2026-01-01,2026-12-31')).toEqual({
      range: ['2026-01-01', '2026-12-31'],
      errors: [],
    });
  });

  it('solo "da": il secondo estremo resta vuoto', () => {
    expect(parse('2026-01-01,')).toEqual({ range: ['2026-01-01', null], errors: [] });
  });

  it('solo "a": resta in seconda posizione, non diventa "da"', () => {
    expect(parse(',2026-12-31')).toEqual({ range: [null, '2026-12-31'], errors: [] });
  });

  it('array già pronto', () => {
    expect(parse(['', '2026-12-31'])).toEqual({ range: [null, '2026-12-31'], errors: [] });
  });

  it('vuoto = nessun filtro', () => {
    expect(parse(',').range).toBeUndefined();
    expect(parse('').range).toBeUndefined();
  });

  it('rifiuta date non valide', () => {
    expect(parse('2026-02-30,').errors).toHaveLength(1);
    expect(parse('31/12/2026,').errors).toHaveLength(1);
  });
});

describe('DTO di ricerca con intervalli di date', () => {
  // Solo "a" (fino al): deve restare in seconda posizione in tutti i DTO.
  it.each([
    ['SearchContractDto', 'supply_expiry_date_range'],
    ['SearchConsipAgreementDto', 'expiration_date_range'],
    ['SearchUtilityDto', 'supply_start_date_range'],
    ['SearchUtilityDto', 'supply_expiry_date_range'],
    ['SearchUtilityDto', 'management_expiry_date_range'],
    ['SearchUtilityDto', 'takeover_termination_date_range'],
    ['SearchUtilityDto', 'water_concession_range'],
  ])('%s.%s', (cls, key) => {
    const dtos: Record<string, new () => object> = {
      SearchContractDto: require('@apis/contracts/dto/search-contract.dto').SearchContractDto,
      SearchConsipAgreementDto: require('@apis/consip-agreement/dto/search-consip-agreement.dto')
        .SearchConsipAgreementDto,
      SearchUtilityDto: require('@apis/utility/dto/search-utility.dto').SearchUtilityDto,
    };
    const dto = plainToInstance(dtos[cls], { [key]: ',2026-12-31' }) as Record<string, unknown>;
    expect(dto[key]).toEqual([null, '2026-12-31']);
    expect(validateSync(dto, { whitelist: true, forbidNonWhitelisted: true })).toEqual([]);
  });
});
