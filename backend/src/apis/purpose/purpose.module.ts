import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PurposeController } from '@apis/purpose/purpose.controller';
import { Purpose } from '@apis/purpose/entity/purpose.entity';
import { PurposeService } from '@apis/purpose/purpose.service';
import { UtilityTypePurpose } from '@apis/utility-types/entity/utility_type_purpose.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Purpose, UtilityTypePurpose])],
  providers: [PurposeService],
  controllers: [PurposeController],
  exports: [PurposeService],
})
export class PurposeModule {}
