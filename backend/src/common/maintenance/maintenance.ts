import type { NextFunction, Request, Response } from 'express';

// Stato "app in manutenzione" durante un ripristino da backup: il database
// e i file vengono sostituiti, nessuno deve leggere o scrivere nel mentre.
// In memoria (una sola istanza dell'API): se il processo riparte a metà
// ripristino lo stato si azzera, come il ripristino stesso.
class MaintenanceState {
  private since: Date | null = null;

  get active(): boolean {
    return this.since !== null;
  }

  start(): void {
    this.since = new Date();
  }

  end(): void {
    this.since = null;
  }
}

export const maintenance = new MaintenanceState();

export const MAINTENANCE_CODE = 'MAINTENANCE';

// Sempre raggiungibile: la pagina di cortesia interroga /health per sapere
// quando il ripristino è finito.
const ALWAYS_ALLOWED = /^\/api\/v1\/health(\/|$)/;

/**
 * Durante la manutenzione rifiuta ogni richiesta API con 400 e codice
 * MAINTENANCE (il frontend mostra la pagina di cortesia). 400 e non 503:
 * il proxy di produzione sostituisce le risposte 5xx/409 con le sue pagine.
 * Va registrato dopo il CORS, altrimenti il browser non legge la risposta.
 */
export function maintenanceMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!maintenance.active || req.method === 'OPTIONS' || ALWAYS_ALLOWED.test(req.path)) {
    next();
    return;
  }
  res.status(400).json({
    statusCode: 400,
    code: MAINTENANCE_CODE,
    message: 'Ripristino dei dati in corso: l’applicazione tornerà disponibile a breve.',
  });
}
