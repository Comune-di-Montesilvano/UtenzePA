import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActType } from '@apis/act-types/entity/act-type.entity';
import { Asset } from '@apis/asset/entity/asset.entity';
import { Plant } from '@apis/plants/entity/plant.entity';
import { UtilizerGrant } from '@apis/utilizer-grant/entity/utilizer-grant.entity';
import { Contract } from '@apis/contracts/entity/contract.entity';
import { AttachmentsModule } from '@apis/attachments/attachments.module';
import { Act } from './entity/act.entity';
import { ActsService } from './acts.service';
import { ActsController } from './acts.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Act, ActType, Asset, Plant, UtilizerGrant, Contract]),
    AttachmentsModule,
  ],
  controllers: [ActsController],
  providers: [ActsService],
})
export class ActsModule {}
