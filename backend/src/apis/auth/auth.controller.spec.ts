import { AuditAction, AccessChannel } from '@apis/audit-log/entity/audit-log.entity';
import { AuthProvider } from '../shared/enum/user.enums';

// AuthService importa @nestjs/jwt (solo ESM, vedi testPathIgnorePatterns):
// il controller si prova con un AuthService finto.
jest.mock('./auth.service', () => ({ AuthService: class {} }));

import { AuthController } from './auth.controller';

describe('AuthController — log accessi', () => {
  let authService: { validateUser: jest.Mock; login: jest.Mock };
  let auditLog: { recordAccess: jest.Mock };
  let controller: AuthController;

  beforeEach(() => {
    authService = {
      validateUser: jest.fn(),
      login: jest.fn().mockResolvedValue({ access_token: 't' }),
    };
    auditLog = { recordAccess: jest.fn().mockResolvedValue(undefined) };
    controller = new AuthController(authService as never, auditLog as never);
  });

  it('registra il login LDAP con il canale', async () => {
    authService.validateUser.mockResolvedValue({
      id: 3,
      authProvider: AuthProvider.LDAP,
      deleted: false,
    });

    const res = await controller.login({ email: 'nome.cognome', password: 'x' });

    expect(res.status).toBe('ok');
    expect(auditLog.recordAccess).toHaveBeenCalledWith(3, AuditAction.LOGIN, AccessChannel.LDAP);
  });

  it('registra il login locale', async () => {
    authService.validateUser.mockResolvedValue({
      id: 4,
      authProvider: AuthProvider.LOCAL,
      deleted: false,
    });

    await controller.login({ email: 'a@b.it', password: 'x' });

    expect(auditLog.recordAccess).toHaveBeenCalledWith(4, AuditAction.LOGIN, AccessChannel.LOCAL);
  });

  it('non registra credenziali errate', async () => {
    authService.validateUser.mockResolvedValue(null);

    await controller.login({ email: 'a@b.it', password: 'x' });

    expect(auditLog.recordAccess).not.toHaveBeenCalled();
  });

  it('il login riesce anche se il log fallisce', async () => {
    authService.validateUser.mockResolvedValue({
      id: 4,
      authProvider: AuthProvider.LOCAL,
      deleted: false,
    });
    auditLog.recordAccess.mockRejectedValue(new Error('db giù'));

    const res = await controller.login({ email: 'a@b.it', password: 'x' });

    expect(res.status).toBe('ok');
  });

  it('registra logout e scadenza per inattività', async () => {
    await controller.logout({ reason: 'LOGOUT' }, { id: 4, email: '', role: 'Lettore' });
    await controller.logout({ reason: 'TIMEOUT' }, { id: 4, email: '', role: 'Lettore' });

    expect(auditLog.recordAccess).toHaveBeenNthCalledWith(1, 4, AuditAction.LOGOUT, null);
    expect(auditLog.recordAccess).toHaveBeenNthCalledWith(2, 4, AuditAction.TIMEOUT, null);
  });
});
