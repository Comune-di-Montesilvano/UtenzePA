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
import { BackupService, BackupInfo, BackupJobStatus } from './backup.service';
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

  // In background: la risposta arriva subito, l'esito si legge da GET status.
  @Post()
  create(@Body() dto: CreateBackupDto): BackupJobStatus {
    return this.service.startCreate(dto.includePhotos ?? false, dto.includeAttachments ?? false);
  }

  @Get('status')
  status(): BackupJobStatus {
    return this.service.status();
  }

  @Get()
  list(): Promise<BackupInfo[]> {
    return this.service.listBackups();
  }

  // Link monouso per il download diretto dal browser (vedi BackupDownloadController).
  @Post(':filename/download-link')
  downloadLink(@Param('filename') filename: string): { ticket: string } {
    return { ticket: this.service.createDownloadTicket(filename) };
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
    const maxSizeBytes = parseInt(process.env.BACKUP_MAX_SIZE_MB ?? '20480', 10) * 1024 * 1024;
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

  /**
   * Avvia il ripristino in background e risponde subito: da qui l'app è in
   * manutenzione (pagina di cortesia per tutti) fino alla fine.
   */
  @Post('restore/finalize')
  async restoreFinalize(
    @Body() dto: RestoreFinalizeDto,
    @CurrentUser() user: ICurrentUser,
  ): Promise<{ started: boolean }> {
    const validUser = await this.authService.validateUser(user.email, dto.password);
    if (!validUser) {
      throw new BadRequestException('Password non corretta');
    }
    if (!this.chunkedUpload.isComplete(dto.uploadId, dto.totalChunks, this.tmpDir)) {
      throw new BadRequestException('Caricamento del file incompleto: riprovare.');
    }

    const isArchive = dto.originalFilename?.endsWith('.tar.gz') ?? false;
    const excludeTables: string[] = [
      ...(dto.excludeUsers ? ['system_users'] : []),
      ...(dto.excludeBranding ? ['app_settings'] : []),
    ];
    void this.service.startRestore(
      () =>
        this.chunkedUpload.assemble(
          dto.uploadId,
          dto.totalChunks,
          this.tmpDir,
          `${dto.uploadId}${isArchive ? '.tar.gz' : '.sql'}`,
        ),
      excludeTables,
    );
    return { started: true };
  }
}

/**
 * Download di un backup da link monouso (POST backup/:filename/download-link,
 * solo Admin): il browser scarica direttamente in streaming, senza passare il
 * file da HttpClient (un backup da GB finirebbe tutto in memoria). Senza
 * guard JWT: un link del browser non porta l'header Authorization; vale il
 * ticket, casuale, monouso e valido un minuto.
 */
@Controller('backup-download')
export class BackupDownloadController {
  constructor(private readonly service: BackupService) {}

  @Get(':ticket')
  download(
    @Param('ticket') ticket: string,
    @Res({ passthrough: true }) res: Response,
  ): StreamableFile {
    const filename = this.service.redeemDownloadTicket(ticket);
    const filePath = this.service.getBackupPath(filename);
    const stat = fs.statSync(filePath);
    res.set({
      'Content-Type': filename.endsWith('.tar.gz') ? 'application/gzip' : 'application/sql',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(stat.size),
    });
    return new StreamableFile(fs.createReadStream(filePath));
  }
}
