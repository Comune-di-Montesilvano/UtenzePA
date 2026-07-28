import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UtilitiesService } from './utility.service';
import { UtilitiesController } from './utility.controller';
import { Utility } from './entity/utility.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Utility])],
  providers: [UtilitiesService],
  controllers: [UtilitiesController],
  exports: [UtilitiesService],
})
export class UtilitiesModule {}
