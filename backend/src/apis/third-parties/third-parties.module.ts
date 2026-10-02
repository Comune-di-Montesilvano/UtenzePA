import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThirdParty } from './entity/third-party.entity';
import { ThirdPartiesService } from './third-parties.service';
import { ThirdPartiesController } from './third-parties.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ThirdParty])],
  providers: [ThirdPartiesService],
  controllers: [ThirdPartiesController],
  exports: [ThirdPartiesService],
})
export class ThirdPartiesModule {}
