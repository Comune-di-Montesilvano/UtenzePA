import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateSupplyEventDto } from './create-supply-event.dto';

// L'utenza di una riga non cambia.
export class UpdateSupplyEventDto extends PartialType(
  OmitType(CreateSupplyEventDto, ['utility_id_fk'] as const),
) {}
