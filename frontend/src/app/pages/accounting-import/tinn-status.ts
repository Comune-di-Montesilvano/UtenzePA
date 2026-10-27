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
