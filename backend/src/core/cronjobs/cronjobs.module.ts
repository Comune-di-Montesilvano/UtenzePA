import { Module } from '@nestjs/common';
import { CronjobsService } from './cronjobs.service';

@Module({
  imports: [],
  providers: [CronjobsService],
})
export class CronjobsModule {}
