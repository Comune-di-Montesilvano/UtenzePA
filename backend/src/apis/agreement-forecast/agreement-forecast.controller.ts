import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '@core/auth/decorators/roles.decorator';
import { CurrentUser, ICurrentUser } from '@/core/auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '@/core/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/core/auth/guards/roles.guard';
import { HardTypeEnum } from '@apis/utility-types/enum/hard-type.enum';
import { AgreementForecastService, ForecastResponse } from './agreement-forecast.service';
import { AgreementPriceDto } from './dto/agreement-price.dto';

const PRICE_TYPES: string[] = [HardTypeEnum.LIGHT, HardTypeEnum.GAS];

function isRealDay(text: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return false;
  const [y, m, d] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

// Fabbisogno della convenzione CONSIP (tab «Fabbisogno» della scheda).
@Controller('consip-agreement')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AgreementForecastController {
  constructor(private readonly service: AgreementForecastService) {}

  // Calcola e riallinea la cache. as_of (solo Admin, senza interfaccia):
  // calcolo «come se fosse» quel giorno, per verificare la bontà della stima.
  @Get(':id/forecast')
  forecast(
    @Param('id', ParseIntPipe) id: number,
    @Query('as_of') asOf: unknown,
    @CurrentUser() user: ICurrentUser,
  ): Promise<ForecastResponse> {
    if (!asOf) return this.service.compute(id, {});
    if (user?.role !== 'Admin') {
      throw new BadRequestException('Solo un amministratore può calcolare a una data passata.');
    }
    // Un parametro ripetuto arriva come array: solo una stringa AAAA-MM-GG di
    // un giorno che esiste.
    if (typeof asOf !== 'string' || !isRealDay(asOf)) {
      throw new BadRequestException('Data non valida.');
    }
    return this.service.compute(id, { asOf });
  }

  @Roles('Admin', 'Operatore')
  @Put(':id/forecast/prices/:hardType')
  setPrice(
    @Param('id', ParseIntPipe) id: number,
    @Param('hardType') hardType: string,
    @Body() dto: AgreementPriceDto,
    @CurrentUser() user: ICurrentUser,
  ): Promise<ForecastResponse> {
    if (!PRICE_TYPES.includes(hardType))
      throw new BadRequestException('Tipo di utenza non valido.');
    return this.service.setPrice(id, hardType as HardTypeEnum, dto.unit_price ?? null, user.id);
  }
}
