import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AssetCadastralUnit } from './entity/asset-cadastral-unit.entity';
import { Asset } from './entity/asset.entity';
import { AssetsService } from './assets.service';
import { AssetsController } from './assets.controller';
import { GeocodingModule } from '@apis/geocoding/geocoding.module';
import { AssetNature } from '@apis/asset-natures/entity/asset-nature.entity';
import { Complex } from '@apis/complexes/entity/complex.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Asset, AssetCadastralUnit, AssetNature, Complex]),
    GeocodingModule,
  ],
  providers: [AssetsService],
  controllers: [AssetsController],
  exports: [AssetsService],
})
export class AssetsModule {}
