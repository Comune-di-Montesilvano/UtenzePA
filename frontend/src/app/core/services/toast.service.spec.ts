import type { Mock } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ToastService } from './toast.service';

describe('ToastService', () => {
  let service: ToastService;
  let snackBarSpy: { open: Mock };

  beforeEach(() => {
    snackBarSpy = {
      open: vi.fn().mockName('MatSnackBar.open'),
    };
    TestBed.configureTestingModule({
      providers: [ToastService, { provide: MatSnackBar, useValue: snackBarSpy }],
    });
    service = TestBed.inject(ToastService);
  });

  it('shows summary and detail joined, with success panel class', () => {
    service.add({ severity: 'success', summary: 'Elemento creato', detail: 'Prova' });

    expect(snackBarSpy.open).toHaveBeenCalledWith(
      'Elemento creato: Prova',
      'Chiudi',
      expect.objectContaining({ panelClass: ['toast-success'] }),
    );
  });

  it('shows only summary when detail is missing', () => {
    service.add({ severity: 'error', summary: 'Errore generico' });

    expect(snackBarSpy.open).toHaveBeenCalledWith(
      'Errore generico',
      'Chiudi',
      expect.objectContaining({ panelClass: ['toast-error'] }),
    );
  });
});
