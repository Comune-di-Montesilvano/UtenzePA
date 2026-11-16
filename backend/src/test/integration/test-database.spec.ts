import { assertTestDatabase } from './test-database';

describe('assertTestDatabase', () => {
  it('senza nome usa utenzepa_it', () => {
    expect(assertTestDatabase(undefined)).toBe('utenzepa_it');
  });

  it('accetta un nome che finisce con _it', () => {
    expect(assertTestDatabase('ci_it')).toBe('ci_it');
  });

  it('rifiuta il database di lavoro e i nomi vuoti', () => {
    expect(() => assertTestDatabase('mydatabase')).toThrow(/_it/);
    expect(() => assertTestDatabase('')).toThrow(/_it/);
  });
});
