import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Utility } from './entity/utility.entity';
import { CreateUtilityDto } from './dto/create-utility.dto';
import { UpdateUtilityDto } from './dto/update-utility.dto';
import { SearchUtilityDto } from './dto/search-utility.dto';
import { ExpiryStatus } from './enum/ExpiryStatus.enum';
import { BaseService } from '@apis/shared/base.service';
import { Contract } from '@apis/contracts/entity/contract.entity';
import { DateHelper } from '@/helpers/date.helpers';

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

  /**
   * Aggiunge alla query il JOIN (solo per filtri/WHERE, senza SELECT) verso
   * il "contratto corrente" dell'utenza: tra i contratti associati (via
   * contract_utilities), quello con supply_expiry_date nulla o >= oggi, il
   * più recente per supply_start_date in caso di più match — nessun campo
   * stato dedicato, calcolo a runtime.
   *
   * NOTA: deliberatamente `leftJoin`/`innerJoin` (non `...AndSelect`) — un
   * join su `Contract` non raggiungibile da `Utility` tramite una relazione
   * reale (qui è correlato via una sotto-query, non una @ManyToOne/@OneToOne)
   * non viene idratato da TypeORM nell'albero dell'entity risultante quando
   * convivono altri join one-to-many nella stessa query (es.
   * utilityType.utilityTypePurposes, asset.utilizerGrants) — verificato con
   * una chiamata reale all'endpoint: nessun errore SQL, ma
   * `utility.currentContract` restituiva sempre `undefined`. Il contratto
   * corrente va quindi risolto con una query separata (`loadCurrentContracts`,
   * rooted su `Contract` con le sue relazioni reali `supplier`/
   * `consipAgreement`, che idratano correttamente). Questo join resta solo
   * per poter scrivere `currentContract.colonna`/`currentConsipAgreement.colonna`
   * nelle WHERE (safeguard, filtri contratto, stato scadenza).
   */
  private joinCurrentContract(
    qb: ReturnType<typeof this.repo.createQueryBuilder>,
    options: { inner?: boolean } = {},
  ): void {
    const join = options.inner ? 'innerJoin' : 'leftJoin';

    qb.leftJoin(
      (subQb) =>
        subQb
          .subQuery()
          .select('cu.utility_id', 'utility_id')
          .addSelect('c.id', 'contract_id')
          .from('contract_utilities', 'cu')
          .innerJoin('contracts', 'c', 'c.id = cu.contract_id AND c.deleted = 0')
          .where('c.supply_expiry_date IS NULL OR c.supply_expiry_date >= CURDATE()')
          .orderBy('cu.utility_id', 'ASC')
          .addOrderBy('c.supply_start_date', 'DESC')
          .addOrderBy('c.id', 'DESC'),
      'current_link',
      'current_link.utility_id = Utility.id',
    );
    (qb[join] as (...args: unknown[]) => unknown)(
      Contract,
      'currentContract',
      'currentContract.id = current_link.contract_id',
    );
    qb.leftJoin(
      'currentContract.consipAgreement',
      'currentConsipAgreement',
      'currentConsipAgreement.deleted = 0',
    );
  }

  /**
   * Risolve, in una singola query batched, il contratto corrente di ciascuna
   * delle utenze passate (stessa definizione di `joinCurrentContract`), con
   * `supplier`/`consipAgreement` correttamente idratati (query rooted su
   * `Contract`, relazioni reali). Ritorna una mappa utility.id -> Contract.
   */
  private async loadCurrentContracts(utilityIds: number[]): Promise<Map<number, Contract>> {
    const result = new Map<number, Contract>();
    if (!utilityIds.length) {
      return result;
    }

    const pairs: { utility_id: number; contract_id: number }[] = await this.repo.manager.query(
      `SELECT ranked.utility_id, ranked.contract_id FROM (
         SELECT cu.utility_id, c.id AS contract_id,
                ROW_NUMBER() OVER (
                  PARTITION BY cu.utility_id
                  ORDER BY c.supply_start_date DESC, c.id DESC
                ) AS rn
         FROM contract_utilities cu
         INNER JOIN contracts c ON c.id = cu.contract_id AND c.deleted = 0
         WHERE cu.utility_id IN (?)
           AND (c.supply_expiry_date IS NULL OR c.supply_expiry_date >= CURDATE())
       ) ranked WHERE ranked.rn = 1`,
      [utilityIds],
    );

    if (!pairs.length) {
      return result;
    }

    const contractRepo = this.repo.manager.getRepository(Contract);
    const contracts = await contractRepo.find({
      where: { id: In(pairs.map((pair) => pair.contract_id)) },
      relations: { supplier: true, consipAgreement: true },
    });
    const contractById = new Map(contracts.map((contract) => [contract.id, contract]));

    for (const pair of pairs) {
      const contract = contractById.get(pair.contract_id);
      if (contract) {
        result.set(pair.utility_id, contract);
      }
    }

    return result;
  }

  /**
   * Flatte i campi del contratto corrente sull'oggetto Utility restituito,
   * sotto i nomi legacy: compatibilità con frontend/dashboard che leggono
   * ancora quei campi direttamente da Utility (rimossi dallo schema nel
   * task successivo).
   */
  private withCurrentContractFields(utility: Utility, current: Contract | undefined): Utility {
    return {
      ...utility,
      supplier: current?.supplier ?? null,
      supplier_id_fk: current?.supplier_id_fk ?? null,
      cig_contract: current?.cig_contract ?? null,
      order_number: current?.order_number ?? null,
      consip_order: current?.consip_order ?? null,
      consip_agreement_id: current?.consip_agreement_id ?? null,
      consipAgreement: current?.consipAgreement ?? null,
      supply_start_date: current?.supply_start_date ?? null,
      supply_expiry_date: current?.supply_expiry_date ?? null,
      management_expiry_date: current?.management_expiry_date ?? null,
      takeover_termination_date: current?.takeover_termination_date ?? null,
      security_deposit: current?.security_deposit ?? 0,
      expiryStatus: this.getExpiryStatus(this.toDate(current?.supply_expiry_date ?? null)),
      aggregator: utility.utilityAggregator ?? null,
      utilityType: utility.utilityType
        ? {
            ...utility.utilityType,
            purposes: utility.utilityType.utilityTypePurposes?.map((utp) => utp.purpose) ?? [],
            utilityTypePurposes: undefined,
          }
        : null,
    } as Utility;
  }

  async findAll(filters?: Partial<SearchUtilityDto>): Promise<Utility[]> {
    const qb = this.repo.createQueryBuilder('Utility');
    qb.leftJoinAndSelect('Utility.utilityType', 'utilityType', 'utilityType.deleted = 0');
    qb.leftJoinAndSelect('utilityType.utilityTypePurposes', 'utps');
    qb.leftJoinAndSelect('utps.purpose', 'utpPurpose', 'utpPurpose.deleted = 0');
    qb.leftJoinAndSelect('Utility.asset', 'asset', 'asset.deleted = 0');
    qb.leftJoinAndSelect('asset.utilizerGrants', 'utilizerGrants', 'utilizerGrants.deleted = 0');
    qb.leftJoinAndSelect('utilizerGrants.utilizer', 'utilizer', 'utilizer.deleted = 0');
    qb.leftJoinAndSelect('Utility.costsBorneBy', 'costsBorneBy', 'costsBorneBy.deleted = 0');
    qb.leftJoinAndSelect(
      'Utility.maintenanceManager',
      'maintenanceManager',
      'maintenanceManager.deleted = 0',
    );
    qb.leftJoinAndSelect('Utility.budgetChapter', 'budgetChapter', 'budgetChapter.deleted = 0');
    qb.leftJoinAndSelect(
      'Utility.utilityAggregator',
      'utilityAggregator',
      'utilityAggregator.deleted = 0',
    );
    qb.leftJoinAndSelect('Utility.contratti', 'contratti', 'contratti.deleted = 0');

    this.joinCurrentContract(qb);

    qb.where('Utility.deleted = :deleted', { deleted: filters?.deleted ?? false });

    if (filters?.safeguard !== undefined && filters.safeguard !== null) {
      const safeguardValue = filters.safeguard.toString();
      qb.andWhere('currentConsipAgreement.safeguard = :safeguard_filter', {
        safeguard_filter: safeguardValue === 'true' || safeguardValue === '1' ? 1 : 0,
      });
    }

    if (filters.user_id_fk) {
      qb.andWhere('utilizer.id = :user_id_fk', { user_id_fk: filters.user_id_fk });
    }

    if (filters.utilityState) {
      this.applyUtilityStateFilter(qb, filters.utilityState);
    }

    // Campi ex-diretti su Utility, ora filtrati sul contratto corrente:
    // esclusi dal generico applyFilters e gestiti esplicitamente.
    const CONTRACT_FILTER_KEYS = [
      'supplier_id_fk',
      'cig_contract',
      'order_number',
      'consip_order',
      'consip_agreement_id',
      'security_deposit',
      'supply_start_date_range',
      'supply_expiry_date_range',
      'management_expiry_date_range',
      'takeover_termination_date_range',
    ];
    if (filters.supplier_id_fk) {
      qb.andWhere('currentContract.supplier_id_fk = :cf_supplier_id_fk', {
        cf_supplier_id_fk: filters.supplier_id_fk,
      });
    }
    if (filters.cig_contract) {
      qb.andWhere('currentContract.cig_contract LIKE :cf_cig_contract', {
        cf_cig_contract: `%${filters.cig_contract}%`,
      });
    }
    if (filters.order_number) {
      qb.andWhere('currentContract.order_number LIKE :cf_order_number', {
        cf_order_number: `%${filters.order_number}%`,
      });
    }
    if (filters.consip_order) {
      qb.andWhere('currentContract.consip_order LIKE :cf_consip_order', {
        cf_consip_order: `%${filters.consip_order}%`,
      });
    }
    if (filters.consip_agreement_id) {
      qb.andWhere('currentContract.consip_agreement_id = :cf_consip_agreement_id', {
        cf_consip_agreement_id: filters.consip_agreement_id,
      });
    }
    if (filters.security_deposit) {
      const trimmed = filters.security_deposit.toString().trim();
      if (trimmed) {
        qb.andWhere('currentContract.security_deposit LIKE :cf_security_deposit', {
          cf_security_deposit: `%${trimmed}%`,
        });
      }
    }
    if (filters.supply_start_date_range) {
      const [start, end] = filters.supply_start_date_range;
      if (start) {
        qb.andWhere('currentContract.supply_start_date >= :cf_supply_start_date_start', {
          cf_supply_start_date_start: DateHelper.mysqlDate(new Date(start)),
        });
      }
      if (end) {
        qb.andWhere('currentContract.supply_start_date <= :cf_supply_start_date_end', {
          cf_supply_start_date_end: DateHelper.mysqlDate(new Date(end)),
        });
      }
    }
    if (filters.supply_expiry_date_range) {
      const [start, end] = filters.supply_expiry_date_range;
      if (start) {
        qb.andWhere('currentContract.supply_expiry_date >= :cf_supply_expiry_date_start', {
          cf_supply_expiry_date_start: DateHelper.mysqlDate(new Date(start)),
        });
      }
      if (end) {
        qb.andWhere('currentContract.supply_expiry_date <= :cf_supply_expiry_date_end', {
          cf_supply_expiry_date_end: DateHelper.mysqlDate(new Date(end)),
        });
      }
    }
    if (filters.management_expiry_date_range) {
      const [start, end] = filters.management_expiry_date_range;
      if (start) {
        qb.andWhere('currentContract.management_expiry_date >= :cf_management_expiry_date_start', {
          cf_management_expiry_date_start: DateHelper.mysqlDate(new Date(start)),
        });
      }
      if (end) {
        qb.andWhere('currentContract.management_expiry_date <= :cf_management_expiry_date_end', {
          cf_management_expiry_date_end: DateHelper.mysqlDate(new Date(end)),
        });
      }
    }
    if (filters.takeover_termination_date_range) {
      const [start, end] = filters.takeover_termination_date_range;
      if (start) {
        qb.andWhere(
          'currentContract.takeover_termination_date >= :cf_takeover_termination_date_start',
          { cf_takeover_termination_date_start: DateHelper.mysqlDate(new Date(start)) },
        );
      }
      if (end) {
        qb.andWhere(
          'currentContract.takeover_termination_date <= :cf_takeover_termination_date_end',
          { cf_takeover_termination_date_end: DateHelper.mysqlDate(new Date(end)) },
        );
      }
    }

    this.applyFilters(qb, filters, 'Utility', [
      'deleted',
      'safeguard',
      'user_id_fk',
      'id',
      'create_date',
      'update_date',
      'utilityState',
      ...CONTRACT_FILTER_KEYS,
    ]);

    const utilities = await qb.orderBy('Utility.id', 'ASC').getMany();
    const currentContracts = await this.loadCurrentContracts(utilities.map((u) => u.id));

    return utilities.map((utility) =>
      this.withCurrentContractFields(utility, currentContracts.get(utility.id)),
    );
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
      qb.andWhere('currentContract.supply_expiry_date < :us_today', { us_today: today });
    } else if (utilityState === ExpiryStatus.ACTIVE) {
      const threshold = new Date(today);
      threshold.setDate(today.getDate() + 90);
      threshold.setHours(23, 59, 59, 999);
      qb.andWhere('currentContract.supply_expiry_date > :us_threshold', {
        us_threshold: threshold,
      });
    } else if (days !== null) {
      const threshold = new Date(today);
      threshold.setDate(today.getDate() + days);
      threshold.setHours(23, 59, 59, 999);
      qb.andWhere(
        'currentContract.supply_expiry_date >= :us_today AND currentContract.supply_expiry_date <= :us_threshold',
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
    this.joinCurrentContract(qb, { inner: true });
    qb.leftJoinAndSelect('Utility.utilityType', 'utilityType', 'utilityType.deleted = 0');
    qb.leftJoinAndSelect('utilityType.utilityTypePurposes', 'utps');
    qb.leftJoinAndSelect('utps.purpose', 'utpPurpose', 'utpPurpose.deleted = 0');
    qb.leftJoinAndSelect('Utility.asset', 'asset', 'asset.deleted = 0');
    qb.leftJoinAndSelect('asset.utilizerGrants', 'utilizerGrants', 'utilizerGrants.deleted = 0');
    qb.leftJoinAndSelect('utilizerGrants.utilizer', 'utilizer', 'utilizer.deleted = 0');
    qb.leftJoinAndSelect('Utility.costsBorneBy', 'costsBorneBy', 'costsBorneBy.deleted = 0');
    qb.leftJoinAndSelect(
      'Utility.maintenanceManager',
      'maintenanceManager',
      'maintenanceManager.deleted = 0',
    );
    qb.leftJoinAndSelect('Utility.budgetChapter', 'budgetChapter', 'budgetChapter.deleted = 0');
    qb.leftJoinAndSelect('Utility.contratti', 'contratti', 'contratti.deleted = 0');
    qb.where('Utility.deleted = :deleted', { deleted: false });
    qb.andWhere('currentConsipAgreement.safeguard = :safeguard', { safeguard: 1 });

    const utilities = await qb.orderBy('Utility.id', 'ASC').getMany();
    const currentContracts = await this.loadCurrentContracts(utilities.map((u) => u.id));

    return utilities.map((utility) =>
      this.withCurrentContractFields(utility, currentContracts.get(utility.id)),
    );
  }

  async findOne(id: number): Promise<Utility | null> {
    const qb = this.repo.createQueryBuilder('Utility');
    qb.leftJoinAndSelect('Utility.asset', 'asset', 'asset.deleted = 0');
    qb.leftJoinAndSelect('Utility.utilityType', 'utilityType', 'utilityType.deleted = 0');
    qb.leftJoinAndSelect('utilityType.utilityTypePurposes', 'utps');
    qb.leftJoinAndSelect('utps.purpose', 'utpPurpose', 'utpPurpose.deleted = 0');
    qb.leftJoinAndSelect('Utility.costsBorneBy', 'costsBorneBy', 'costsBorneBy.deleted = 0');
    qb.leftJoinAndSelect(
      'Utility.maintenanceManager',
      'maintenanceManager',
      'maintenanceManager.deleted = 0',
    );
    qb.leftJoinAndSelect(
      'Utility.utilityAggregator',
      'utilityAggregator',
      'utilityAggregator.deleted = 0',
    );
    qb.leftJoinAndSelect('Utility.budgetChapter', 'budgetChapter', 'budgetChapter.deleted = 0');
    qb.leftJoinAndSelect('Utility.created_by', 'created_by');
    qb.leftJoinAndSelect('Utility.updated_by', 'updated_by');
    qb.leftJoinAndSelect('Utility.contratti', 'contratti', 'contratti.deleted = 0');

    this.joinCurrentContract(qb);

    qb.where('Utility.id = :id', { id });

    const utility = await qb.getOne();
    if (!utility) {
      return null;
    }

    const currentContracts = await this.loadCurrentContracts([utility.id]);
    return this.withCurrentContractFields(utility, currentContracts.get(utility.id));
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
    // Nota: usa repo.findOne diretto (non this.findOne, che ora restituisce
    // un oggetto "appiattito" con i campi del contratto corrente) per non
    // rischiare di persistere quei valori derivati sulle colonne dirette di
    // Utility ancora presenti in questo task (es. supplier_id_fk).
    const entity = await this.repo.findOne({ where: { id } as never });
    if (!entity) throw new BadRequestException('Utenza non trovata');

    entity.deleted = true;
    entity.updated_by_user_id = updatedByUserId;
    await this.repo.save(entity);
  }
}
