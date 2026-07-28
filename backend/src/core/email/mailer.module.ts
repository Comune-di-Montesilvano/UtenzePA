import { Module } from '@nestjs/common';
import { EMailerService } from './email.service';

@Module({
  providers: [EMailerService],
  exports: [EMailerService],
})
export class EMailerModule {}