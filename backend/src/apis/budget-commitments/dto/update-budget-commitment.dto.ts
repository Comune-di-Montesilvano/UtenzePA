import { PartialType } from '@nestjs/swagger';
import { CreateBudgetCommitmentDto } from './create-budget-commitment.dto';

export class UpdateBudgetCommitmentDto extends PartialType(CreateBudgetCommitmentDto) {}
