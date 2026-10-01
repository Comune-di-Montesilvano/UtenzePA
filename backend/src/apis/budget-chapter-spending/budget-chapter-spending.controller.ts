import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '@/core/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/core/auth/guards/roles.guard';
import { Roles } from '@/core/auth/decorators/roles.decorator';
import { CurrentUser, ICurrentUser } from '@/core/auth/decorators/current-user.decorator';
import { BudgetChapterSpendingService } from './budget-chapter-spending.service';
import { BudgetChapterSpending } from './entity/budget-chapter-spending.entity';
import { CreateBudgetChapterSpendingDto } from './dto/create-budget-chapter-spending.dto';
import { UpdateBudgetChapterSpendingDto } from './dto/update-budget-chapter-spending.dto';

// Route annidate sotto budget-chapters/:chapterId (lista/creazione) e dirette
// su budget-chapter-spending/:id (modifica/eliminazione).
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class BudgetChapterSpendingController {
  constructor(private readonly service: BudgetChapterSpendingService) {}

  @Get('budget-chapters/:chapterId/spending')
  list(@Param('chapterId', ParseIntPipe) chapterId: number): Promise<BudgetChapterSpending[]> {
    return this.service.findByChapter(chapterId);
  }

  @Roles('Admin', 'Operatore')
  @Post('budget-chapters/:chapterId/spending')
  create(
    @Param('chapterId', ParseIntPipe) chapterId: number,
    @Body() dto: CreateBudgetChapterSpendingDto,
    @CurrentUser() user: ICurrentUser,
  ): Promise<BudgetChapterSpending> {
    return this.service.createForChapter(chapterId, dto, user.id);
  }

  @Roles('Admin', 'Operatore')
  @Patch('budget-chapter-spending/:id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateBudgetChapterSpendingDto,
    @CurrentUser() user: ICurrentUser,
  ): Promise<BudgetChapterSpending> {
    return this.service.update(id, dto, user.id);
  }

  @Roles('Admin', 'Operatore')
  @Delete('budget-chapter-spending/:id')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: ICurrentUser): Promise<void> {
    return this.service.remove(id, user.id);
  }
}
