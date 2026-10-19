import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UtilizerGrantService } from './utilizer-grant.service';
import { UtilizerGrantController } from './utilizer-grant.controller';
import { UtilizerGrant } from './entity/utilizer-grant.entity';
import { Asset } from '@apis/asset/entity/asset.entity';
import { ThirdParty } from '@apis/third-parties/entity/third-party.entity';
import { UtilitySupplyModule } from '@apis/utility-supply/utility-supply.module';

@Module({
  imports: [TypeOrmModule.forFeature([UtilizerGrant, Asset, ThirdParty]), UtilitySupplyModule],
  providers: [UtilizerGrantService],
  controllers: [UtilizerGrantController],
  exports: [UtilizerGrantService],
})
export class UtilizerGrantModule {}
