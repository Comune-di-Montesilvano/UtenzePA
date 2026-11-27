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
import { DestinationUsage, SpendingDestinationsService } from './spending-destinations.service';
import { SpendingDestination } from './entity/spending-destination.entity';
import { CreateSpendingDestinationDto } from './dto/create-spending-destination.dto';
import { UpdateSpendingDestinationDto } from './dto/update-spending-destination.dto';

@Controller('spending-destinations')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SpendingDestinationsController {
  constructor(private readonly service: SpendingDestinationsService) {}

  @Get()
  list(): Promise<(SpendingDestination & DestinationUsage)[]> {
    return this.service.findAll();
  }

  @Roles('Admin')
  @Post()
  create(
    @Body() dto: CreateSpendingDestinationDto,
    @CurrentUser() user: ICurrentUser,
  ): Promise<SpendingDestination> {
    return this.service.create(dto, user.id);
  }

  @Roles('Admin')
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSpendingDestinationDto,
    @CurrentUser() user: ICurrentUser,
  ): Promise<SpendingDestination> {
    return this.service.update(id, dto, user.id);
  }

  @Roles('Admin')
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: ICurrentUser): Promise<void> {
    return this.service.remove(id, user.id);
  }
}
