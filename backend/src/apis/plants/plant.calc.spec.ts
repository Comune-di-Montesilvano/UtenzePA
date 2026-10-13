import {
  computeNextDate,
  fireEquipmentDeadlines,
  fireEquipmentStatus,
  inspectionStatus,
  monthEnd,
  plantFireEquipmentStatus,
  positionQuality,
  resolvePlantPosition,
  suggestedInspections,
} from './plant.calc';
import { FireEquipmentType, InspectionStatus, PlantType, PositionQuality } from './enum/plant.enum';

const TODAY = '2026-10-02';

describe('computeNextDate', () => {
  it('ultima data + periodicità', () => {
    expect(computeNextDate('2025-03-15', 24)).toBe('2027-03-15');
  });
  it('fine mese: 31/01 + 1 mese = 28/02', () => {
    expect(computeNextDate('2026-01-31', 1)).toBe('2026-02-28');
  });
  it('null senza ultima data o senza periodicità', () => {
    expect(computeNextDate(null, 12)).toBeNull();
    expect(computeNextDate('2026-01-01', null)).toBeNull();
    expect(computeNextDate('2026-01-01', 0)).toBeNull();
  });
});

describe('inspectionStatus', () => {
  it('scaduta, in scadenza entro 60 giorni, ok, senza data', () => {
    expect(inspectionStatus('2026-10-01', TODAY)).toBe(InspectionStatus.OVERDUE);
    expect(inspectionStatus('2026-10-02', TODAY)).toBe(InspectionStatus.DUE_SOON);
    expect(inspectionStatus('2026-12-01', TODAY)).toBe(InspectionStatus.DUE_SOON);
    expect(inspectionStatus('2026-12-02', TODAY)).toBe(InspectionStatus.OK);
    expect(inspectionStatus(null, TODAY)).toBe(InspectionStatus.NO_DATE);
  });
});

describe('posizione impianto', () => {
  const none = {
    latitude: null,
    longitude: null,
    geocoded_latitude: null,
    geocoded_longitude: null,
    asset: null,
  };

  it('coordinate a mano = precisa', () => {
    const p = { ...none, latitude: '42.51', longitude: '14.14' };
    expect(positionQuality(p)).toBe(PositionQuality.PRECISE);
    expect(resolvePlantPosition(p)).toEqual({
      lat: '42.51',
      lng: '14.14',
      quality: PositionQuality.PRECISE,
    });
  });

  it('immobile contenitore con coordinate = dall’immobile, anche se l’impianto è geocodificato', () => {
    const p = {
      ...none,
      geocoded_latitude: '42.0',
      geocoded_longitude: '14.0',
      asset: {
        latitude: null,
        longitude: null,
        geocoded_latitude: '42.5',
        geocoded_longitude: '14.1',
      },
    };
    expect(positionQuality(p)).toBe(PositionQuality.FROM_ASSET);
    expect(resolvePlantPosition(p)?.lat).toBe('42.5');
  });

  it('immobile senza coordinate e impianto senza coordinate = assente', () => {
    const p = {
      ...none,
      asset: { latitude: null, longitude: null, geocoded_latitude: null, geocoded_longitude: null },
    };
    expect(positionQuality(p)).toBe(PositionQuality.MISSING);
    expect(resolvePlantPosition(p)).toBeNull();
  });

  it('solo geocodifica = stimata', () => {
    expect(
      positionQuality({ ...none, geocoded_latitude: '42.0', geocoded_longitude: '14.0' }),
    ).toBe(PositionQuality.ESTIMATED);
  });

  it('stringhe vuote trattate come assenti', () => {
    expect(positionQuality({ ...none, latitude: ' ', longitude: '' })).toBe(
      PositionQuality.MISSING,
    );
  });
});

describe('suggestedInspections', () => {
  it('ascensore: verifica biennale e manutenzione semestrale', () => {
    expect(suggestedInspections(PlantType.ELEVATOR)).toEqual([
      { kind: 'Verifica periodica (ente notificato)', period_months: 24 },
      { kind: 'Manutenzione ordinaria', period_months: 6 },
    ]);
  });
  it('termico: 48 mesi fino a 100 kW, 24 oltre', () => {
    expect(suggestedInspections(PlantType.THERMAL, 80)[0].period_months).toBe(48);
    expect(suggestedInspections(PlantType.THERMAL, 120)[0].period_months).toBe(24);
  });
  it('tipi senza obblighi: nessuna proposta', () => {
    expect(suggestedInspections(PlantType.FOUNTAIN)).toEqual([]);
  });
});

describe('scadenze estintori', () => {
  const ext = (
    o: Partial<{
      last_check_on: string | null;
      revision_due_on: string | null;
      test_due_on: string | null;
      deleted: boolean;
    }> = {},
  ) => ({
    equipment_type: FireEquipmentType.EXTINGUISHER as string,
    last_check_on: null,
    revision_due_on: null,
    test_due_on: null,
    ...o,
  });

  it('monthEnd: ultimo giorno del mese, anche febbraio', () => {
    expect(monthEnd('2017-01-01')).toBe('2017-01-31');
    expect(monthEnd('2024-02-01')).toBe('2024-02-29');
    expect(monthEnd('2026-02-15')).toBe('2026-02-28');
  });

  it('scadenze a fine mese, controllo = ultimo controllo + 6 mesi', () => {
    expect(
      fireEquipmentDeadlines(
        ext({ last_check_on: '2026-04-01', revision_due_on: '2027-01-01', test_due_on: '2030-03-01' }),
      ),
    ).toEqual([
      { kind: 'Controllo', due: '2026-10-31' },
      { kind: 'Revisione', due: '2027-01-31' },
      { kind: 'Collaudo', due: '2030-03-31' },
    ]);
  });

  it('scadenza nel mese corrente: non scaduta ma in scadenza', () => {
    expect(fireEquipmentStatus(ext({ revision_due_on: '2026-10-01' }), TODAY)).toBe(
      InspectionStatus.DUE_SOON,
    );
    expect(fireEquipmentStatus(ext({ revision_due_on: '2026-09-01' }), TODAY)).toBe(
      InspectionStatus.OVERDUE,
    );
  });

  it('stato = la peggiore delle tre; nessuna data = senza data', () => {
    expect(
      fireEquipmentStatus(ext({ revision_due_on: '2030-01-01', test_due_on: '2017-01-01' }), TODAY),
    ).toBe(InspectionStatus.OVERDUE);
    expect(fireEquipmentStatus(ext({ test_due_on: '2030-01-01' }), TODAY)).toBe(InspectionStatus.OK);
    expect(fireEquipmentStatus(ext(), TODAY)).toBe(InspectionStatus.NO_DATE);
  });

  it('gli altri tipi non hanno stato né scadenze', () => {
    const hydrant = { ...ext({ test_due_on: '2017-01-01' }), equipment_type: FireEquipmentType.HYDRANT };
    expect(fireEquipmentDeadlines(hydrant)).toEqual([]);
    expect(fireEquipmentStatus(hydrant, TODAY)).toBeNull();
  });

  it('impianto: peggiore tra gli estintori non cancellati, null senza estintori', () => {
    expect(
      plantFireEquipmentStatus(
        [ext({ test_due_on: '2030-01-01' }), ext({ test_due_on: '2017-01-01', deleted: true })],
        TODAY,
      ),
    ).toBe(InspectionStatus.OK);
    expect(
      plantFireEquipmentStatus([{ ...ext(), equipment_type: FireEquipmentType.HYDRANT }], TODAY),
    ).toBeNull();
  });
});
