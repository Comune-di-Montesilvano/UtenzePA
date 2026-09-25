import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Asset } from '@apis/asset/entity/asset.entity';
import { AssetFunction } from './entity/asset-function.entity';
import { AssetFunctionsService } from './asset-functions.service';
import { AssetFunctionsController } from './asset-functions.controller';

@Module({
  imports: [TypeOrmModule.forFeature([AssetFunction, Asset])],
  providers: [AssetFunctionsService],
  controllers: [AssetFunctionsController],
  exports: [AssetFunctionsService],
})
export class AssetFunctionsModule {}
