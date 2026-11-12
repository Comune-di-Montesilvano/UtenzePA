import {TestBed} from '@angular/core/testing';
import {MatDialog} from '@angular/material/dialog';
import {of, throwError} from 'rxjs';
import {ToastService} from '../../../core/services/toast.service';
import type {UtilityConsumption} from './consumption.model';
import {UtilityConsumptionService} from './utility-consumption.service';
import {UtilityConsumptionsTabComponent} from './utility-consumptions-tab.component';

describe('UtilityConsumptionsTabComponent', () => {
  let service: {list: ReturnType<typeof vi.fn>; summary: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn>};
  let toast: {add: ReturnType<typeof vi.fn>};
  const row = {id: 5} as UtilityConsumption;

  const create = (): UtilityConsumptionsTabComponent => {
    const tab = TestBed.createComponent(UtilityConsumptionsTabComponent).componentInstance;
    tab.utilityId = 7;
    return tab;
  };

  beforeEach(async () => {
    service = {list: vi.fn(() => of([])), summary: vi.fn(() => of({monthly: []})), delete: vi.fn()};
    toast = {add: vi.fn()};
    await TestBed.configureTestingModule({
      imports: [UtilityConsumptionsTabComponent],
      providers: [
        {provide: UtilityConsumptionService, useValue: service},
        {provide: ToastService, useValue: toast},
        {provide: MatDialog, useValue: {open: () => ({afterClosed: () => of(true)})}},
      ],
    }).compileComponents();
  });

  it('eliminazione riuscita: elenco ricaricato', () => {
    service.delete.mockReturnValue(of(undefined));
    create().remove(row);
    expect(service.delete).toHaveBeenCalledWith(5);
    expect(service.list).toHaveBeenCalledWith(7);
  });

  it('eliminazione con errore: avviso e elenco ricaricato (la rilevazione può essere già eliminata)', () => {
    service.delete.mockReturnValue(throwError(() => ({error: {message: 'Errore interno'}})));
    create().remove(row);
    expect(toast.add).toHaveBeenCalledWith(expect.objectContaining({severity: 'error', summary: 'Rilevazione non eliminata'}));
    expect(service.list).toHaveBeenCalledWith(7);
  });
});
