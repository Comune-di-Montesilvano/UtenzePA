import { Module } from '@nestjs/common';
import { ImportController } from './import.controller';
import { ImportService } from './import.service';
import { ChunkedUploadModule } from '@common/chunked-upload/chunked-upload.module';
import { DataImporterModule } from '@/data-importer/data-importer.module';

@Module({
  imports: [ChunkedUploadModule, DataImporterModule],
  controllers: [ImportController],
  providers: [ImportService],
})
export class ImportModule {}
