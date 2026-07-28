import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SystemUsersService } from './system-users.service';
import { SystemUser } from './entity/system-user.entity';
import { JwtAuthGuard } from '@/core/auth/guards/jwt-auth.guard';
import { CreateSystemUserDto } from './dto/create-system-user.dto';
import { UpdateSystemUserDto } from './dto/update-system-user.dto';
import { RolesGuard } from '@/core/auth/guards/roles.guard';
import { Roles } from '@/core/auth/decorators/roles.decorator';
import { CurrentUser, ICurrentUser } from '@core/auth/decorators/current-user.decorator';

@Controller('system-users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SystemUsersController {
  constructor(private readonly usersService: SystemUsersService) {}

  @Get()
  getAll(@Query() filters: any): Promise<SystemUser[]> {
    return this.usersService.findAll(filters);
  }

  @Roles('Admin')
  @Post()
  create(
    @Body() createUserDto: CreateSystemUserDto,
    @CurrentUser() user: ICurrentUser,
  ): Promise<SystemUser> {
    return this.usersService.create(createUserDto, user.id);
  }

  @Roles('Admin')
  @Patch(':id')
  update(
    @Param('id') id: number,
    @Body() updateUserDto: UpdateSystemUserDto,
    @CurrentUser() user: ICurrentUser,
  ): Promise<SystemUser> {
    return this.usersService.update(id, updateUserDto, user.id);
  }

  @Roles('Admin')
  @Delete(':id')
  remove(@Param('id') id: number, @CurrentUser() user: ICurrentUser): Promise<void> {
    return this.usersService.remove(id, user.id);
  }
}
