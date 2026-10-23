import { PartialType } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional } from 'class-validator';
import { CreateBudgetCommitmentDto } from './create-budget-commitment.dto';

export class UpdateBudgetCommitmentDto extends PartialType(CreateBudgetCommitmentDto) {
  // Solo false: ripristino dall'elenco (AbstractService.restore).
  @IsOptional()
  @IsBoolean()
  deleted?: boolean;

  // Inviato dal frontend; l'autore è l'utente del token.
  @IsOptional()
  @IsInt()
  updated_by_user_id?: number;
}
