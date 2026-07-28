import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SystemUser } from './entity/system-user.entity';
import { SystemUsersService } from './system-users.service';
import { SystemUsersController } from './system-users.controller';
@Module({
  imports: [TypeOrmModule.forFeature([SystemUser])],
  providers: [SystemUsersService],
  controllers: [SystemUsersController],
  exports: [SystemUsersService],
})
export class SystemUsersModule {}
