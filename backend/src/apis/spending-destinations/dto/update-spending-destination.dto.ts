import { PartialType } from '@nestjs/swagger';
import { CreateSpendingDestinationDto } from './create-spending-destination.dto';

export class UpdateSpendingDestinationDto extends PartialType(CreateSpendingDestinationDto) {}
