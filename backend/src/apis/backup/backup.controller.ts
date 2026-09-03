import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Res,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  StreamableFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { BackupService, BackupInfo } from './backup.service';
import { ChunkedUploadService } from '@common/chunked-upload/chunked-upload.service';
import { AuthService } from '@apis/auth/auth.service';
import { JwtAuthGuard } from '@core/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@core/auth/guards/roles.guard';
import { Roles } from '@core/auth/decorators/roles.decorator';
import { CurrentUser, ICurrentUser } from '@core/auth/decorators/current-user.decorator';
import { UploadChunkDto } from '@common/chunked-upload/dto/upload-chunk.dto';
import { RestoreFinalizeDto } from './dto/restore-finalize.dto';
import { CreateBackupDto } from './dto/create-backup.dto';

@Controller('backup')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('Admin')
export class BackupController {
  private readonly tmpDir = path.join(process.cwd(), 'backups', 'tmp');

  constructor(
    private readonly service: BackupService,
    private readonly chunkedUpload: ChunkedUploadService,
    private readonly authService: AuthService,
  ) {}

  @Post()
  create(@Body() dto: CreateBackupDto): Promise<BackupInfo> {
    return this.service.createBackup(dto.includePhotos ?? false);
  }

  @Get()
  list(): Promise<BackupInfo[]> {
    return this.service.listBackups();
  }

  @Get(':filename/download')
  download(
    @Param('filename') filename: string,
    @Res({ passthrough: true }) res: Response,
  ): StreamableFile {
    const filePath = this.service.getBackupPath(filename);
    res.set({
      'Content-Type': filename.endsWith('.tar.gz') ? 'application/gzip' : 'application/sql',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    return new StreamableFile(fs.createReadStream(filePath));
  }

  @Delete(':filename')
  remove(@Param('filename') filename: string): Promise<void> {
    return this.service.deleteBackup(filename);
  }

  @Post('restore/chunk')
  @UseInterceptors(FileInterceptor('chunk'))
  async restoreChunk(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadChunkDto,
  ): Promise<{ received: boolean }> {
    const maxSizeBytes = parseInt(process.env.BACKUP_MAX_SIZE_MB ?? '500', 10) * 1024 * 1024;
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

  @Post('restore/finalize')
  async restoreFinalize(
    @Body() dto: RestoreFinalizeDto,
    @CurrentUser() user: ICurrentUser,
  ): Promise<{ restored: boolean }> {
    const validUser = await this.authService.validateUser(user.email, dto.password);
    if (!validUser) {
      throw new BadRequestException('Password non corretta');
    }

    const isArchive = dto.originalFilename?.endsWith('.tar.gz') ?? false;
    const filePath = this.chunkedUpload.assemble(
      dto.uploadId,
      dto.totalChunks,
      this.tmpDir,
      `${dto.uploadId}${isArchive ? '.tar.gz' : '.sql'}`,
    );
    const excludeTables: string[] = [
      ...(dto.excludeUsers ? ['system_users'] : []),
      ...(dto.excludeBranding ? ['app_settings'] : []),
    ];
    try {
      await this.service.restoreFromFile(filePath, excludeTables);
    } finally {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    return { restored: true };
  }
}
