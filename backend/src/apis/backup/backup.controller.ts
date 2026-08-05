import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Res,
  UseGuards,
  StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
import * as fs from 'fs';
import { BackupService, BackupInfo } from './backup.service';
import { JwtAuthGuard } from '@core/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@core/auth/guards/roles.guard';
import { Roles } from '@core/auth/decorators/roles.decorator';

@Controller('backup')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('Admin')
export class BackupController {
  constructor(private readonly service: BackupService) {}

  @Post()
  create(): Promise<BackupInfo> {
    return this.service.createBackup();
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
      'Content-Type': 'application/sql',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    return new StreamableFile(fs.createReadStream(filePath));
  }

  @Delete(':filename')
  remove(@Param('filename') filename: string): Promise<void> {
    return this.service.deleteBackup(filename);
  }
}
