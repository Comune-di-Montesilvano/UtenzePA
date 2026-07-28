import { Module, Global } from '@nestjs/common';
import { InfisicalConfigService } from './infisical-config.service';

@Global()
@Module({
  providers: [InfisicalConfigService],
  exports: [InfisicalConfigService],
})
export class InfisicalModule {}
