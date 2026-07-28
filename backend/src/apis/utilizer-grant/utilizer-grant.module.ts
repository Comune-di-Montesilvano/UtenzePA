import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UtilizerGrantService } from './utilizer-grant.service';
import { UtilizerGrantController } from './utilizer-grant.controller';
import { UtilizerGrant } from './entity/utilizer-grant.entity';

@Module({
  imports: [TypeOrmModule.forFeature([UtilizerGrant])],
  providers: [UtilizerGrantService],
  controllers: [UtilizerGrantController],
  exports: [UtilizerGrantService],
})
export class UtilizerGrantModule {}
