import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
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
import { JwtAuthGuard } from '@/core/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/core/auth/guards/roles.guard';
import { Roles } from '@/core/auth/decorators/roles.decorator';
import { CurrentUser, ICurrentUser } from '@/core/auth/decorators/current-user.decorator';
import { UploadChunkDto } from '@common/chunked-upload/dto/upload-chunk.dto';
import { AttachmentRow, AttachmentsService } from './attachments.service';
import { Attachment } from './entity/attachment.entity';
import { AttachmentQueryDto } from './dto/attachment-query.dto';
import { AttachmentFinalizeDto } from './dto/attachment-finalize.dto';
import { UpdateAttachmentDto } from './dto/update-attachment.dto';
import { contentDisposition, isPreviewableMime } from './attachment-file-policy';

@Controller('attachments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AttachmentsController {
  constructor(private readonly service: AttachmentsService) {}

  @Get()
  list(@Query() q: AttachmentQueryDto): Promise<AttachmentRow[]> {
    return this.service.list(q.entity_type, q.entity_id);
  }

  // Pezzi da 512 KB (frontend ChunkedUploadService): limite del proxy di produzione.
  @Roles('Admin', 'Operatore')
  @Post('chunk')
  // Il frontend manda pezzi da 512 KB: oltre 1 MB la richiesta è rifiutata.
  @UseInterceptors(FileInterceptor('chunk', { limits: { fileSize: 1024 * 1024 } }))
  chunk(
    @UploadedFile() chunk: Express.Multer.File,
    @Body() dto: UploadChunkDto,
  ): { received: boolean } {
    if (!chunk) throw new BadRequestException('Parte del file mancante');
    this.service.saveChunk(dto, chunk.buffer);
    return { received: true };
  }

  @Roles('Admin', 'Operatore')
  @Post('finalize')
  finalize(
    @Body() dto: AttachmentFinalizeDto,
    @CurrentUser() user: ICurrentUser,
  ): Promise<Attachment> {
    return this.service.finalize(dto, user.id);
  }

  // Download riservato: gli allegati contengono spesso dati personali.
  @Roles('Admin', 'Operatore')
  @Get(':id/file')
  async file(
    @Param('id', ParseIntPipe) id: number,
    @Query('inline') inline: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { attachment, absolutePath } = await this.service.open(id);
    const preview = inline === '1' && isPreviewableMime(attachment.mime_type);
    res.set({
      'Content-Type': attachment.mime_type,
      'Content-Disposition': contentDisposition(attachment.original_name, preview),
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    });
    return new StreamableFile(fs.createReadStream(absolutePath));
  }

  @Roles('Admin', 'Operatore')
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAttachmentDto,
    @CurrentUser() user: ICurrentUser,
  ): Promise<Attachment> {
    return this.service.update(id, dto, user.id);
  }

  @Roles('Admin', 'Operatore')
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: ICurrentUser): Promise<void> {
    return this.service.remove(id, user.id);
  }
}
