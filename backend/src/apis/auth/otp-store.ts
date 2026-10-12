import { Repository } from 'typeorm';
import { SystemUser } from '../system-users/entity/system-user.entity';

// otp e otp_expiry hanno select: false nell'entità: nessuna risposta dell'API
// li contiene. Il reset password li legge solo da qui.
export function findUserWithOtp(
  repo: Repository<SystemUser>,
  email: string,
): Promise<Pick<SystemUser, 'id' | 'email' | 'otp' | 'otp_expiry'> | null> {
  return repo.findOne({
    where: { email },
    select: { id: true, email: true, otp: true, otp_expiry: true },
  });
}

export function otpMatches(
  user: Pick<SystemUser, 'otp' | 'otp_expiry'> | null | undefined,
  otp: string,
): boolean {
  if (!user?.otp || !user.otp_expiry) return false;
  return user.otp === otp && new Date() <= new Date(user.otp_expiry);
}

// Nuova password e codice consumato, senza riscrivere l'intera riga.
export async function clearOtp(
  repo: Repository<SystemUser>,
  userId: number,
  passwordHash: string,
): Promise<void> {
  await repo.update(userId, { passwordHash, otp: null, otp_expiry: null });
}
