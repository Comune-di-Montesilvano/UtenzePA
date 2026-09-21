import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { SystemUser } from '../system-users/entity/system-user.entity';
import { EMailerService } from '@/core/email/email.service';
import { AuthProvider, UserRole, UserStatus } from '../shared/enum/user.enums';
import { SettingsService } from '@apis/settings/settings.service';
import { LdapService } from './ldap/ldap.service';

describe('AuthService', () => {
  let service: AuthService;
  let userRepository: { findOne: jest.Mock; save: jest.Mock; create: jest.Mock };
  let jwtService: { sign: jest.Mock };
  let mailer: { sendMail: jest.Mock };
  let ldapService: { authenticate: jest.Mock; isConfigured: jest.Mock };

  const baseUser: SystemUser = {
    id: 1,
    firstName: 'Mario',
    lastName: 'Rossi',
    email: 'mario.rossi@comune.it',
    passwordHash: 'hashed-password',
    authProvider: AuthProvider.LOCAL,
    role: UserRole.OPERATORE,
    status: UserStatus.ATTIVO,
    otp: undefined,
    otp_expiry: undefined,
    create_date: new Date(),
    update_date: new Date(),
    created_by_user_id: 1,
    updated_by_user_id: 1,
    deleted: false,
    created_by: undefined,
    updated_by: undefined,
  } as SystemUser;

  beforeEach(async () => {
    userRepository = { findOne: jest.fn(), save: jest.fn(), create: jest.fn((v) => v) };
    jwtService = { sign: jest.fn().mockReturnValue('signed-jwt') };
    mailer = { sendMail: jest.fn().mockResolvedValue(true) };
    ldapService = { authenticate: jest.fn(), isConfigured: jest.fn().mockReturnValue(false) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(SystemUser), useValue: userRepository },
        { provide: JwtService, useValue: jwtService },
        { provide: EMailerService, useValue: mailer },
        {
          provide: SettingsService,
          useValue: { getBrandingSummary: jest.fn().mockResolvedValue({ entity_name: 'Comune di Montesilvano' }) },
        },
        { provide: LdapService, useValue: ldapService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('validateUser', () => {
    it('restituisce l\'utente se la password combacia', async () => {
      userRepository.findOne.mockResolvedValue(baseUser);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);

      const result = await service.validateUser(baseUser.email, 'plain-password');

      expect(result).toBe(baseUser);
    });

    it('restituisce null se la password non combacia', async () => {
      userRepository.findOne.mockResolvedValue(baseUser);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(false as never);

      const result = await service.validateUser(baseUser.email, 'wrong-password');

      expect(result).toBeNull();
    });

    it('restituisce null se l\'utente non esiste e LDAP non è configurato', async () => {
      userRepository.findOne.mockResolvedValue(null);
      ldapService.isConfigured.mockReturnValue(false);

      const result = await service.validateUser('sconosciuto@comune.it', 'qualsiasi');

      expect(result).toBeNull();
      expect(ldapService.authenticate).not.toHaveBeenCalled();
    });

    it('utente esistente con authProvider ldap: verifica via LDAP, non bcrypt', async () => {
      const ldapUser = { ...baseUser, authProvider: AuthProvider.LDAP, passwordHash: null };
      userRepository.findOne.mockResolvedValue(ldapUser);
      ldapService.authenticate.mockResolvedValue({ username: ldapUser.email, displayName: 'Mario Rossi' });
      userRepository.save.mockImplementation(async (u) => u);
      const bcryptSpy = jest.spyOn(bcrypt, 'compare');

      const result = await service.validateUser(ldapUser.email, 'password-ad');

      expect(ldapService.authenticate).toHaveBeenCalledWith(ldapUser.email, 'password-ad');
      expect(bcryptSpy).not.toHaveBeenCalled();
      expect(result?.firstName).toBe('Mario');
      expect(result?.lastName).toBe('Rossi');
    });

    it('utente esistente con authProvider ldap: credenziali AD rifiutate → null', async () => {
      const ldapUser = { ...baseUser, authProvider: AuthProvider.LDAP, passwordHash: null };
      userRepository.findOne.mockResolvedValue(ldapUser);
      ldapService.authenticate.mockRejectedValue(new Error('unauthorized'));

      const result = await service.validateUser(ldapUser.email, 'wrong');

      expect(result).toBeNull();
      expect(userRepository.save).not.toHaveBeenCalled();
    });

    it('utente non esistente + LDAP configurato + credenziali valide: auto-provisiona come Lettore', async () => {
      userRepository.findOne.mockResolvedValue(null);
      ldapService.isConfigured.mockReturnValue(true);
      ldapService.authenticate.mockResolvedValue({
        username: 'nuovo.utente@comune.it',
        displayName: 'Nuovo Utente',
      });
      userRepository.save.mockImplementation(async (u) => ({ id: 99, ...u }));

      const result = await service.validateUser('nuovo.utente@comune.it', 'password-ad');

      expect(userRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'nuovo.utente@comune.it',
          firstName: 'Nuovo',
          lastName: 'Utente',
          role: UserRole.LETTORE,
          authProvider: AuthProvider.LDAP,
          passwordHash: null,
        }),
      );
      expect(result).toMatchObject({ id: 99, role: UserRole.LETTORE });
    });

    it('utente non esistente + LDAP configurato + credenziali rifiutate: nessuna riga creata', async () => {
      userRepository.findOne.mockResolvedValue(null);
      ldapService.isConfigured.mockReturnValue(true);
      ldapService.authenticate.mockRejectedValue(new Error('unauthorized'));

      const result = await service.validateUser('sconosciuto@comune.it', 'wrong');

      expect(result).toBeNull();
      expect(userRepository.create).not.toHaveBeenCalled();
      expect(userRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('firma un JWT con id/email/role dell\'utente', async () => {
      const result = await service.login(baseUser);

      expect(jwtService.sign).toHaveBeenCalledWith({
        sub: baseUser.id,
        email: baseUser.email,
        role: baseUser.role,
      });
      expect(result).toEqual({ access_token: 'signed-jwt' });
    });
  });

  describe('generateOtp', () => {
    it('genera un OTP a 6 cifre, lo salva e invia l\'email', async () => {
      userRepository.findOne.mockResolvedValue({ ...baseUser });
      userRepository.save.mockResolvedValue(undefined);

      const result = await service.generateOtp(baseUser.email);

      expect(result).toBe(true);
      expect(userRepository.save).toHaveBeenCalledTimes(1);
      const savedUser = userRepository.save.mock.calls[0][0];
      expect(savedUser.otp).toMatch(/^\d{6}$/);
      expect(savedUser.otp_expiry).toBeInstanceOf(Date);
      expect(mailer.sendMail).toHaveBeenCalledTimes(1);
      // Verify email subject and fromName arguments
      const [to, subject, , , fromName] = mailer.sendMail.mock.calls[0];
      expect(to).toBe(baseUser.email);
      expect(subject).toContain('UtenzePA');
      expect(subject).toContain('Comune di Montesilvano');
      expect(fromName).toBe('Comune di Montesilvano');
    });

    it('restituisce false se l\'utente non esiste, senza inviare email', async () => {
      userRepository.findOne.mockResolvedValue(null);

      const result = await service.generateOtp('sconosciuto@comune.it');

      expect(result).toBe(false);
      expect(userRepository.save).not.toHaveBeenCalled();
      expect(mailer.sendMail).not.toHaveBeenCalled();
    });
  });

  describe('verifyOtp', () => {
    it('restituisce true se il codice combacia e non è scaduto', async () => {
      const future = new Date(Date.now() + 60_000);
      userRepository.findOne.mockResolvedValue({ ...baseUser, otp: '123456', otp_expiry: future });

      const result = await service.verifyOtp(baseUser.email, '123456');

      expect(result).toBe(true);
    });

    it('restituisce false se il codice non combacia', async () => {
      const future = new Date(Date.now() + 60_000);
      userRepository.findOne.mockResolvedValue({ ...baseUser, otp: '123456', otp_expiry: future });

      const result = await service.verifyOtp(baseUser.email, '999999');

      expect(result).toBe(false);
    });

    it('restituisce false se il codice è scaduto', async () => {
      const past = new Date(Date.now() - 60_000);
      userRepository.findOne.mockResolvedValue({ ...baseUser, otp: '123456', otp_expiry: past });

      const result = await service.verifyOtp(baseUser.email, '123456');

      expect(result).toBe(false);
    });

    it('restituisce false se non è mai stato generato un OTP', async () => {
      userRepository.findOne.mockResolvedValue({ ...baseUser, otp: undefined, otp_expiry: undefined });

      const result = await service.verifyOtp(baseUser.email, '123456');

      expect(result).toBe(false);
    });
  });

  describe('resetPassword', () => {
    it('aggiorna la password e invalida l\'OTP se il codice è valido', async () => {
      const future = new Date(Date.now() + 60_000);
      const user = { ...baseUser, otp: '123456', otp_expiry: future };
      userRepository.findOne.mockResolvedValue(user);
      userRepository.save.mockResolvedValue(undefined);
      jest.spyOn(bcrypt, 'hash').mockResolvedValue('new-hashed-password' as never);

      const result = await service.resetPassword(baseUser.email, '123456', 'NuovaPassword123!');

      expect(result).toBe(true);
      expect(userRepository.save).toHaveBeenCalledTimes(1);
      const savedUser = userRepository.save.mock.calls[0][0];
      expect(savedUser.passwordHash).toBe('new-hashed-password');
      expect(savedUser.otp).toBeNull();
      expect(savedUser.otp_expiry).toBeNull();
    });

    it('non aggiorna nulla se l\'OTP è scaduto', async () => {
      const past = new Date(Date.now() - 60_000);
      userRepository.findOne.mockResolvedValue({ ...baseUser, otp: '123456', otp_expiry: past });

      const result = await service.resetPassword(baseUser.email, '123456', 'NuovaPassword123!');

      expect(result).toBe(false);
      expect(userRepository.save).not.toHaveBeenCalled();
    });

    it('non aggiorna nulla se il codice OTP è sbagliato', async () => {
      const future = new Date(Date.now() + 60_000);
      userRepository.findOne.mockResolvedValue({ ...baseUser, otp: '123456', otp_expiry: future });

      const result = await service.resetPassword(baseUser.email, '000000', 'NuovaPassword123!');

      expect(result).toBe(false);
      expect(userRepository.save).not.toHaveBeenCalled();
    });
  });
});
