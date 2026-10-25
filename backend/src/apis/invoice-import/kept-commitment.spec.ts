import { keptCommitment } from './kept-commitment';

const line = (utility: number | null, commitment: number | null, auto: boolean) => ({
  utility_id_fk: utility,
  commitment_id_fk: commitment,
  commitment_auto: auto,
});

describe('keptCommitment', () => {
  it('nessuna riga scelta a mano: tutto automatico', () => {
    const kept = keptCommitment([line(1, 50, true), line(2, null, true)]);
    expect([kept(1), kept(2), kept(null)]).toEqual([null, null, null]);
  });

  it('un solo impegno scelto a mano (liquidazione): vale per tutte le righe nuove', () => {
    const kept = keptCommitment([line(1, 77, false), line(2, 77, false)]);
    expect([kept(1), kept(3), kept(null)]).toEqual([77, 77, 77]);
  });

  it('impegni diversi riga per riga: ricollegati per utenza', () => {
    const kept = keptCommitment([line(1, 77, false), line(2, 88, false), line(3, 60, true)]);
    expect([kept(1), kept(2), kept(3), kept(null)]).toEqual([77, 88, null, null]);
  });

  it('stessa utenza su due impegni scelti a mano: ambigua, automatica', () => {
    const kept = keptCommitment([line(1, 77, false), line(1, 88, false), line(2, 88, false)]);
    expect([kept(1), kept(2)]).toEqual([null, 88]);
  });
});
