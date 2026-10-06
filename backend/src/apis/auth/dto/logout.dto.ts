import { IsIn } from 'class-validator';

// LOGOUT = uscita dal menu; TIMEOUT = sessione chiusa per inattività dal frontend.
export class LogoutDto {
  @IsIn(['LOGOUT', 'TIMEOUT'])
  reason: 'LOGOUT' | 'TIMEOUT';
}
