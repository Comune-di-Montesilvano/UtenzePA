import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@/core/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/core/auth/guards/roles.guard';
import {
  ChapterCommitment,
  ChapterInvoiceLine,
  BudgetWarning,
  ChapterSummary,
  SpendingService,
  YearSpending,
} from './spending.service';
import { ChapterYear, ChapterYearSummary } from './chapter-year';
import { BudgetCheckDto } from './dto/budget-check.dto';

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

  @Get('budget-chapters/:id/years')
  chapterYears(@Param('id', ParseIntPipe) id: number): Promise<ChapterYear[]> {
    return this.service.forChapter(id);
  }

  @Get('budget-chapters/:id/commitments')
  chapterCommitments(@Param('id', ParseIntPipe) id: number): Promise<ChapterCommitment[]> {
    return this.service.chapterCommitments(id);
  }

  @Get('budget-chapters/:id/invoice-lines')
  chapterLines(@Param('id', ParseIntPipe) id: number): Promise<ChapterInvoiceLine[]> {
    return this.service.chapterInvoiceLines(id);
  }

  // Nessun @Roles: sola lettura, serve anche al Lettore che apre una fattura.
  @Post('spending/budget-check')
  budgetCheck(@Body() dto: BudgetCheckDto): Promise<BudgetWarning[]> {
    return this.service.budgetCheck(dto);
  }

  @Get('spending/chapters')
  chaptersYear(@Query('year', ParseIntPipe) year: number): Promise<ChapterYearSummary[]> {
    return this.service.chaptersYear(year);
  }
}
