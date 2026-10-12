import { PartialType } from '@nestjs/swagger';
import { CreateActTypeDto } from './create-act-type.dto';

export class UpdateActTypeDto extends PartialType(CreateActTypeDto) {}
