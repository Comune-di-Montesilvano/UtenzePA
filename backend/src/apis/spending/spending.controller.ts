import { Controller, Get, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@/core/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/core/auth/guards/roles.guard';
import { ChapterSummary, SpendingService, YearSpending } from './spending.service';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class SpendingController {
  constructor(private readonly service: SpendingService) {}

  @Get('utilities/:id/spending')
  utility(@Param('id', ParseIntPipe) id: number): Promise<YearSpending[]> {
    return this.service.forUtility(id);
  }

  @Get('assets/:id/spending')
  asset(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<{ years: YearSpending[]; shared_utilities: number }> {
    return this.service.forAsset(id);
  }

  @Get('contracts/:id/chapters-summary')
  chapters(@Param('id', ParseIntPipe) id: number): Promise<ChapterSummary[]> {
    return this.service.chaptersSummary(id);
  }
}
