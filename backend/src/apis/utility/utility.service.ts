import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Utility } from './entity/utility.entity';
import { CreateUtilityDto } from './dto/create-utility.dto';
import { UpdateUtilityDto } from './dto/update-utility.dto';
import { SearchUtilityDto } from './dto/search-utility.dto';
import { ExpiryStatus } from './enum/ExpiryStatus.enum';
import { BaseService } from '@apis/shared/base.service';

@Injectable()
export class UtilitiesService extends BaseService<Utility, CreateUtilityDto, UpdateUtilityDto> {
  protected readonly entityName = 'utilities';
  protected readonly relations = ['created_by', 'updated_by'];

  constructor(
    @InjectRepository(Utility)
    protected readonly repo: Repository<Utility>,
  ) {
    super();
  }

  private readonly MS_PER_DAY = 1000 * 60 * 60 * 24;

  getDaysToExpiry(expiryDate: Date | null): number | null {
    if (!expiryDate) {
      return null;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const expiry = new Date(expiryDate);
    expiry.setHours(0, 0, 0, 0);

    return Math.floor((expiry.getTime() - today.getTime()) / this.MS_PER_DAY);
  }

  getExpiryStatus(expiryDate: Date | null): ExpiryStatus | null {
    const diffDays = this.getDaysToExpiry(expiryDate);

    if (diffDays === null) return null;
    if (diffDays < 0) return ExpiryStatus.EXPIRED;
    if (diffDays < 30) return ExpiryStatus.EXPIRING30;
    if (diffDays < 60) return ExpiryStatus.EXPIRING60;
    if (diffDays < 90) return ExpiryStatus.EXPIRING90;
    return ExpiryStatus.ACTIVE;
  }

  async findAll(filters?: Partial<SearchUtilityDto>): Promise<Utility[]> {
    const qb = this.repo.createQueryBuilder('Utility');
    qb.leftJoinAndSelect('Utility.utilityType', 'utilityType', 'utilityType.deleted = 0');
    qb.leftJoinAndSelect('utilityType.utilityTypePurposes', 'utps');
    qb.leftJoinAndSelect('utps.purpose', 'utpPurpose', 'utpPurpose.deleted = 0');
    qb.leftJoinAndSelect('Utility.asset', 'asset', 'asset.deleted = 0');
    qb.leftJoinAndSelect('asset.utilizerGrants', 'utilizerGrants', 'utilizerGrants.deleted = 0');
    qb.leftJoinAndSelect('utilizerGrants.utilizer', 'utilizer', 'utilizer.deleted = 0');
    qb.leftJoinAndSelect('Utility.supplier', 'supplier', 'supplier.deleted = 0');
    qb.leftJoinAndSelect('Utility.costsBorneBy', 'costsBorneBy', 'costsBorneBy.deleted = 0');
    qb.leftJoinAndSelect(
      'Utility.maintenanceManager',
      'maintenanceManager',
      'maintenanceManager.deleted = 0',
    );
    qb.leftJoinAndSelect('Utility.budgetChapter', 'budgetChapter', 'budgetChapter.deleted = 0');
    qb.leftJoinAndSelect(
      'Utility.consipAgreement',
      'consipAgreement',
      'consipAgreement.deleted = 0',
    );
    qb.leftJoinAndSelect(
      'Utility.utilityAggregator',
      'utilityAggregator',
      'utilityAggregator.deleted = 0',
    );

    qb.where('Utility.deleted = :deleted', { deleted: filters?.deleted ?? false });

    if (filters?.safeguard !== undefined && filters.safeguard !== null) {
      const safeguardValue = filters.safeguard.toString();
      qb.andWhere('consipAgreement.safeguard = :safeguard_filter', {
        safeguard_filter: safeguardValue === 'true' || safeguardValue === '1' ? 1 : 0,
      });
    }

    if (filters.user_id_fk) {
      qb.andWhere('utilizer.id = :user_id_fk', { user_id_fk: filters.user_id_fk });
    }

    if (filters.utilityState) {
      this.applyUtilityStateFilter(qb, filters.utilityState);
    }

    this.applyFilters(qb, filters, 'Utility', [
      'deleted',
      'safeguard',
      'user_id_fk',
      'id',
      'create_date',
      'update_date',
      'utilityState',
    ]);

    const utilities = qb.orderBy('Utility.id', 'ASC').getMany();

    return (await utilities).map((utility) => ({
      ...utility,
      expiryStatus: this.getExpiryStatus(this.toDate(utility.supply_expiry_date)),
      aggregator: utility.utilityAggregator ?? null,
      utilityType: utility.utilityType
        ? {
            ...utility.utilityType,
            purposes: utility.utilityType.utilityTypePurposes?.map((utp) => utp.purpose) ?? [],
            utilityTypePurposes: undefined,
          }
        : null,
    }));
  }

  private applyUtilityStateFilter(
    qb: ReturnType<typeof this.repo.createQueryBuilder>,
    utilityState: ExpiryStatus,
  ): void {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const expiringDaysMap: Partial<Record<ExpiryStatus, number>> = {
      [ExpiryStatus.EXPIRING30]: 30,
      [ExpiryStatus.EXPIRING60]: 60,
      [ExpiryStatus.EXPIRING90]: 90,
    };

    const days = expiringDaysMap[utilityState] ?? null;

    if (utilityState === ExpiryStatus.EXPIRED) {
      qb.andWhere('Utility.supply_expiry_date < :us_today', { us_today: today });
    } else if (utilityState === ExpiryStatus.ACTIVE) {
      const threshold = new Date(today);
      threshold.setDate(today.getDate() + 90);
      threshold.setHours(23, 59, 59, 999);
      qb.andWhere('Utility.supply_expiry_date > :us_threshold', { us_threshold: threshold });
    } else if (days !== null) {
      const threshold = new Date(today);
      threshold.setDate(today.getDate() + days);
      threshold.setHours(23, 59, 59, 999);
      qb.andWhere(
        'Utility.supply_expiry_date >= :us_today AND Utility.supply_expiry_date <= :us_threshold',
        { us_today: today, us_threshold: threshold },
      );
    }
  }

  private toDate(value: string | Date | null): Date | null {
    if (!value) {
      return null;
    }

    const date = value instanceof Date ? value : new Date(value);
    return isNaN(date.getTime()) ? null : date;
  }

  async findBySafeguard(): Promise<Utility[]> {
    const qb = this.repo.createQueryBuilder('Utility');
    qb.innerJoinAndSelect(
      'Utility.consipAgreement',
      'consipAgreement',
      'consipAgreement.deleted = 0',
    );
    qb.leftJoinAndSelect('Utility.utilityType', 'utilityType', 'utilityType.deleted = 0');
    qb.leftJoinAndSelect('utilityType.utilityTypePurposes', 'utps');
    qb.leftJoinAndSelect('utps.purpose', 'utpPurpose', 'utpPurpose.deleted = 0');
    qb.leftJoinAndSelect('Utility.asset', 'asset', 'asset.deleted = 0');
    qb.leftJoinAndSelect('asset.utilizerGrants', 'utilizerGrants', 'utilizerGrants.deleted = 0');
    qb.leftJoinAndSelect('utilizerGrants.utilizer', 'utilizer', 'utilizer.deleted = 0');
    qb.leftJoinAndSelect('Utility.supplier', 'supplier', 'supplier.deleted = 0');
    qb.leftJoinAndSelect('Utility.costsBorneBy', 'costsBorneBy', 'costsBorneBy.deleted = 0');
    qb.leftJoinAndSelect(
      'Utility.maintenanceManager',
      'maintenanceManager',
      'maintenanceManager.deleted = 0',
    );
    qb.leftJoinAndSelect('Utility.budgetChapter', 'budgetChapter', 'budgetChapter.deleted = 0');
    qb.where('Utility.deleted = :deleted', { deleted: false });
    qb.andWhere('consipAgreement.safeguard = :safeguard', { safeguard: 1 });

    const utilities = await qb.orderBy('Utility.id', 'ASC').getMany();

    return utilities.map((utility) => ({
      ...utility,
      expiryStatus: this.getExpiryStatus(this.toDate(utility.supply_expiry_date)),
      utilityType: utility.utilityType
        ? {
            ...utility.utilityType,
            purposes: utility.utilityType.utilityTypePurposes?.map((utp) => utp.purpose) ?? [],
            utilityTypePurposes: undefined,
          }
        : null,
    }));
  }

  findOne(id: number): Promise<Utility | null> {
    return this.repo.findOne({
      where: { id: id },
      relations: {
        asset: true,
        utilityType: true,
        costsBorneBy: true,
        maintenanceManager: true,
        supplier: true,
        utilityAggregator: true,
        budgetChapter: true,
        created_by: true,
        updated_by: true,
      },
    });
  }

  async create(dto: CreateUtilityDto, userId?: number): Promise<Utility> {
    const newUtility = this.repo.create({
      ...dto,
      ...(userId !== undefined && { created_by_user_id: userId, updated_by_user_id: userId }),
    });

    try {
      return await this.repo.save(newUtility);
    } catch (error) {
      this.manageErrors(error, "Errore durante la creazione dell'Utenza");
    }
  }

  async remove(id: number, updatedByUserId: number): Promise<void> {
    const entity = await this.findOne(id);
    if (!entity) throw new BadRequestException('Utenza non trovata');

    entity.deleted = true;
    entity.updated_by_user_id = updatedByUserId;
    await this.repo.save(entity);
  }
}
