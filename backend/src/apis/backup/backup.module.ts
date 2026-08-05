import { Module } from '@nestjs/common';
import { BackupController } from './backup.controller';
import { BackupService } from './backup.service';
import { ChunkedUploadModule } from '@common/chunked-upload/chunked-upload.module';
import { AuthMysqlModule } from '@apis/auth/auth.module';

@Module({
  imports: [ChunkedUploadModule, AuthMysqlModule],
  controllers: [BackupController],
  providers: [BackupService],
})
export class BackupModule {}
