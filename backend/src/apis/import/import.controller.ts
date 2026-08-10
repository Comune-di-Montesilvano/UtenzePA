import {
  Controller,
  Post,
  Param,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import * as fs from 'fs';
import * as path from 'path';
import { ImportService } from './import.service';
import { ChunkedUploadService } from '@common/chunked-upload/chunked-upload.service';
import { ImportEntityType } from './entity-type.enum';
import { JwtAuthGuard } from '@core/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@core/auth/guards/roles.guard';
import { Roles } from '@core/auth/decorators/roles.decorator';
import { UploadChunkDto } from '@apis/backup/dto/upload-chunk.dto';
import { ImportFinalizeDto } from './dto/import-finalize.dto';

@Controller('import')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('Admin')
export class ImportController {
  private readonly tmpDir = path.join(process.cwd(), 'import-tmp');

  constructor(
    private readonly importService: ImportService,
    private readonly chunkedUpload: ChunkedUploadService,
  ) {}

  private resolveEntityType(entityType: string): ImportEntityType {
    const valid = Object.values(ImportEntityType) as string[];
    if (!valid.includes(entityType)) {
      throw new BadRequestException(`Tipo entità non valido: ${entityType}`);
    }
    return entityType as ImportEntityType;
  }

  @Post(':entityType/chunk')
  @UseInterceptors(FileInterceptor('chunk'))
  async chunk(
    @Param('entityType') entityType: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadChunkDto,
  ): Promise<{ received: boolean }> {
    this.resolveEntityType(entityType);
    const maxSizeBytes = (parseInt(process.env.IMPORT_MAX_SIZE_MB ?? '50', 10)) * 1024 * 1024;
    this.chunkedUpload.saveChunk(
      dto.uploadId,
      dto.chunkIndex,
      dto.totalChunks,
      file.buffer,
      this.tmpDir,
      maxSizeBytes,
    );
    return { received: true };
  }

  @Post(':entityType/finalize')
  async finalize(
    @Param('entityType') entityType: string,
    @Body() dto: ImportFinalizeDto,
  ): Promise<Record<string, unknown>> {
    const type = this.resolveEntityType(entityType);
    const filePath = this.chunkedUpload.assemble(dto.uploadId, dto.totalChunks, this.tmpDir, `${dto.uploadId}.csv`);
    try {
      return await this.importService.importFromFile(type, filePath);
    } finally {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
  }
}
