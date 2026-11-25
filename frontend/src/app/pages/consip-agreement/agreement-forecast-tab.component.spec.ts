import {ComponentFixture, TestBed} from '@angular/core/testing';
import {of} from 'rxjs';
import {EntityNavigatorService} from '../../core/services/entity-navigator.service';
import {ToastService} from '../../core/services/toast.service';
import {AgreementForecastTabComponent} from './agreement-forecast-tab.component';
import type {AgreementForecast, ForecastPrice} from './agreement-forecast.model';
import {ConsipAgreementService} from './consip-agreement.service';

const nextYear = new Date().getFullYear() + 1;

// Fabbisogno con un capitolo: stanziati 100 l'anno prossimo, servono `need`.
const forecastOf = (toInvoice: number, need = 120): AgreementForecast => ({
  horizon: {start: '2026-01-01', end: '2026-12-31'},
  billed_until: '2026-10-31',
  annual: [
    {chapter_id: 7, year: nextYear - 1, utilities: 1, billed: 80, expected: 20, coverage: 1},
    {chapter_id: 7, year: nextYear, utilities: 1, billed: 0, expected: need, coverage: 1},
    {chapter_id: 8, year: nextYear, utilities: 1, billed: 0, expected: 50, coverage: 1},
  ],
  budgets: [{chapter_id: 7, year: nextYear, budget: 100}, {chapter_id: 8, year: nextYear, budget: 80}],
  chapter_other_utilities: [],
  chapter_needs: [],
  agreements: [],
  prices: [{hard_type: 'LIGHT', proposed: 0.3, manual: null, used: 0.3, trend: 1} as ForecastPrice],
  rows: [{
    chapter_id: 7, year: new Date().getFullYear(), utilities: 1, invoiced: 10, to_invoice: toInvoice, total: 10 + toInvoice,
    committed: 100, remaining: 90, difference: 90 - toInvoice, coverage: 1, shortfall: null, alert: null,
  }],
  utilities: [{
    id: 1, utility_code: 'IT001', hard_type: 'LIGHT', chapter_id: 7, source: 'history', from_draft: false,
    lines_without_period: false,
    years: [{year: new Date().getFullYear(), invoiced: 10, to_invoice: toInvoice, expected_consumption: 5}],
    annual: [{year: nextYear, billed: 0, expected: need}],
  }],
  warnings: {orders_without_dates: [], utilities_without_data: [], utilities_other_type: [], commitments_without_amount: []},
  computed_at: '2026-11-12T10:00:00.000Z', chapters: [{id: 7, label: '1234/0'}, {id: 8, label: '5678/0'}], shared_commitments: [], shares_without_lines: [],
});

describe('AgreementForecastTabComponent', () => {
  let fixture: ComponentFixture<AgreementForecastTabComponent>;
  let tab: AgreementForecastTabComponent;
  let service: {forecast: ReturnType<typeof vi.fn>; setForecastPrice: ReturnType<typeof vi.fn>};
  let toast: {add: ReturnType<typeof vi.fn>};
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;

  beforeEach(async () => {
    service = {forecast: vi.fn(() => of(forecastOf(20))), setForecastPrice: vi.fn(() => of(forecastOf(20)))};
    toast = {add: vi.fn()};
    await TestBed.configureTestingModule({
      imports: [AgreementForecastTabComponent],
      providers: [
        {provide: ConsipAgreementService, useValue: service},
        {provide: EntityNavigatorService, useValue: {openUtility: vi.fn(() => of(false))}},
        {provide: ToastService, useValue: toast},
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(AgreementForecastTabComponent);
    tab = fixture.componentInstance;
    tab.agreementId = 3;
  });

  const show = (f: AgreementForecast | null): void => {
    tab.forecast = f;
    tab.ngOnChanges();
    fixture.detectChanges();
  };

  it('primo caricamento fallito: «Ricalcola» resta disponibile', () => {
    show(null);
    const button = [...el().querySelectorAll('button')].find(b => b.textContent?.includes('Ricalcola'));
    expect(button).toBeTruthy();
    button?.click();
    expect(service.forecast).toHaveBeenCalledWith(3);
  });

  it('ricalcolo: il dettaglio aperto resta aperto, con i dati nuovi', () => {
    show(forecastOf(10, 120));
    const row = tab.plan!.rows[0];
    tab.toggle(row);
    service.forecast.mockReturnValue(of(forecastOf(10, 150)));
    tab.recompute();
    const fresh = tab.plan!.rows.find(r => r.chapter_id === 7)!;
    expect(tab.isOpen(fresh)).toBe(true);
    expect(tab.detail(fresh)[0].need).toBe(150);
  });

  it('la scheda ripassa lo stesso fabbisogno: nessuna seconda ricostruzione', () => {
    show(forecastOf(10));
    tab.recompute();
    const plan = tab.plan;
    tab.ngOnChanges();
    expect(tab.plan).toBe(plan);
  });

  it('costo a mano non valido: avviso, nessun salvataggio, il campo torna al valore salvato', () => {
    show(forecastOf(10));
    const input = document.createElement('input');
    input.value = '-1';
    tab.setPrice(tab.forecast!.prices[0], input);
    expect(service.setForecastPrice).not.toHaveBeenCalled();
    expect(toast.add).toHaveBeenCalled();
    expect(input.value).toBe('');
  });

  it('richiesta per l’anno prossimo: servono, stanziati, da aggiungere e fabbisogno extra dopo gli spostamenti', () => {
    // Capitolo 7: servono 160 su 100 (+60); capitolo 8: servono 50 su 80 (avanzano 30) → extra 30.
    show(forecastOf(10, 160));
    const text = el().textContent ?? '';
    expect(text).toMatch(new RegExp(`Per il ${nextYear} servono 210,00\\s€, stanziati 180,00\\s€`));
    expect(text).toMatch(/Da aggiungere 60,00\s€ su 1 capitolo/);
    expect(text).toMatch(/fabbisogno extra 30,00\s€/);
    expect(text).toContain('Fatture arrivate fino al 31/10/2026');
  });

  it('simulazione: togliendo la spunta al capitolo che avanza, tutto diventa extra', () => {
    show(forecastOf(10, 160));
    expect(tab.moves.extra).toBe(30);
    tab.setDonor(8, false);
    expect(tab.moves.extra).toBe(60);
    expect(tab.moves.moves).toEqual([]);
  });

  it('ordini finiti, nessuna spesa annua: messaggio, niente tabella né costo unitario', () => {
    show({...forecastOf(0), annual: [], horizon: {start: '2024-01-01', end: '2025-12-31'}});
    const text = el().textContent ?? '';
    expect(text).toContain('Gli ordini della convenzione sono chiusi o scaduti');
    expect(el().querySelector('table')).toBeNull();
    expect(text).not.toContain('Costo unitario');
  });

  it('ordini in corso ma nulla da prevedere: fatture senza righe per utenza (canoni), non «ordini scaduti»', () => {
    show({...forecastOf(0), annual: [], horizon: {start: '2024-01-01', end: '2099-12-31'}});
    const text = el().textContent ?? '';
    expect(text).toContain('righe per utenza');
    expect(text).not.toContain('chiusi o scaduti');
  });

  it('riga del capitolo: si apre anche con la barra spaziatrice', () => {
    show(forecastOf(10));
    const row = el().querySelector('tbody tr.row-clickable') as HTMLElement;
    row.dispatchEvent(new KeyboardEvent('keydown', {key: ' '}));
    fixture.detectChanges();
    expect(row.getAttribute('aria-expanded')).toBe('true');
  });
});
