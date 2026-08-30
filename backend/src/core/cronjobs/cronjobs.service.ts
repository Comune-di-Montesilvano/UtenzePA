import { Injectable } from '@nestjs/common';

@Injectable()
export class CronjobsService {
  async handleCron() {
    console.log('[DEV-CRONJOB] started at:', new Date());
  }
}
