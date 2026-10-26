import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '@/core/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/core/auth/guards/roles.guard';
import { Roles } from '@/core/auth/decorators/roles.decorator';
import { CurrentUser, ICurrentUser } from '@/core/auth/decorators/current-user.decorator';
import { BudgetCommitmentsService, CommitmentInvoice, CommitmentRow } from './budget-commitments.service';
import { CreateBudgetCommitmentDto } from './dto/create-budget-commitment.dto';
import { UpdateBudgetCommitmentDto } from './dto/update-budget-commitment.dto';
import { SearchBudgetCommitmentDto } from './dto/search-budget-commitment.dto';

// Impegni: elenco e scheda su commitments; contracts/:contractId/commitments
// resta come scorciatoia (tab Impegni del contratto, "Nuovo impegno" in fattura).
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class BudgetCommitmentsController {
  constructor(private readonly service: BudgetCommitmentsService) {}

  @Get('commitments')
  list(@Query() search: SearchBudgetCommitmentDto): Promise<CommitmentRow[]> {
    return this.service.listRows(search);
  }

  @Get('commitments/:id')
  get(@Param('id', ParseIntPipe) id: number): Promise<CommitmentRow> {
    return this.service.getRow(id);
  }

  @Get('commitments/:id/invoices')
  invoices(@Param('id', ParseIntPipe) id: number): Promise<CommitmentInvoice[]> {
    return this.service.invoices(id);
  }

  @Get('contracts/:contractId/commitments')
  byContract(@Param('contractId', ParseIntPipe) contractId: number): Promise<CommitmentRow[]> {
    return this.service.listRows({ contract_id: contractId });
  }

  @Roles('Admin', 'Operatore')
  @Post('commitments')
  async create(
    @Body() dto: CreateBudgetCommitmentDto,
    @CurrentUser() user: ICurrentUser,
  ): Promise<CommitmentRow> {
    const saved = await this.service.create(dto, user.id);
    return this.service.getRow(saved.id);
  }

  @Roles('Admin', 'Operatore')
  @Post('contracts/:contractId/commitments')
  createForContract(
    @Param('contractId', ParseIntPipe) contractId: number,
    @Body() dto: CreateBudgetCommitmentDto,
    @CurrentUser() user: ICurrentUser,
  ): Promise<CommitmentRow> {
    return this.service.createForContract(contractId, dto, user.id);
  }

  @Roles('Admin', 'Operatore')
  @Patch('commitments/:id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateBudgetCommitmentDto,
    @CurrentUser() user: ICurrentUser,
  ): Promise<CommitmentRow> {
    await this.service.update(id, dto, user.id);
    return this.service.getRow(id);
  }

  @Roles('Admin', 'Operatore')
  @Delete('commitments/:id')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: ICurrentUser): Promise<void> {
    return this.service.remove(id, user.id);
  }
}
