import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '@/core/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/core/auth/guards/roles.guard';
import { Roles } from '@/core/auth/decorators/roles.decorator';
import { CurrentUser, ICurrentUser } from '@/core/auth/decorators/current-user.decorator';
import { BudgetCommitmentsService } from './budget-commitments.service';
import { BudgetCommitment } from './entity/budget-commitment.entity';
import { CreateBudgetCommitmentDto } from './dto/create-budget-commitment.dto';
import { UpdateBudgetCommitmentDto } from './dto/update-budget-commitment.dto';

// Annidati sotto contracts/:contractId (lista/creazione), diretti su
// commitments/:id (modifica/eliminazione), come la spesa storica dei capitoli.
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class BudgetCommitmentsController {
  constructor(private readonly service: BudgetCommitmentsService) {}

  @Get('contracts/:contractId/commitments')
  list(@Param('contractId', ParseIntPipe) contractId: number): Promise<BudgetCommitment[]> {
    return this.service.findByContract(contractId);
  }

  @Roles('Admin', 'Operatore')
  @Post('contracts/:contractId/commitments')
  create(
    @Param('contractId', ParseIntPipe) contractId: number,
    @Body() dto: CreateBudgetCommitmentDto,
    @CurrentUser() user: ICurrentUser,
  ): Promise<BudgetCommitment> {
    return this.service.createForContract(contractId, dto, user.id);
  }

  @Roles('Admin', 'Operatore')
  @Patch('commitments/:id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateBudgetCommitmentDto,
    @CurrentUser() user: ICurrentUser,
  ): Promise<BudgetCommitment> {
    return this.service.update(id, dto, user.id);
  }

  @Roles('Admin', 'Operatore')
  @Delete('commitments/:id')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: ICurrentUser): Promise<void> {
    return this.service.remove(id, user.id);
  }
}
