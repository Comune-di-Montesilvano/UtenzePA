import { BadRequestException } from '@nestjs/common';
import { SuppliersService } from './suppliers.service';
import { Supplier } from '../shared/entities/supplier.entity';

describe('SuppliersService', () => {
  let service: SuppliersService;
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
    service = new SuppliersService(repo as never);
  });

  describe('findAll', () => {
    it('filtra i soli fornitori non cancellati', async () => {
      await service.findAll();

      expect(qb.where).toHaveBeenCalledWith('suppliers.deleted = :deleted', { deleted: false });
    });

    it('applica ulteriori filtri se forniti', async () => {
      await service.findAll({ company_name: 'Acme' } as never);

      expect(qb.andWhere).toHaveBeenCalledWith('suppliers.company_name LIKE :filter_company_name', {
        filter_company_name: '%Acme%',
      });
    });

    it('ordina per id ascendente e restituisce il risultato', async () => {
      const suppliers = [{ id: 1 } as Supplier];
      qb.getMany.mockResolvedValue(suppliers);

      const result = await service.findAll();

      expect(qb.orderBy).toHaveBeenCalledWith('suppliers.id', 'ASC');
      expect(result).toBe(suppliers);
    });
  });

  describe('create', () => {
    it('crea il fornitore se il supplier_id non è già utilizzato', async () => {
      repo.findOne.mockResolvedValue(null);

      const result = await service.create(
        { supplier_id: 'F-1', company_name: 'Acme Srl' } as never,
        2,
      );

      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ supplier_id: 'F-1', company_name: 'Acme Srl' }),
      );
      expect(result).toEqual(expect.objectContaining({ supplier_id: 'F-1' }));
    });

    it('lancia BadRequestException se il supplier_id è già utilizzato', async () => {
      repo.findOne.mockResolvedValue({ id: 1, supplier_id: 'F-1' } as Supplier);

      await expect(
        service.create({ supplier_id: 'F-1', company_name: 'Acme Srl' } as never),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('update', () => {
    it('aggiorna il fornitore se non ci sono conflitti su supplier_id/company_name', async () => {
      const entity = { id: 1, supplier_id: 'F-1', company_name: 'Acme Srl' } as Supplier;
      repo.findOne.mockResolvedValue(entity);

      await service.update(1, { company_name: 'Acme Srl' } as never, 4);

      expect(repo.save).toHaveBeenCalled();
    });

    it('lancia BadRequestException se il fornitore non esiste', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.update(999, { company_name: 'X' } as never)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('lancia BadRequestException se il nuovo supplier_id è già presente su un altro fornitore', async () => {
      const entity = { id: 1, supplier_id: 'F-1', company_name: 'Acme Srl' } as Supplier;
      repo.findOne
        .mockResolvedValueOnce(entity) // findOne(id) chiamato dal metodo update override
        .mockResolvedValueOnce({ id: 2, supplier_id: 'F-2' } as Supplier); // check duplicato supplier_id

      await expect(service.update(1, { supplier_id: 'F-2' } as never)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('lancia BadRequestException se la nuova ragione sociale è già presente su un altro fornitore', async () => {
      const entity = { id: 1, supplier_id: 'F-1', company_name: 'Acme Srl' } as Supplier;
      repo.findOne
        .mockResolvedValueOnce(entity) // findOne(id)
        .mockResolvedValueOnce({ id: 2, company_name: 'Beta Srl' } as Supplier); // check duplicato company_name

      await expect(service.update(1, { company_name: 'Beta Srl' } as never)).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
