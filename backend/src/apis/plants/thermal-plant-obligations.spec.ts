import { thermalPlantObligations } from './thermal-plant-obligations';

describe('thermalPlantObligations', () => {
  it('nessun obbligo senza potenza nota', () => {
    expect(thermalPlantObligations(null)).toEqual({
      efficiency_check_required: false,
      inail_required: false,
      vvf_required: false,
    });
  });

  it('controllo di efficienza da 10 kW in su', () => {
    expect(thermalPlantObligations(9.99).efficiency_check_required).toBe(false);
    expect(thermalPlantObligations(10).efficiency_check_required).toBe(true);
  });

  it('INAIL oltre 35 kW', () => {
    expect(thermalPlantObligations(35).inail_required).toBe(false);
    expect(thermalPlantObligations(35.1).inail_required).toBe(true);
  });

  it('VVF oltre 116 kW', () => {
    expect(thermalPlantObligations(116).vvf_required).toBe(false);
    expect(thermalPlantObligations(240).vvf_required).toBe(true);
  });

  it('accetta il decimale come stringa (colonna decimal MySQL)', () => {
    expect(thermalPlantObligations('170.00' as unknown as number).vvf_required).toBe(true);
  });
});
