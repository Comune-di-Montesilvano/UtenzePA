import { getMetadataArgsStorage } from 'typeorm';
import { SystemUser } from '../system-users/entity/system-user.entity';
import { clearOtp, findUserWithOtp, otpMatches } from './otp-store';

// OTP mai restituiti dalle query normali (es. created_by/updated_by nelle
// risposte di immobili e contratti, visibili anche ai Lettori): solo il
// reset password li legge, in modo esplicito.
describe('OTP non esposti', () => {
  const column = (name: string) =>
    getMetadataArgsStorage().columns.find(
      (c) => c.target === SystemUser && c.propertyName === name,
    );

  it('otp e otp_expiry esclusi dalle select di default', () => {
    expect(column('otp')?.options.select).toBe(false);
    expect(column('otp_expiry')?.options.select).toBe(false);
  });

  it('findUserWithOtp legge esplicitamente otp e scadenza', async () => {
    const repo = { findOne: jest.fn().mockResolvedValue({ id: 3 }) };
    await findUserWithOtp(repo as never, 'a@example.invalid');
    expect(repo.findOne).toHaveBeenCalledWith({
      where: { email: 'a@example.invalid' },
      select: { id: true, email: true, otp: true, otp_expiry: true },
    });
  });

  it('otpMatches: codice giusto e non scaduto', () => {
    const future = new Date(Date.now() + 60_000);
    const past = new Date(Date.now() - 1);
    expect(otpMatches({ otp: '123456', otp_expiry: future }, '123456')).toBe(true);
    expect(otpMatches({ otp: '123456', otp_expiry: future }, '654321')).toBe(false);
    expect(otpMatches({ otp: '123456', otp_expiry: past }, '123456')).toBe(false);
    expect(otpMatches({ otp: undefined, otp_expiry: future }, '')).toBe(false);
    expect(otpMatches(null, '123456')).toBe(false);
  });

  it('clearOtp: aggiorna solo password e azzera il codice', async () => {
    const repo = { update: jest.fn().mockResolvedValue(undefined) };
    await clearOtp(repo as never, 3, 'hash');
    expect(repo.update).toHaveBeenCalledWith(3, {
      passwordHash: 'hash',
      otp: null,
      otp_expiry: null,
    });
  });
});
