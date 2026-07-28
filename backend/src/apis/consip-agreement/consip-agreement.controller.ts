import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ConsipAgreementService } from '@apis/consip-agreement/consip-agreement.service';
import { ConsipAgreement } from '@apis/consip-agreement/entity/consip-agreement.entity';
import { Roles } from '@core/auth/decorators/roles.decorator';
import { CurrentUser, ICurrentUser } from '@/core/auth/decorators/current-user.decorator';
import { CreateConsipAgreementDto } from '@apis/consip-agreement/dto/create-consip-agreement.dto';
import { UpdateConsipAgreementDto } from '@apis/consip-agreement/dto/update-consip-agreement.dto';
import { SearchConsipAgreementDto } from '@apis/consip-agreement/dto/search-consip-agreement.dto';
import { JwtAuthGuard } from '@/core/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/core/auth/guards/roles.guard';

@Controller('consip-agreement')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ConsipAgreementController {
  constructor(private readonly service: ConsipAgreementService) {}

  @Get()
  getAll(@Query() filters: SearchConsipAgreementDto): Promise<ConsipAgreement[]> {
    return this.service.findAll(filters);
  }

  @Get(':id')
  getOne(@Param('id', ParseIntPipe) id: number): Promise<ConsipAgreement> {
    return this.service.findOne(id);
  }

  @Roles('Admin', 'Operatore')
  @Post()
  create(
    @Body() dto: CreateConsipAgreementDto,
    @CurrentUser() user: ICurrentUser,
  ): Promise<ConsipAgreement> {
    return this.service.create(dto, user.id);
  }

  @Roles('Admin', 'Operatore')
  @Patch(':id')
  update(
    @Param('id') id: number,
    @Body() dto: UpdateConsipAgreementDto,
    @CurrentUser() user: ICurrentUser,
  ): Promise<ConsipAgreement> {
    return this.service.update(id, dto, user.id);
  }

  @Roles('Admin', 'Operatore')
  @Delete(':id')
  remove(@Param('id') id: number, @Body() dto: UpdateConsipAgreementDto): Promise<void> {
    return this.service.remove(id, dto.updated_by_user_id);
  }
}
