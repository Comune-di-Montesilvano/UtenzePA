import { Module } from '@nestjs/common';
import { ChunkedUploadService } from './chunked-upload.service';

@Module({
  providers: [ChunkedUploadService],
  exports: [ChunkedUploadService],
})
export class ChunkedUploadModule {}
