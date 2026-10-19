import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, ValidateIf } from 'class-validator';
import { GrantUtilityDecisionValue } from '../enum/supply-event-type.enum';

export class SetDecisionDto {
  @IsEnum(GrantUtilityDecisionValue, { message: 'Decisione non valida.' })
  decision: GrantUtilityDecisionValue;

  // Parte a cui va l'utenza con FOLLOWS (obbligatoria se le parti sono più d'una).
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @Type(() => Number)
  @IsInt()
  third_party_id?: number | null;
}
