import {Injectable, inject} from '@angular/core';
import {HttpClient, HttpHeaders} from '@angular/common/http';
import {Observable, catchError, defer, map, of, shareReplay} from 'rxjs';
import {environment} from '../../../environments/environment';
import {AuthService} from '../../services/auth.service';

// Import della contabilità acceso (GET /accounting-import/active, ogni ruolo):
// tenuto in cache un minuto (un altro Admin può cambiare l'interruttore); con
// l'import acceso i dati importati sono in sola lettura. Non estende AbstractService: header a mano.
@Injectable({providedIn: 'root'})
export class AccountingStateService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private readonly URL = environment.apiUrl + '/accounting-import/active';

  active$: Observable<boolean> = this.load();

  // Dopo un cambio dell'interruttore (pagina Contabilità).
  refresh(): void {
    this.active$ = this.load();
  }

  private load(): Observable<boolean> {
    return defer(() =>
      this.http.get<{active: boolean}>(this.URL, {
        headers: new HttpHeaders({Authorization: `Bearer ${this.auth.getToken() || ''}`}),
      }),
    ).pipe(
      map(r => r.active),
      // Errore = non in cache: il prossimo uso riprova (il backend blocca comunque).
      catchError(() => {
        this.active$ = this.load();
        return of(false);
      }),
      shareReplay({bufferSize: 1, refCount: false, windowTime: 60_000}),
    );
  }
}

export const ACCOUNTING_SOURCE = 'ACCOUNTING';
