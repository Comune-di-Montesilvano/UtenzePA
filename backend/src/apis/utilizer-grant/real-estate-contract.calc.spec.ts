import {
  annualRent,
  contractAlerts,
  displayStatus,
  effectiveEndDate,
  noticeDeadline,
} from './real-estate-contract.calc';
import { ContractStatus, DisplayStatus, RentPeriod } from './enum/real-estate-contract.enum';

const TODAY = '2026-10-02';
const base = {
  end_date: null as string | null,
  tacit_renewal: false,
  renewal_months: null as number | null,
  notice_months: null as number | null,
  status: ContractStatus.ACTIVE,
};

describe('annualRent', () => {
  it.each([
    [RentPeriod.MONTHLY, 100, 1200],
    [RentPeriod.BIMONTHLY, 100, 600],
    [RentPeriod.QUARTERLY, 100, 400],
    [RentPeriod.SEMIANNUAL, 100, 200],
    [RentPeriod.ANNUAL, 100, 100],
    [RentPeriod.ONE_OFF, 100, 0],
  ])('%s', (period, amount, expected) => {
    expect(annualRent(amount, period)).toBe(expected);
  });

  it('accetta il decimale MySQL come stringa', () => {
    expect(annualRent('354.97' as unknown as number, RentPeriod.MONTHLY)).toBeCloseTo(4259.64, 2);
  });

  it('null se manca importo o periodo', () => {
    expect(annualRent(null, RentPeriod.MONTHLY)).toBeNull();
    expect(annualRent(100, null)).toBeNull();
  });
});

describe('effectiveEndDate', () => {
  it('senza rinnovo tacito è la scadenza originaria anche se passata', () => {
    expect(effectiveEndDate({ ...base, end_date: '2023-06-17' }, TODAY)).toBe('2023-06-17');
  });

  it('con rinnovo tacito si sposta di cicli interi fino a una data >= oggi', () => {
    const c = {
      ...base,
      end_date: '2015-12-31',
      tacit_renewal: true,
      renewal_months: 72,
      notice_months: 6,
    };
    expect(effectiveEndDate(c, TODAY)).toBe('2027-12-31');
  });

  it('scadenza oggi resta oggi', () => {
    const c = {
      ...base,
      end_date: TODAY,
      tacit_renewal: true,
      renewal_months: 12,
      notice_months: 1,
    };
    expect(effectiveEndDate(c, TODAY)).toBe(TODAY);
  });

  it('scadenza molto vecchia non va in ciclo infinito', () => {
    const c = {
      ...base,
      end_date: '1992-07-24',
      tacit_renewal: true,
      renewal_months: 1,
      notice_months: 0,
    };
    expect(effectiveEndDate(c, TODAY)).toBe('2026-10-24');
  });

  it('rinnovo tacito senza durata valida: torna alla scadenza originaria', () => {
    const c = {
      ...base,
      end_date: '2020-01-01',
      tacit_renewal: true,
      renewal_months: 0,
      notice_months: 3,
    };
    expect(effectiveEndDate(c, TODAY)).toBe('2020-01-01');
  });

  it('fine mese: 31 gennaio + 1 mese = 28/29 febbraio', () => {
    const c = {
      ...base,
      end_date: '2026-01-31',
      tacit_renewal: true,
      renewal_months: 1,
      notice_months: 0,
    };
    expect(effectiveEndDate(c, '2026-02-15')).toBe('2026-02-28');
  });

  it('null senza scadenza', () => {
    expect(effectiveEndDate(base, TODAY)).toBeNull();
  });
});

describe('noticeDeadline', () => {
  it('scadenza effettiva meno preavviso, solo con rinnovo tacito', () => {
    const c = {
      ...base,
      end_date: '2027-06-30',
      tacit_renewal: true,
      renewal_months: 48,
      notice_months: 6,
    };
    expect(noticeDeadline(c, TODAY)).toBe('2026-12-30');
    expect(noticeDeadline({ ...c, tacit_renewal: false }, TODAY)).toBeNull();
  });
});

describe('displayStatus', () => {
  it('lo stato dichiarato non attivo vince sulle date', () => {
    expect(
      displayStatus({ ...base, end_date: '2030-01-01', status: ContractStatus.DISPUTED }, TODAY),
    ).toBe(DisplayStatus.DISPUTED);
  });

  it('scaduto, in scadenza entro 4 mesi, attivo', () => {
    expect(displayStatus({ ...base, end_date: '2026-10-01' }, TODAY)).toBe(DisplayStatus.EXPIRED);
    expect(displayStatus({ ...base, end_date: '2027-02-01' }, TODAY)).toBe(DisplayStatus.EXPIRING);
    expect(displayStatus({ ...base, end_date: '2027-03-01' }, TODAY)).toBe(DisplayStatus.ACTIVE);
    expect(displayStatus(base, TODAY)).toBe(DisplayStatus.ACTIVE);
  });
});

describe('contractAlerts', () => {
  it('disdetta entro 60 giorni', () => {
    const c = {
      ...base,
      end_date: '2027-06-30',
      tacit_renewal: true,
      renewal_months: 48,
      notice_months: 7,
    };
    expect(contractAlerts(c, TODAY)).toEqual({
      notice: true,
      expiring: false,
      expiredActive: false,
    });
  });

  it('in scadenza (senza rinnovo tacito) e scaduto ancora attivo', () => {
    expect(contractAlerts({ ...base, end_date: '2026-12-01' }, TODAY).expiring).toBe(true);
    expect(contractAlerts({ ...base, end_date: '2025-01-01' }, TODAY).expiredActive).toBe(true);
    expect(
      contractAlerts({ ...base, end_date: '2025-01-01', status: ContractStatus.RETURNED }, TODAY),
    ).toEqual({
      notice: false,
      expiring: false,
      expiredActive: false,
    });
  });
});
