import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PlantElectricalDto } from './plant-electrical.dto';

const errorsFor = async (payload: Record<string, unknown>) =>
  (await validate(plainToInstance(PlantElectricalDto, payload))).map((e) => e.property);

describe('PlantElectricalDto', () => {
  it('accetta una scheda completa', async () => {
    expect(
      await errorsFor({
        supply: 'LV',
        grounding_class: 'HIGH_RISK',
        conformity_type: 'DICO',
        conformity_date: '2012-05-10',
        conformity_number: '12/2012',
        inail_date: '2012-06-01',
        inail_number: 'P-123',
        lightning_protection: false,
      }),
    ).toEqual([]);
  });

  it('accetta tutti i campi vuoti', async () => {
    expect(await errorsFor({})).toEqual([]);
  });

  it('rifiuta classificazione e date non valide', async () => {
    const errors = await errorsFor({ grounding_class: 'ALTRO', conformity_date: '2012-02-30' });
    expect(errors).toEqual(expect.arrayContaining(['grounding_class', 'conformity_date']));
  });
});
