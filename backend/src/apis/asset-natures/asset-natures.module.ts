import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Asset } from '@apis/asset/entity/asset.entity';
import { AssetFunction } from '@apis/asset-functions/entity/asset-function.entity';
import { AssetNature } from './entity/asset-nature.entity';
import { AssetNaturesService } from './asset-natures.service';
import { AssetNaturesController } from './asset-natures.controller';

@Module({
  imports: [TypeOrmModule.forFeature([AssetNature, AssetFunction, Asset])],
  providers: [AssetNaturesService],
  controllers: [AssetNaturesController],
  exports: [AssetNaturesService],
})
export class AssetNaturesModule {}
