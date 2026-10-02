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
import { ContractsService } from '@apis/contracts/contracts.service';
import { Contract } from '@apis/contracts/entity/contract.entity';
import { Roles } from '@core/auth/decorators/roles.decorator';
import { CurrentUser, ICurrentUser } from '@/core/auth/decorators/current-user.decorator';
import { CreateContractDto } from '@apis/contracts/dto/create-contract.dto';
import { UpdateContractDto } from '@apis/contracts/dto/update-contract.dto';
import { SearchContractDto } from '@apis/contracts/dto/search-contract.dto';
import { JwtAuthGuard } from '@/core/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/core/auth/guards/roles.guard';
import { maskSupplierOf } from '@apis/third-parties/third-party.privacy';

@Controller('contracts')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ContractsController {
  constructor(private readonly service: ContractsService) {}

  @Get()
  // Fornitore persona fisica: CF e telefono oscurati per il Lettore.
  async getAll(
    @Query() filters: SearchContractDto,
    @CurrentUser() user: ICurrentUser,
  ): Promise<Contract[]> {
    return (await this.service.findAll(filters)).map((c) => maskSupplierOf(c, user?.role));
  }

  @Get(':id')
  async getOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: ICurrentUser,
  ): Promise<Contract> {
    return maskSupplierOf(await this.service.findOne(id), user?.role);
  }

  @Roles('Admin', 'Operatore')
  @Post()
  create(
    @Body() dto: CreateContractDto,
    @CurrentUser() user: ICurrentUser,
  ): Promise<Contract> {
    return this.service.create(dto, user.id);
  }

  @Roles('Admin', 'Operatore')
  @Patch(':id')
  update(
    @Param('id') id: number,
    @Body() dto: UpdateContractDto,
    @CurrentUser() user: ICurrentUser,
  ): Promise<Contract> {
    return this.service.update(id, dto, user.id);
  }

  @Roles('Admin', 'Operatore')
  @Delete(':id')
  remove(@Param('id') id: number, @Body() dto: UpdateContractDto): Promise<void> {
    return this.service.remove(id, dto.updated_by_user_id);
  }
}
