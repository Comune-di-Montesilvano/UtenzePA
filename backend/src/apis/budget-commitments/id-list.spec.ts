import { idList } from './id-list';

describe('idList', () => {
  it('JSON_ARRAYAGG già decodificato, stringa JSON o elenco con virgole: id ordinati', () => {
    expect(idList([3, 1, 2])).toEqual([1, 2, 3]);
    expect(idList('[7, 5]')).toEqual([5, 7]);
    expect(idList('4,2')).toEqual([2, 4]);
  });

  it('nessun collegamento (NULL o vuoto): elenco vuoto', () => {
    expect(idList(null)).toEqual([]);
    expect(idList(undefined)).toEqual([]);
    expect(idList('')).toEqual([]);
  });
});
