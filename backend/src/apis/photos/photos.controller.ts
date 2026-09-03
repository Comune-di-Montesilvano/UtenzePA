import {
  BadRequestException,
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
import { PhotosService } from './photos.service';
import { CreatePhotoDto } from './dto/create-photo.dto';
import { PhotoQueryDto } from './dto/photo-query.dto';
import { Photo } from './entity/photo.entity';
import { JwtAuthGuard } from '@core/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@core/auth/guards/roles.guard';
import { Roles } from '@core/auth/decorators/roles.decorator';
import { CurrentUser, ICurrentUser } from '@core/auth/decorators/current-user.decorator';

const MAX_PHOTO_SIZE_BYTES = 10 * 1024 * 1024;

@Controller('photos')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PhotosController {
  constructor(private readonly service: PhotosService) {}

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

  @Roles('Admin', 'Operatore')
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: ICurrentUser): Promise<void> {
    return this.service.remove(id, user.id);
  }
}
