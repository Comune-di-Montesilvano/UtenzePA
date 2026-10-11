import { PartialType } from '@nestjs/swagger';
import { CreateComplexDto } from './create-complex.dto';

export class UpdateComplexDto extends PartialType(CreateComplexDto) {}
