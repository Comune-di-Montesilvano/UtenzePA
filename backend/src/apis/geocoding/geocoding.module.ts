import { Module, OnModuleInit, Logger } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Repository, IsNull, Not } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Asset } from '@apis/asset/entity/asset.entity';
import { GeocodingService } from './geocoding.service';

@Module({
  imports: [TypeOrmModule.forFeature([Asset])],
  providers: [GeocodingService],
  exports: [GeocodingService],
})
export class GeocodingModule implements OnModuleInit {
  private readonly logger = new Logger(GeocodingModule.name);

  constructor(
    @InjectRepository(Asset) private readonly assetRepo: Repository<Asset>,
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
  }
}
