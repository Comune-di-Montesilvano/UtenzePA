import { PartialType } from '@nestjs/swagger';
import { CreateActDto } from './create-act.dto';

// Collegamenti: campo assente = invariati, presente = sostituiti.
export class UpdateActDto extends PartialType(CreateActDto) {}
