import {containerWait, tinnStatusLabel} from './tinn-status';
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

describe('containerWait', () => {
  const at = (state: TinnStatus['state'], startedAt: string | null) => ({...status(state), startedAt});

  it('aspetta finché non parte e finisce un giro nuovo', () => {
    expect(containerWait(at('error', 's1'), 's1', 30_000)).toBe('wait');
    expect(containerWait(at('running', 's2'), 's1', 90_000)).toBe('wait');
    expect(containerWait(at('ok', 's2'), 's1', 240_000)).toBe('done');
  });

  it('il container non raccoglie la richiesta entro 3 minuti', () => {
    expect(containerWait(at('error', 's1'), 's1', 181_000)).toBe('timeout');
    expect(containerWait(null, 's1', 1_000)).toBe('timeout');
  });

  it('un giro partito non scade', () => {
    expect(containerWait(at('running', 's2'), 's1', 600_000)).toBe('wait');
  });
});
