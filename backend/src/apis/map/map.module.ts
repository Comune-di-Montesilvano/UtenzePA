import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Asset } from '@apis/asset/entity/asset.entity';
import { Utility } from '@apis/utility/entity/utility.entity';
import { GeocodingModule } from '@apis/geocoding/geocoding.module';
import { MapService } from './map.service';
import { MapController } from './map.controller';

@Module({
  // GeocodingModule esporta GeocodingService — riusato dall'endpoint
  // /map/geocode (ricerca libera indirizzo) invece di duplicare il client
  // Nominatim/throttle/backoff qui.
  imports: [TypeOrmModule.forFeature([Asset, Utility]), GeocodingModule],
  providers: [MapService],
  controllers: [MapController],
})
export class MapModule {}
