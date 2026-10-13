import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PlantElevatorDto } from './plant-elevator.dto';

describe('PlantElevatorDto: capienza, accessi, corsa, norma, SIM', () => {
  const errorsOf = async (body: object) =>
    (await validate(plainToInstance(PlantElevatorDto, body))).map((e) => e.property);

  it('valori dalle schede del registro ascensori', async () => {
    expect(
      await errorsOf({
        capacity_persons: 13,
        entrances: 1,
        travel_m: 8.1,
        technical_standard: 'UNI 81-1/2:1998',
        emergency_sim: true,
      }),
    ).toEqual([]);
  });

  it('tutti facoltativi, anche null (dato non noto)', async () => {
    expect(
      await errorsOf({
        capacity_persons: null,
        entrances: null,
        travel_m: null,
        technical_standard: null,
        emergency_sim: null,
      }),
    ).toEqual([]);
  });

  it('valori non ammessi', async () => {
    expect(await errorsOf({ capacity_persons: -1 })).toEqual(['capacity_persons']);
    expect(await errorsOf({ entrances: 1.5 })).toEqual(['entrances']);
    expect(await errorsOf({ travel_m: 8.123 })).toEqual(['travel_m']);
    expect(await errorsOf({ emergency_sim: 'si' })).toEqual(['emergency_sim']);
  });
});
