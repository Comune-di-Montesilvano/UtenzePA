import { randomInt } from 'crypto';

export interface GeneratedOtp {
  code: string;
  expiry: Date;
}

export function generateOtp(expiryMinutes = 60): GeneratedOtp {
  const code = randomInt(100000, 1000000).toString();
  const expiry = new Date();
  expiry.setMinutes(expiry.getMinutes() + expiryMinutes);
  return { code, expiry };
}
