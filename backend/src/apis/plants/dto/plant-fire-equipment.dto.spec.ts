import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdatePlantFireEquipmentDto } from './plant-fire-equipment.dto';

// Il null esplicito sulla quantità è respinto dal service (PartialType rende
// ogni campo della modifica facoltativo anche a null).
describe('UpdatePlantFireEquipmentDto', () => {
  const errorsOf = async (body: object) =>
    (await validate(plainToInstance(UpdatePlantFireEquipmentDto, body))).map((e) => e.property);

  it('quantità assente: valida', async () => {
    expect(await errorsOf({ location: 'corridoio' })).toEqual([]);
  });

  it('quantità 0 o decimale: non valida', async () => {
    expect(await errorsOf({ quantity: 0 })).toEqual(['quantity']);
    expect(await errorsOf({ quantity: 1.5 })).toEqual(['quantity']);
  });
});
