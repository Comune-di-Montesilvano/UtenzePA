import { IsNotEmpty } from 'class-validator';

export class LoginDto {
  // Email per utenti locali, username AD (nome.cognome) per utenti LDAP —
  // stesso campo per non introdurre due form/flussi di login distinti.
  @IsNotEmpty({ message: 'Username obbligatorio' })
  email: string;

  @IsNotEmpty({ message: 'Password obbligatoria' })
  password: string;
}
