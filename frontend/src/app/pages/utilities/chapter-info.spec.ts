import {ChapterInfo, chapterOriginText, paidElsewhereText} from './chapter-info';

const base: ChapterInfo = {
  source: 'DERIVED',
  reason: null,
  destination: {id: 1, name: 'Scuola materna'},
  via: {kind: 'asset', id: 4, label: 'Scuola Rossi'},
  chapter_label: '1210/0',
  paid_elsewhere: [],
};

describe('chapterOriginText', () => {
  it('ricavato: destinazione e immobile', () => {
    expect(chapterOriginText(base)).toBe('Dalla destinazione «Scuola materna» (immobile Scuola Rossi)');
  });

  it('ricavato da impianto', () => {
    expect(chapterOriginText({...base, via: {kind: 'plant', id: 2, label: 'Centrale'}}))
      .toBe('Dalla destinazione «Scuola materna» (impianto Centrale)');
  });

  it('a mano con il motivo', () => {
    expect(chapterOriginText({...base, source: 'MANUAL', reason: 'no_chapter', via: null}))
      .toBe('A mano: nessun capitolo per destinazione e natura (Scuola materna)');
    expect(chapterOriginText({...base, source: 'MANUAL', reason: 'no_destination', destination: null, via: null}))
      .toBe('A mano: nessun immobile o impianto con destinazione');
  });
});

describe('paidElsewhereText', () => {
  it('capitolo, mesi e importo', () => {
    expect(paidElsewhereText({chapter_label: '12331/2', amount: 1234.56, months: ['2026-01', '2026-02', '2026-03']}))
      .toBe(`Pagata anche su 12331/2: gen–mar 2026 (${(1234.56).toLocaleString('it-IT', {style: 'currency', currency: 'EUR'})})`);
  });
});
