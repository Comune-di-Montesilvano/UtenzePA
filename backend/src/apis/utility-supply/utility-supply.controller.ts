import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '@/core/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/core/auth/guards/roles.guard';
import { Roles } from '@/core/auth/decorators/roles.decorator';
import { CurrentUser, ICurrentUser } from '@/core/auth/decorators/current-user.decorator';
import { SupplyEventsList, SupplyEventsService } from './supply-events.service';
import { GrantDecisionRow, SupplyReconcileService } from './supply-reconcile.service';
import { CreateSupplyEventDto } from './dto/create-supply-event.dto';
import { UpdateSupplyEventDto } from './dto/update-supply-event.dto';
import { SetDecisionDto } from './dto/set-decision.dto';

// Storico utenze e decisioni per contratto immobiliare (roadmap voce 22).
// Le scritture rispondono con lo storico (o le decisioni) aggiornati: la
// riconciliazione può aver creato o annullato altre righe.
@Controller('utility-supply')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UtilitySupplyController {
  constructor(
    private readonly events: SupplyEventsService,
    private readonly reconcile: SupplyReconcileService,
  ) {}

  @Get('utilities/:utilityId/events')
  list(@Param('utilityId', ParseIntPipe) utilityId: number): Promise<SupplyEventsList> {
    return this.events.listByUtility(utilityId);
  }

  @Roles('Admin', 'Operatore')
  @Post('events')
  async create(
    @Body() dto: CreateSupplyEventDto,
    @CurrentUser() user: ICurrentUser,
  ): Promise<SupplyEventsList> {
    const saved = await this.events.create(dto, user.id);
    return this.events.listByUtility(saved.utility_id_fk);
  }

  @Roles('Admin', 'Operatore')
  @Patch('events/:id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSupplyEventDto,
    @CurrentUser() user: ICurrentUser,
  ): Promise<SupplyEventsList> {
    const saved = await this.events.update(id, dto, user.id);
    return this.events.listByUtility(saved.utility_id_fk);
  }

  @Roles('Admin', 'Operatore')
  @Post('events/:id/cancel')
  async cancel(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: ICurrentUser,
  ): Promise<SupplyEventsList> {
    const saved = await this.events.cancel(id, user.id);
    return this.events.listByUtility(saved.utility_id_fk);
  }

  @Roles('Admin', 'Operatore')
  @Delete('events/:id')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: ICurrentUser): Promise<void> {
    return this.events.remove(id, user.id);
  }

  @Get('grants/:grantId/decisions')
  decisions(@Param('grantId', ParseIntPipe) grantId: number): Promise<GrantDecisionRow[]> {
    return this.reconcile.listDecisions(grantId);
  }

  @Roles('Admin', 'Operatore')
  @Post('grants/:grantId/decisions/apply-proposal')
  applyProposal(
    @Param('grantId', ParseIntPipe) grantId: number,
    @CurrentUser() user: ICurrentUser,
  ): Promise<GrantDecisionRow[]> {
    return this.reconcile.applyProposal(grantId, user.id);
  }

  @Roles('Admin', 'Operatore')
  @Put('grants/:grantId/decisions/:utilityId')
  setDecision(
    @Param('grantId', ParseIntPipe) grantId: number,
    @Param('utilityId', ParseIntPipe) utilityId: number,
    @Body() dto: SetDecisionDto,
    @CurrentUser() user: ICurrentUser,
  ): Promise<GrantDecisionRow[]> {
    return this.reconcile.setDecision(grantId, utilityId, dto, user.id);
  }
}
