import {
  computeNextDate,
  inspectionStatus,
  positionQuality,
  resolvePlantPosition,
  suggestedInspections,
} from './plant.calc';
import { InspectionStatus, PlantType, PositionQuality } from './enum/plant.enum';

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
