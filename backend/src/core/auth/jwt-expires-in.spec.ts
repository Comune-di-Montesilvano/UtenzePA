import { DEFAULT_JWT_EXPIRES_IN, jwtExpiresInSeconds } from './jwt-expires-in';

describe('jwtExpiresInSeconds', () => {
  it('legge secondi e unità', () => {
    expect(jwtExpiresInSeconds('900')).toBe(900);
    expect(jwtExpiresInSeconds('45m')).toBe(2700);
    expect(jwtExpiresInSeconds('1h')).toBe(3600);
    expect(jwtExpiresInSeconds('2D')).toBe(172800);
  });

  it('assente, zero o non valido = 1 ora, mai senza scadenza', () => {
    expect(jwtExpiresInSeconds(undefined)).toBe(DEFAULT_JWT_EXPIRES_IN);
    expect(jwtExpiresInSeconds('')).toBe(DEFAULT_JWT_EXPIRES_IN);
    expect(jwtExpiresInSeconds('0')).toBe(DEFAULT_JWT_EXPIRES_IN);
    expect(jwtExpiresInSeconds('un giorno')).toBe(DEFAULT_JWT_EXPIRES_IN);
  });
});
