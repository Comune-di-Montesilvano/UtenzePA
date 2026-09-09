import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { authErrorInterceptor } from './auth-error.interceptor';
import { AuthService } from '../../services/auth.service';

describe('authErrorInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let authSpy: jasmine.SpyObj<AuthService>;
  let routerSpy: jasmine.SpyObj<Router>;
  let dialogSpy: jasmine.SpyObj<MatDialog>;

  beforeEach(() => {
    authSpy = jasmine.createSpyObj('AuthService', ['logout']);
    routerSpy = jasmine.createSpyObj('Router', ['navigate']);
    dialogSpy = jasmine.createSpyObj('MatDialog', ['closeAll']);

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authErrorInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: authSpy },
        { provide: Router, useValue: routerSpy },
        { provide: MatDialog, useValue: dialogSpy },
      ],
    });

    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  // Bug segnalato: sessione scaduta con un dialog aperto (es. dettaglio
  // immobile) — il form restava visibile sopra la pagina login perche'
  // MatDialog non e' legato al routing, router.navigate('/login') da solo
  // non lo tocca.
  it('chiude tutti i dialog aperti oltre a fare logout e redirect su 401', () => {
    http.get('/api/whatever').subscribe({ error: () => {} });

    httpMock.expectOne('/api/whatever').flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });

    expect(authSpy.logout).toHaveBeenCalled();
    expect(dialogSpy.closeAll).toHaveBeenCalled();
    expect(routerSpy.navigate).toHaveBeenCalledWith(['/login']);
  });

  it('non tocca dialog/sessione su un errore diverso da 401', () => {
    http.get('/api/whatever').subscribe({ error: () => {} });

    httpMock.expectOne('/api/whatever').flush('Server error', { status: 500, statusText: 'Internal Server Error' });

    expect(authSpy.logout).not.toHaveBeenCalled();
    expect(dialogSpy.closeAll).not.toHaveBeenCalled();
    expect(routerSpy.navigate).not.toHaveBeenCalled();
  });
});
