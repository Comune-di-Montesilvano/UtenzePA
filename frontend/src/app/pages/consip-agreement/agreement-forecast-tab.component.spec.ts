import {ComponentFixture, TestBed} from '@angular/core/testing';
import {of} from 'rxjs';
import {EntityNavigatorService} from '../../core/services/entity-navigator.service';
import {ToastService} from '../../core/services/toast.service';
import {AgreementForecastTabComponent} from './agreement-forecast-tab.component';
import type {AgreementForecast, ForecastPrice} from './agreement-forecast.model';
import {ConsipAgreementService} from './consip-agreement.service';

const forecastOf = (toInvoice: number): AgreementForecast => ({
  horizon: {start: '2026-01-01', end: '2026-12-31'},
  prices: [{hard_type: 'LIGHT', proposed: 0.3, manual: null, used: 0.3, trend: 1} as ForecastPrice],
  rows: [{
    chapter_id: 7, year: new Date().getFullYear(), utilities: 1, invoiced: 10, to_invoice: toInvoice, total: 10 + toInvoice,
    committed: 100, remaining: 90, difference: 90 - toInvoice, coverage: 1, shortfall: null, alert: null,
  }],
  utilities: [{
    id: 1, utility_code: 'IT001', hard_type: 'LIGHT', chapter_id: 7, source: 'history', from_draft: false,
    lines_without_period: false,
    years: [{year: new Date().getFullYear(), invoiced: 10, to_invoice: toInvoice, expected_consumption: 5}],
  }],
  warnings: {orders_without_dates: [], utilities_without_data: [], utilities_other_type: [], commitments_without_amount: []},
  computed_at: '2026-11-12T10:00:00.000Z', chapters: [{id: 7, label: '1234/0'}], shared_commitments: [], shares_without_lines: [],
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
    show(forecastOf(10));
    const row = tab.groups[0].rows[0];
    tab.toggle(row);
    tab.recompute();
    const fresh = tab.groups[0].rows[0];
    expect(tab.isOpen(fresh)).toBe(true);
    expect(tab.detail(fresh)[0].to_invoice).toBe(20);
  });

  it('la scheda ripassa lo stesso fabbisogno: nessuna seconda ricostruzione', () => {
    show(forecastOf(10));
    tab.recompute();
    const groups = tab.groups;
    tab.ngOnChanges();
    expect(tab.groups).toBe(groups);
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

  it('esito dell’anno: quanto impegnare in testa, capitoli da integrare nel riquadro', () => {
    show(forecastOf(120));
    const text = el().textContent ?? '';
    expect(text).toMatch(/Da impegnare\s+30,00\s€/);
    expect(text).toContain('1 capitolo da integrare');
  });

  it('ordini finiti e nulla da pagare: messaggio con il disponibile avanzato, niente tabella né costo unitario', () => {
    show({...forecastOf(0), horizon: {start: '2024-01-01', end: '2025-12-31'}});
    const text = el().textContent ?? '';
    expect(text).toContain('Gli ordini della convenzione sono chiusi o scaduti');
    expect(text).toContain('Sugli impegni restano 90,00');
    expect(el().querySelector('table')).toBeNull();
    expect(text).not.toContain('Costo unitario');
  });

  it('ordini in corso ma nulla da prevedere: fatture senza righe per utenza (canoni), non «ordini scaduti»', () => {
    show({...forecastOf(0), horizon: {start: '2024-01-01', end: '2099-12-31'}});
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
