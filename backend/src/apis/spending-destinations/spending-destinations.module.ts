import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SpendingDestination } from './entity/spending-destination.entity';
import { SpendingDestinationsService } from './spending-destinations.service';
import { SpendingDestinationsController } from './spending-destinations.controller';

@Module({
  imports: [TypeOrmModule.forFeature([SpendingDestination])],
  controllers: [SpendingDestinationsController],
  providers: [SpendingDestinationsService],
  exports: [SpendingDestinationsService],
})
export class SpendingDestinationsModule {}
