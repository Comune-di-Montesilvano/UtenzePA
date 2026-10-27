import {tinnStatusLabel} from './tinn-status';
import type {TinnStatus} from './accounting-import.service';

const status = (state: TinnStatus['state'], message: string | null = null): TinnStatus => ({
  state, step: null, message, startedAt: null, finishedAt: null, backupSha256: null, backupDate: null, nextRunAt: null,
});

describe('tinnStatusLabel', () => {
  it('etichette per stato', () => {
    expect(tinnStatusLabel(status('ok'))).toBe('Completato');
    expect(tinnStatusLabel(status('unchanged'))).toBe('Backup invariato, nessuna modifica');
    expect(tinnStatusLabel(status('running'))).toBe('In corso…');
    expect(tinnStatusLabel(status('error', 'Server SFTP non raggiungibile o file non trovato')))
      .toBe('Errore: Server SFTP non raggiungibile o file non trovato');
  });
});
