import { Module, OnModuleInit, Logger } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Repository, IsNull, Not } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Asset } from '@apis/asset/entity/asset.entity';
import { Plant } from '@apis/plants/entity/plant.entity';
import { PLANTS_MUNICIPALITY } from '@apis/plants/plant.calc';
import { GeocodingService } from './geocoding.service';

@Module({
  imports: [TypeOrmModule.forFeature([Asset, Plant])],
  providers: [GeocodingService],
  exports: [GeocodingService],
})
export class GeocodingModule implements OnModuleInit {
  private readonly logger = new Logger(GeocodingModule.name);

  constructor(
    @InjectRepository(Asset) private readonly assetRepo: Repository<Asset>,
    @InjectRepository(Plant) private readonly plantRepo: Repository<Plant>,
    private readonly geocodingService: GeocodingService,
  ) {}

  onModuleInit(): void {
    // Non await: lo scan gira in background e non deve ritardare il boot.
    this.runStartupScan().catch((error) =>
      this.logger.error(`Scan geocoding all'avvio fallito: ${error?.message ?? error}`),
    );
  }

  private async runStartupScan(): Promise<void> {
    const pending = await this.assetRepo.find({
      where: {
        latitude: IsNull(),
        geocoded_latitude: IsNull(),
        address: Not(IsNull()),
        deleted: false,
      },
    });

    if (pending.length === 0) {
      this.logger.log('Scan geocoding all\'avvio: nessun asset da geocodificare.');
      return;
    }

    this.logger.log(`Scan geocoding all'avvio: ${pending.length} asset da elaborare.`);
    let succeeded = 0;
    let failed = 0;

    for (const asset of pending) {
      const query = this.geocodingService.buildQuery(asset);
      if (!query) continue;

      const result = await this.geocodingService.geocode(query);
      if (result) {
        asset.geocoded_latitude = result.lat;
        asset.geocoded_longitude = result.lon;
        asset.geocoded_at = new Date();
        await this.assetRepo.save(asset);
        succeeded++;
      } else {
        failed++;
      }
    }

    this.logger.log(`Scan geocoding all'avvio completato: ${succeeded} ok, ${failed} falliti.`);
    await this.runPlantsScan();
  }

  // Impianti senza coordinate (manuali o geocodificate) con un indirizzo.
  // Non hanno CAP/comune propri: si usa il comune dell'ente.
  private async runPlantsScan(): Promise<void> {
    const pending = await this.plantRepo.find({
      where: {
        latitude: IsNull(),
        geocoded_latitude: IsNull(),
        address: Not(IsNull()),
        deleted: false,
      },
    });
    if (pending.length === 0) return;

    this.logger.log(`Scan geocoding all'avvio: ${pending.length} impianti da elaborare.`);
    let succeeded = 0;
    let failed = 0;
    for (const plant of pending) {
      const query = this.geocodingService.buildQuery({
        address: plant.address,
        civic_number: plant.civic_number,
        zip_code: null,
        municipality: PLANTS_MUNICIPALITY,
      });
      if (!query) continue;
      const result = await this.geocodingService.geocode(query);
      if (result) {
        plant.geocoded_latitude = result.lat;
        plant.geocoded_longitude = result.lon;
        plant.geocoded_at = new Date();
        await this.plantRepo.save(plant);
        succeeded++;
      } else {
        failed++;
      }
    }
    this.logger.log(`Scan geocoding impianti completato: ${succeeded} ok, ${failed} falliti.`);
  }
}
