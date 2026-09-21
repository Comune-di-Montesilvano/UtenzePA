import { Controller, ForbiddenException, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@core/auth/guards/jwt-auth.guard';
import { CurrentUser, ICurrentUser } from '@core/auth/decorators/current-user.decorator';
import { AuditLogService, AuditLogQueryResult } from './audit-log.service';
import { QueryAuditLogDto } from './dto/query-audit-log.dto';

@Controller('audit-log')
@UseGuards(JwtAuthGuard)
export class AuditLogController {
  constructor(private readonly service: AuditLogService) {}

  @Get()
  async find(@Query() query: QueryAuditLogDto, @CurrentUser() user: ICurrentUser): Promise<AuditLogQueryResult> {
    // entityId presente = storico di un singolo record: stesso livello di
    // accesso del GET sull'entity stessa (qualunque utente autenticato).
    // entityId assente = log globale (sfoglia tutte le righe di una
    // tabella): solo Admin. @Roles()/RolesGuard non si applica qui perché
    // la stessa route serve entrambi i casi con permessi diversi a seconda
    // del query param, non del solo handler.
    if (query.entityId === undefined && user.role !== 'Admin') {
      throw new ForbiddenException('Solo un amministratore può consultare il log globale');
    }
    return this.service.query(query);
  }
}
