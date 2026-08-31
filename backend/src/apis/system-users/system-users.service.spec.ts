import { BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { SystemUsersService } from './system-users.service';
import { SystemUser } from './entity/system-user.entity';

describe('SystemUsersService', () => {
  let service: SystemUsersService;
  let repo: {
    createQueryBuilder: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let qb: {
    where: jest.Mock;
    andWhere: jest.Mock;
    orderBy: jest.Mock;
    getMany: jest.Mock;
  };

  beforeEach(() => {
    qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    repo = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
      findOne: jest.fn(),
      create: jest.fn((data) => data),
      save: jest.fn(async (data) => data),
    };
    service = new SystemUsersService(repo as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('findAll', () => {
    it('filtra i soli utenti non cancellati di default', async () => {
      await service.findAll();

      expect(qb.where).toHaveBeenCalledWith('user.deleted = :deleted', { deleted: false });
    });

    it('applica i filtri per nome, cognome, email, ruolo e stato', async () => {
      await service.findAll({
        firstName: 'Mario',
        lastName: 'Rossi',
        email: 'mario@comune.it',
        role: 'Admin',
        status: 'Attivo',
      } as never);

      expect(qb.andWhere).toHaveBeenCalledWith('user.first_name LIKE :first_name', {
        first_name: '%Mario%',
      });
      expect(qb.andWhere).toHaveBeenCalledWith('user.last_name LIKE :last_name', {
        last_name: '%Rossi%',
      });
      expect(qb.andWhere).toHaveBeenCalledWith('user.email LIKE :email', {
        email: '%mario@comune.it%',
      });
      expect(qb.andWhere).toHaveBeenCalledWith('user.role = :role', { role: 'Admin' });
      expect(qb.andWhere).toHaveBeenCalledWith('user.status = :status', { status: 'Attivo' });
    });

    it('ordina per id ascendente e restituisce il risultato', async () => {
      const users = [{ id: 1 } as SystemUser];
      qb.getMany.mockResolvedValue(users);

      const result = await service.findAll();

      expect(qb.orderBy).toHaveBeenCalledWith('user.id', 'ASC');
      expect(result).toBe(users);
    });
  });

  describe('findOne', () => {
    it('restituisce l\'utente non cancellato', async () => {
      const user = { id: 1 } as SystemUser;
      repo.findOne.mockResolvedValue(user);

      const result = await service.findOne(1);

      expect(repo.findOne).toHaveBeenCalledWith({ where: { id: 1, deleted: false } });
      expect(result).toBe(user);
    });

    it('restituisce null se non trovato', async () => {
      repo.findOne.mockResolvedValue(null);

      const result = await service.findOne(999);

      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('crea l\'utente con la password hashata se l\'email non è già registrata', async () => {
      repo.findOne.mockResolvedValue(null);
      jest.spyOn(bcrypt, 'hash').mockResolvedValue('hashed-password' as never);

      const result = await service.create(
        {
          firstName: 'Mario',
          lastName: 'Rossi',
          email: 'mario@comune.it',
          password: 'plain-password',
        } as never,
        3,
      );

      expect(bcrypt.hash).toHaveBeenCalledWith('plain-password', 10);
      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          firstName: 'Mario',
          lastName: 'Rossi',
          email: 'mario@comune.it',
          passwordHash: 'hashed-password',
          created_by_user_id: 3,
          updated_by_user_id: 3,
        }),
      );
      expect(result).not.toHaveProperty('password');
    });

    it('lancia BadRequestException se l\'email è già registrata', async () => {
      repo.findOne.mockResolvedValue({ id: 1, email: 'mario@comune.it' } as SystemUser);

      await expect(
        service.create({ email: 'mario@comune.it', password: 'x' } as never),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('update', () => {
    it('imposta updated_by_user_id e aggiorna l\'utente', async () => {
      const entity = { id: 1, firstName: 'Mario' } as SystemUser;
      repo.findOne.mockResolvedValue(entity);

      const dto = { firstName: 'Marco' } as never;
      const result = await service.update(1, dto, 5);

      expect((dto as { updated_by_user_id?: number }).updated_by_user_id).toBe(5);
      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 1, firstName: 'Marco', updated_by_user_id: 5 }),
      );
      expect(result).toBeDefined();
    });

    it('lancia BadRequestException se l\'utente non esiste', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.update(999, { firstName: 'X' } as never)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('remove', () => {
    it('marca l\'utente come cancellato', async () => {
      const entity = { id: 1, deleted: false } as SystemUser;
      repo.findOne.mockResolvedValue(entity);

      await service.remove(1, 9);

      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 1, deleted: true, updated_by_user_id: 9 }),
      );
    });

    it('usa 0 come updatedByUserId di default se non fornito', async () => {
      const entity = { id: 1, deleted: false } as SystemUser;
      repo.findOne.mockResolvedValue(entity);

      await service.remove(1);

      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 1, deleted: true, updated_by_user_id: 0 }),
      );
    });

    it('lancia BadRequestException se l\'utente non esiste', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.remove(999, 1)).rejects.toThrow(BadRequestException);
    });
  });
});
