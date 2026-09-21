import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Asset } from './entity/asset.entity';
import { AssetsService } from './assets.service';
import { AssetsController } from './assets.controller';
import { GeocodingModule } from '@apis/geocoding/geocoding.module';
import { AssetAggregator } from '@apis/asset-aggregators/entity/asset-aggregator.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Asset, AssetAggregator]), GeocodingModule],
  providers: [AssetsService],
  controllers: [AssetsController],
  exports: [AssetsService],
})
export class AssetsModule {}
