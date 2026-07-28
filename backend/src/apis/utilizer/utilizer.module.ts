import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersController } from './utilizer.controller';
import { Utilizer } from './entity/utilizer.entity';
import { UtilizerService } from '@apis/utilizer/utilizer.service';

@Module({
  imports: [TypeOrmModule.forFeature([Utilizer])],
  providers: [UtilizerService],
  controllers: [UsersController],
  exports: [UtilizerService],
})
export class UtilizerModule {}
