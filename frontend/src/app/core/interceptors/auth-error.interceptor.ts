import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../../services/auth.service';

// Sessione scaduta/non valida (token assente, scaduto o revocato): logout e
// redirect al login invece di lasciare la UI in uno stato inconsistente con
// richieste che falliscono silenziosamente una dopo l'altra.
//
// closeAll() e' necessario perche' MatDialog non e' legato al routing —
// router.navigate('/login') da solo lascia un dialog gia' aperto (es.
// dettaglio immobile/utenza) sopra la pagina login: se il token scade
// mentre il form e' aperto, una qualunque chiamata di sfondo (reload della
// lista, autosave) prende il 401 e senza questa riga il form resta visibile
// in overlay, inutilizzabile, finche' l'utente non lo chiude a mano (bug
// segnalato: "sessione scaduta, il form resta aperto").
export const authErrorInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const dialog = inject(MatDialog);

  return next(req).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && error.status === 401) {
        auth.logout();
        dialog.closeAll();
        void router.navigate(['/login']);
      }
      return throwError(() => error);
    }),
  );
};
