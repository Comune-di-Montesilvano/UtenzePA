import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { PhotosService } from './photos.service';
import { CreatePhotoDto } from './dto/create-photo.dto';
import { PhotoQueryDto } from './dto/photo-query.dto';
import { PhotoUploadFinalizeDto } from './dto/photo-upload-finalize.dto';
import { Photo } from './entity/photo.entity';
import { JwtAuthGuard } from '@core/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@core/auth/guards/roles.guard';
import { Roles } from '@core/auth/decorators/roles.decorator';
import { CurrentUser, ICurrentUser } from '@core/auth/decorators/current-user.decorator';
import { ChunkedUploadService } from '@common/chunked-upload/chunked-upload.service';
import { UploadChunkDto } from '@common/chunked-upload/dto/upload-chunk.dto';

const MAX_PHOTO_SIZE_BYTES = 10 * 1024 * 1024;

@Controller('photos')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PhotosController {
  private readonly tmpDir = path.join(process.cwd(), 'photos', 'tmp');

  constructor(
    private readonly service: PhotosService,
    private readonly chunkedUpload: ChunkedUploadService,
  ) {}

  @Get()
  list(@Query() query: PhotoQueryDto): Promise<Photo[]> {
    return this.service.findAll(query.entityType, query.entityId);
  }

  @Get(':id/file')
  async getFile(
    @Param('id', ParseIntPipe) id: number,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const photo = await this.service.findOne(id);
    res.set({ 'Content-Type': photo.mime_type });
    return new StreamableFile(fs.createReadStream(this.service.getAbsolutePath(photo)));
  }

  @Roles('Admin', 'Operatore')
  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_PHOTO_SIZE_BYTES } }))
  create(
    @Query() dto: CreatePhotoDto,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: ICurrentUser,
  ): Promise<Photo> {
    if (!file) throw new BadRequestException('File mancante');
    return this.service.create(dto, file, user.id);
  }

  // Upload a chunk (frontend: ChunkedUploadService, 1MB per parte — vincolo
  // reverse proxy di produzione, vedi stesso pattern in BackupController/
  // ImportController). Le foto reali (fotocamera) superano quasi sempre 1MB,
  // a differenza degli altri upload chunkati del progetto questo non è un
  // caso limite ma la norma.
  @Roles('Admin', 'Operatore')
  @Post('upload/chunk')
  @UseInterceptors(FileInterceptor('chunk'))
  uploadChunk(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadChunkDto,
  ): { received: boolean } {
    const maxSizeBytes = parseInt(process.env.PHOTO_MAX_SIZE_MB ?? '10', 10) * 1024 * 1024;
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

  @Roles('Admin', 'Operatore')
  @Post('upload/finalize')
  async uploadFinalize(
    @Body() dto: PhotoUploadFinalizeDto,
    @CurrentUser() user: ICurrentUser,
  ): Promise<Photo> {
    const filePath = this.chunkedUpload.assemble(
      dto.uploadId,
      dto.totalChunks,
      this.tmpDir,
      `${dto.uploadId}-${dto.originalFilename}`,
    );
    try {
      const buffer = fs.readFileSync(filePath);
      const file: Express.Multer.File = {
        buffer,
        mimetype: dto.mimeType,
        originalname: dto.originalFilename,
        size: buffer.length,
      } as Express.Multer.File;
      return await this.service.create(
        { entityType: dto.entityType, entityId: dto.entityId },
        file,
        user.id,
      );
    } finally {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
  }

  @Roles('Admin', 'Operatore')
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: ICurrentUser): Promise<void> {
    return this.service.remove(id, user.id);
  }
}
