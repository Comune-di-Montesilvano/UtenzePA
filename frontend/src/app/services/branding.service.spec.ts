import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { BrandingService, Branding } from './branding.service';
import { environment } from '../../environments/environment';

const SAMPLE: Branding = {
  entity_name: 'Comune di Montesilvano',
  entity_type: 'Comune',
  default_latitude: '42.5083',
  default_longitude: '14.15',
  logo: null,
  logo_mime: null,
  favicon: null,
  favicon_mime: null,
};

describe('BrandingService', () => {
  let service: BrandingService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), BrandingService],
    });
    service = TestBed.inject(BrandingService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('load() chiama GET /settings/branding e popola current()', () => {
    service.load().subscribe();

    const req = httpMock.expectOne(`${environment.apiUrl}/settings/branding`);
    expect(req.request.method).toBe('GET');
    req.flush(SAMPLE);

    expect(service.current()).toEqual(SAMPLE);
  });

  it('current() lancia se load() non è mai stato completato', () => {
    expect(() => service.current()).toThrowError();
  });
});
