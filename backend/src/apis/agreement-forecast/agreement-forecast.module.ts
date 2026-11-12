import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgreementForecastController } from './agreement-forecast.controller';
import { AgreementForecastService } from './agreement-forecast.service';
import { ConsipAgreementForecast } from './entity/agreement-forecast.entity';
import { ConsipAgreementPrice } from './entity/agreement-price.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ConsipAgreementForecast, ConsipAgreementPrice])],
  providers: [AgreementForecastService],
  controllers: [AgreementForecastController],
  exports: [AgreementForecastService],
})
export class AgreementForecastModule {}
