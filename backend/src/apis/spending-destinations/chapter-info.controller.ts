import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '@/core/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/core/auth/guards/roles.guard';
import { ChapterDerivationService, ChapterInfo } from './chapter-derivation.service';

// Da dove viene il capitolo dell'utenza: sotto /utilities per la scheda utenza.
@Controller('utilities')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ChapterInfoController {
  constructor(private readonly derivation: ChapterDerivationService) {}

  @Get(':id/chapter-info')
  async chapterInfo(@Param('id', ParseIntPipe) id: number): Promise<ChapterInfo> {
    const info = await this.derivation.chapterInfo(id);
    if (!info) throw new BadRequestException('Utenza non trovata');
    return info;
  }
}
