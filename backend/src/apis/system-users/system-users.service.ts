import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { SystemUser } from './entity/system-user.entity';
import { UpdateSystemUserDto } from './dto/update-system-user.dto';
import { CreateSystemUserDto } from './dto/create-system-user.dto';
import { BaseService } from '@/apis/shared/base.service';

@Injectable()
export class SystemUsersService extends BaseService<
  SystemUser,
  CreateSystemUserDto,
  UpdateSystemUserDto
> {
  protected readonly entityName = 'user';
  protected readonly relations: string[] = [];

  // password_hash/otp/otp_expiry non vanno mai nel diff audit, anche se
  // presenti nel payload di update — dati sensibili, mai testo in chiaro
  // nella storia modifiche.
  protected readonly auditBlocklist: string[] = ['password_hash', 'otp', 'otp_expiry'];

  constructor(
    @InjectRepository(SystemUser)
    protected readonly repo: Repository<SystemUser>,
  ) {
    super();
  }

  async findAll(filters?: Partial<SystemUser>): Promise<SystemUser[]> {
    const qb = this.repo.createQueryBuilder('user');
    qb.where('user.deleted = :deleted', { deleted: false });

    if (filters) {
      if (filters.firstName?.trim()) {
        qb.andWhere('user.first_name LIKE :first_name', {
          first_name: `%${filters.firstName.trim()}%`,
        });
      }
      if (filters.lastName?.trim()) {
        qb.andWhere('user.last_name LIKE :last_name', {
          last_name: `%${filters.lastName.trim()}%`,
        });
      }
      if (filters.email?.trim()) {
        qb.andWhere('user.email LIKE :email', { email: `%${filters.email.trim()}%` });
      }
      if (filters.role !== undefined && filters.role !== null) {
        qb.andWhere('user.role = :role', { role: filters.role });
      }
      if (filters.status !== undefined && filters.status !== null) {
        qb.andWhere('user.status = :status', { status: filters.status });
      }
    }

    return qb.orderBy('user.id', 'ASC').getMany();
  }

  findOne(id: number): Promise<SystemUser | null> {
    return this.repo.findOne({ where: { id, deleted: false } as never });
  }

  async create(dto: CreateSystemUserDto, userId?: number): Promise<SystemUser> {
    const existing = await this.repo.findOne({ where: { email: dto.email } });
    if (existing) {
      throw new BadRequestException('Email già registrata');
    }

    const { password, ...rest } = dto;
    const passwordHash = await bcrypt.hash(password, 10);

    return super.create({ ...rest, passwordHash } as unknown as CreateSystemUserDto, userId);
  }

  async update(id: number, dto: UpdateSystemUserDto, userId?: number): Promise<SystemUser> {
    if (userId !== undefined) {
      dto.updated_by_user_id = userId;
    }
    return super.update(id, dto);
  }

  async remove(id: number, updatedByUserId?: number): Promise<void> {
    return super.remove(id, updatedByUserId ?? 0);
  }
}
