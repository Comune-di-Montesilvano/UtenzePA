import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, of, throwError } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { AccountingStateService } from './accounting-state.service';

describe('AccountingStateService', () => {
  it('un errore non resta in cache: la lettura successiva riprova', async () => {
    const get = vi
      .fn()
      .mockReturnValueOnce(throwError(() => new Error('rete')))
      .mockReturnValueOnce(of({ active: true }));
    TestBed.configureTestingModule({
      providers: [
        AccountingStateService,
        { provide: HttpClient, useValue: { get } },
        { provide: AuthService, useValue: { getToken: () => 't' } },
      ],
    });
    const service = TestBed.inject(AccountingStateService);
    expect(await firstValueFrom(service.active$)).toBe(false);
    expect(await firstValueFrom(service.active$)).toBe(true);
  });
});
