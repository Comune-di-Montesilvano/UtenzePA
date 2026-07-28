import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MaintenanceManager } from '../shared/entities/maintenanceManagers.entity';
import { CreateMaintenanceManagerDto } from './dto/create-maintenance-managers.dto';
import { UpdateMaintenanceManagerDto } from './dto/update-maintenance-managers.dto';

@Injectable()
export class MaintenanceManagersService {
  constructor(
    @InjectRepository(MaintenanceManager)
    private readonly maintenanceManagerRepo: Repository<MaintenanceManager>,
  ) {}

  async findAll(filters?: Partial<MaintenanceManager>): Promise<MaintenanceManager[]> {
    const qb = this.maintenanceManagerRepo.createQueryBuilder('maintenance-managers');

    qb.where('maintenance-managers.deleted = :deleted', { deleted: false });

    if (filters) {
      if (filters.code?.trim()) {
        qb.andWhere('maintenance-managers.code LIKE :code', {
          code: `%${filters.code.trim()}%`,
        });
      }

      if (filters.description?.trim()) {
        qb.andWhere('maintenance-managers.description LIKE :description', {
          description: `%${filters.description.trim()}%`,
        });
      }

      if (filters.deleted !== undefined && filters.deleted !== null) {
        qb.orWhere('maintenance-managers.deleted = :showDeleted', { showDeleted: filters.deleted });
      }
    }

    return qb.orderBy('maintenance-managers.id', 'ASC').getMany();
  }

  findOne(id: number): Promise<MaintenanceManager | null> {
    return this.maintenanceManagerRepo.findOne({ where: { id } });
  }

  async create(dto: CreateMaintenanceManagerDto, userId?: number): Promise<MaintenanceManager> {
    const existing = await this.maintenanceManagerRepo.findOne({
      where: { code: dto.code },
    });
    if (existing) {
      throw new BadRequestException('Codice Gestore Manutenzione gi utilizzato.');
    }

    const newManager = this.maintenanceManagerRepo.create({
      ...dto,
      ...(userId !== undefined && { created_by_user_id: userId, updated_by_user_id: userId }),
    });
    return this.maintenanceManagerRepo.save(newManager);
  }

  async update(
    id: number,
    updateDto: UpdateMaintenanceManagerDto,
    userId?: number,
  ): Promise<MaintenanceManager> {
    const entity = await this.findOne(id);
    if (!entity) {
      throw new BadRequestException('Gestore Manutenzione non trovato');
    }

    if (updateDto.code) {
      if (updateDto.code !== entity.code) {
        const existing = await this.maintenanceManagerRepo.findOne({
          where: { code: updateDto.code },
        });

        if (existing && existing.id !== id) {
          throw new BadRequestException('Codice Gestore Manutenzione già presente');
        }
      }
    }

    Object.assign(entity, updateDto);
    if (userId !== undefined) entity.updated_by_user_id = userId;
    return this.maintenanceManagerRepo.save(entity);
  }

  async remove(id: number, updatedByUserId: number): Promise<void> {
    const entity = await this.findOne(id);
    if (!entity) throw new BadRequestException('Gestore Manutenzione non trovato');

    entity.deleted = true;
    entity.updated_by_user_id = updatedByUserId;
    await this.maintenanceManagerRepo.save(entity);
  }
}
