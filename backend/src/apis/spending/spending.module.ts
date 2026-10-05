import { Module } from '@nestjs/common';
import { SpendingService } from './spending.service';
import { SpendingController } from './spending.controller';

@Module({ providers: [SpendingService], controllers: [SpendingController] })
export class SpendingModule {}
