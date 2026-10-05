import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BaseService } from '@apis/shared/base.service';
import { AuditAction } from '@apis/audit-log/entity/audit-log.entity';
import { Contract } from '@apis/contracts/entity/contract.entity';
import { BudgetChapter } from '@apis/budget-chapters/entity/budgetChapter.entity';
import { InvoiceLine } from '@apis/invoices/entity/invoice-line.entity';
import { BudgetCommitment } from './entity/budget-commitment.entity';
import { CreateBudgetCommitmentDto } from './dto/create-budget-commitment.dto';
import { UpdateBudgetCommitmentDto } from './dto/update-budget-commitment.dto';

const toNumber = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

@Injectable()
export class BudgetCommitmentsService extends BaseService<
  BudgetCommitment,
  CreateBudgetCommitmentDto,
  UpdateBudgetCommitmentDto
> {
  protected readonly entityName = 'budget_commitments';
  protected readonly relations = ['budgetChapter', 'created_by', 'updated_by'];

  constructor(
    @InjectRepository(BudgetCommitment)
    protected readonly repo: Repository<BudgetCommitment>,
    @InjectRepository(Contract)
    private readonly contractRepo: Repository<Contract>,
    @InjectRepository(BudgetChapter)
    private readonly chapterRepo: Repository<BudgetChapter>,
    @InjectRepository(InvoiceLine)
    private readonly lineRepo: Repository<InvoiceLine>,
  ) {
    super();
  }

  async findByContract(contractId: number): Promise<BudgetCommitment[]> {
    const rows = await this.repo.find({
      where: { contract_id_fk: contractId, deleted: false },
      relations: { budgetChapter: true },
    });
    return rows
      .map((r) => ({ ...r, amount: toNumber(r.amount) }))
      .sort(
        (a, b) => b.fiscal_year - a.fiscal_year || a.budget_chapter_id_fk - b.budget_chapter_id_fk,
      );
  }

  async createForContract(
    contractId: number,
    dto: CreateBudgetCommitmentDto,
    userId: number,
  ): Promise<BudgetCommitment> {
    const contract = await this.contractRepo.findOne({ where: { id: contractId, deleted: false } });
    if (!contract) throw new BadRequestException('Contratto non trovato');
    await this.ensureChapter(dto.budget_chapter_id_fk);
    await this.ensureFree(contractId, dto.budget_chapter_id_fk, dto.fiscal_year);
    return super.create({ ...dto, contract_id_fk: contractId } as never, userId);
  }

  async update(
    id: number,
    dto: UpdateBudgetCommitmentDto,
    userId?: number,
  ): Promise<BudgetCommitment> {
    const current = await this.repo.findOne({ where: { id, deleted: false } });
    if (!current) throw new BadRequestException('Impegno non trovato');
    const chapterId = dto.budget_chapter_id_fk ?? current.budget_chapter_id_fk;
    const year = dto.fiscal_year ?? current.fiscal_year;
    if (dto.budget_chapter_id_fk !== undefined) await this.ensureChapter(chapterId);
    await this.ensureFree(current.contract_id_fk, chapterId, year, id);
    return super.update(id, dto, userId);
  }

  // Un impegno usato da righe fattura non si elimina: sparirebbe il capitolo
  // di quelle righe.
  async remove(id: number, userId: number): Promise<void> {
    const current = await this.repo.findOne({ where: { id, deleted: false } });
    if (!current) throw new BadRequestException('Impegno non trovato');
    const used = await this.lineRepo.count({ where: { commitment_id_fk: id } });
    if (used > 0) throw new BadRequestException(`Impegno usato da ${used} righe fattura`);
    current.deleted = true;
    current.updated_by_user_id = userId;
    await this.repo.save(current);
    await this.recordAudit(AuditAction.DELETE, id, userId, []);
  }

  private async ensureChapter(chapterId: number): Promise<void> {
    const chapter = await this.chapterRepo.findOne({ where: { id: chapterId, deleted: false } });
    if (!chapter) throw new BadRequestException('Capitolo non trovato');
  }

  // Unico per contratto + capitolo + esercizio tra le righe non cancellate
  // (nel service, non UNIQUE: le cancellate restano nel DB).
  private async ensureFree(
    contractId: number,
    chapterId: number,
    year: number,
    exceptId?: number,
  ): Promise<void> {
    const rows = await this.repo.find({ where: { contract_id_fk: contractId, deleted: false } });
    if (
      rows.some(
        (r) => r.budget_chapter_id_fk === chapterId && r.fiscal_year === year && r.id !== exceptId,
      )
    ) {
      throw new BadRequestException('Impegno già presente per questo capitolo ed esercizio');
    }
  }
}
