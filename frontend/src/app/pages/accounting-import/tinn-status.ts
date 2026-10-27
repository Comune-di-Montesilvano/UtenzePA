import type {TinnStatus} from './accounting-import.service';

// Esito dell'ultimo giro del container Tinn, come lo mostra la pagina Contabilità.
export function tinnStatusLabel(s: TinnStatus): string {
  switch (s.state) {
    case 'ok':
      return 'Completato';
    case 'unchanged':
      return 'Backup invariato, nessuna modifica';
    case 'running':
      return 'In corso…';
    case 'error':
      return `Errore: ${s.message ?? 'motivo non indicato'}`;
  }
}

// Il container legge «Esegui ora» entro un minuto: se in 3 minuti non è partito
// nessun giro nuovo, non risponde (fermo, configurazione incompleta, profilo tolto).
export const CONTAINER_PICKUP_MS = 3 * 60 * 1000;

export function containerWait(
  c: TinnStatus | null, previousStart: string | null, elapsedMs: number,
): 'wait' | 'done' | 'timeout' {
  if (!c) return 'timeout';
  const started = c.startedAt !== previousStart;
  if (started && c.state !== 'running') return 'done';
  if (!started && elapsedMs > CONTAINER_PICKUP_MS) return 'timeout';
  return 'wait';
}
