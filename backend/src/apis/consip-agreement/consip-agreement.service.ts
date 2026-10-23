import { BadRequestException, Injectable } from '@nestjs/common';
import { DateHelper } from '@/helpers/date.helpers';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConsipAgreement } from '@apis/consip-agreement/entity/consip-agreement.entity';
import { CreateConsipAgreementDto } from '@apis/consip-agreement/dto/create-consip-agreement.dto';
import { UpdateConsipAgreementDto } from '@apis/consip-agreement/dto/update-consip-agreement.dto';
import { BaseService } from '@apis/shared/base.service';
import { SearchConsipAgreementDto } from '@apis/consip-agreement/dto/search-consip-agreement.dto';
import { Contract } from '@apis/contracts/entity/contract.entity';
import { AuditAction } from '@apis/audit-log/entity/audit-log.entity';
import {
  BudgetCommitmentsService,
  CommitmentRow,
} from '@apis/budget-commitments/budget-commitments.service';

export type AgreementContract = Pick<
  Contract,
  'id' | 'cig_contract' | 'consip_order' | 'supply_start_date' | 'supply_expiry_date' | 'closed'
>;

export interface AgreementCommitments {
  items: CommitmentRow[];
  totals: { amount: number; spent: number; remaining: number };
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

@Injectable()
export class ConsipAgreementService extends BaseService<
  ConsipAgreement,
  CreateConsipAgreementDto,
  UpdateConsipAgreementDto
> {
  protected readonly entityName = 'consip_agreement';
  protected readonly relations = ['supplier', 'created_by', 'updated_by'];

  constructor(
    @InjectRepository(ConsipAgreement)
    protected readonly repo: Repository<ConsipAgreement>,
    @InjectRepository(Contract)
    private readonly contractRepo: Repository<Contract>,
    private readonly commitmentsService: BudgetCommitmentsService,
  ) {
    super();
  }

  // Scheda: la convenzione con i contratti attuativi collegati.
  async findOneWithContracts(id: number): Promise<ConsipAgreement & { contracts: AgreementContract[] }> {
    const agreement = await this.findOne(id);
    if (!agreement) throw new BadRequestException('Convenzione non trovata');
    const contracts = await this.contractRepo.find({
      where: { consip_agreement_id: id, deleted: false },
      select: {
        id: true,
        cig_contract: true,
        consip_order: true,
        supply_start_date: true,
        supply_expiry_date: true,
        closed: true,
      },
      order: { supply_start_date: 'DESC', id: 'DESC' },
    });
    return { ...agreement, contracts };
  }

  // Impegni dei contratti della convenzione, ciascuno una volta; totali sui soli importi noti.
  async commitments(id: number): Promise<AgreementCommitments> {
    const items = await this.commitmentsService.listRows({ consip_agreement_id: id });
    const withAmount = items.filter((r) => r.amount !== null);
    return {
      items,
      totals: {
        amount: round2(withAmount.reduce((s, r) => s + (r.amount ?? 0), 0)),
        spent: round2(items.reduce((s, r) => s + r.spent, 0)),
        remaining: round2(withAmount.reduce((s, r) => s + (r.remaining ?? 0), 0)),
      },
    };
  }

  async linkContract(id: number, contractId: number, userId: number): Promise<void> {
    const agreement = await this.repo.findOne({ where: { id, deleted: false } });
    if (!agreement) throw new BadRequestException('Convenzione non trovata');
    const contract = await this.contract(contractId);
    if (contract.supplier_id_fk !== agreement.supplier_id) {
      throw new BadRequestException('Il contratto è di un fornitore diverso da quello della convenzione');
    }
    await this.setAgreement(contract, id, userId);
  }

  async unlinkContract(id: number, contractId: number, userId: number): Promise<void> {
    const contract = await this.contract(contractId);
    if (contract.consip_agreement_id !== id) {
      throw new BadRequestException('Il contratto non è collegato a questa convenzione');
    }
    await this.setAgreement(contract, null, userId);
  }

  private async contract(contractId: number): Promise<Contract> {
    const contract = await this.contractRepo.findOne({ where: { id: contractId, deleted: false } });
    if (!contract) throw new BadRequestException('Contratto non trovato');
    return contract;
  }

  // Modifica del contratto: l'audit va sul contratto, come dalla sua scheda.
  private async setAgreement(contract: Contract, agreementId: number | null, userId: number): Promise<void> {
    const previous = contract.consip_agreement_id ?? null;
    if (previous === agreementId) return;
    contract.consip_agreement_id = agreementId as number;
    contract.updated_by_user_id = userId;
    await this.contractRepo.save(contract);
    try {
      await this.auditLogService?.record({
        entityName: 'contract',
        entityId: contract.id,
        action: AuditAction.UPDATE,
        userId,
        fields: [{ fieldName: 'consip_agreement_id', oldValue: previous, newValue: agreementId }],
      });
    } catch (error) {
      console.error('[ConsipAgreementService] Errore durante la registrazione audit del contratto', error);
    }
  }

  async findAll(filters?: SearchConsipAgreementDto): Promise<ConsipAgreement[]> {
    const alias = this.entityName;
    const qb = this.repo.createQueryBuilder(alias);
    qb.where(`${alias}.deleted = :deleted`, { deleted: filters?.deleted ?? false });
    qb.leftJoinAndSelect(`${alias}.supplier`, 'supplier');

    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (key === 'deleted' || value === undefined || value === null || value === '') return;

        if (key === 'expiration_date_range') {
          const range = value as string[];
          if (range[0]) {
            qb.andWhere(`${alias}.expiration_date >= :expiration_date_start`, {
              expiration_date_start: DateHelper.dateOnly(range[0]),
            });
          }
          if (range[1]) {
            qb.andWhere(`${alias}.expiration_date <= :expiration_date_end`, {
              expiration_date_end: DateHelper.dateOnly(range[1]),
            });
          }
        } else if (key === 'name' || key === 'description' || key === 'cig_master') {
          qb.andWhere(`${alias}.${key} LIKE :${key}`, { [key]: `%${value}%` });
        } else {
          qb.andWhere(`${alias}.${key} = :${key}`, { [key]: value });
        }
      });
    }
    return qb.orderBy(`${alias}.id`, 'ASC').getMany();
  }
}
