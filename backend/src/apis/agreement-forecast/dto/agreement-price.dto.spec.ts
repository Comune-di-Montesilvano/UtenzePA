import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { AgreementPriceDto } from './agreement-price.dto';

const errorsOf = (body: object): string[] =>
  validateSync(plainToInstance(AgreementPriceDto, body)).flatMap((e) =>
    Object.values(e.constraints ?? {}),
  );

describe('AgreementPriceDto', () => {
  it('numero positivo o null (torna al proposto): valido', () => {
    expect(errorsOf({ unit_price: 0.3 })).toEqual([]);
    expect(errorsOf({ unit_price: null })).toEqual([]);
  });

  it('campo assente: 400, non torna al proposto per sbaglio', () => {
    expect(errorsOf({})).toContain('Il costo unitario deve essere un numero.');
  });

  it('oltre il massimo della colonna: 400, non 500', () => {
    expect(errorsOf({ unit_price: 1_000_000 })).toContain(
      'Il costo unitario non può superare 999999 €.',
    );
  });
});
