import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Patch,
  Post,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '@core/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@core/auth/guards/roles.guard';
import { Roles } from '@core/auth/decorators/roles.decorator';
import { UpdateAccountingImportDto } from './dto/update-accounting-import.dto';
import { AccountingImportService, type AccountingImportStatus } from './accounting-import.service';
import { AccountingStateService } from './accounting-state.service';
import { AccountingInboxService } from './accounting-inbox.service';

const MAX_FILE_SIZE = 50 * 1024 * 1024;

type UploadedCsv = Partial<
  Record<'chapters' | 'commitments' | 'liquidations', Express.Multer.File[]>
>;

@Controller('accounting-import')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('Admin')
export class AccountingImportController {
  constructor(
    private readonly service: AccountingImportService,
    private readonly states: AccountingStateService,
    private readonly inbox: AccountingInboxService,
  ) {}

  // Solo acceso/spento, per tutti i ruoli: il frontend mette in sola lettura i
  // dati importati.
  @Get('active')
  @Roles('Admin', 'Operatore', 'Lettore')
  async active(): Promise<{ active: boolean }> {
    return { active: await this.states.isActive() };
  }

  @Get('status')
  status(): Promise<AccountingImportStatus> {
    return this.service.getStatus();
  }

  // «Esegui ora» del container Tinn: lo legge al giro successivo (entro un minuto).
  @Post('container/run')
  async runContainer(): Promise<AccountingImportStatus> {
    if (!this.inbox.present())
      throw new BadRequestException('Scaricamento automatico non installato.');
    if (this.inbox.readStatus()?.state === 'running')
      throw new BadRequestException('Scaricamento già in corso.');
    this.inbox.requestRun();
    return this.service.getStatus();
  }

  @Patch()
  async update(@Body() dto: UpdateAccountingImportDto): Promise<AccountingImportStatus> {
    await this.states.update({
      ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
      ...(dto.from_year !== undefined ? { from_year: dto.from_year } : {}),
    });
    // Anno di partenza nuovo: lo legge subito anche il container Tinn.
    await this.inbox.writeSettings();
    return this.service.getStatus();
  }

  @Post()
  @UseInterceptors(
    FileFieldsInterceptor(
      [{ name: 'chapters' }, { name: 'commitments' }, { name: 'liquidations' }],
      {
        limits: { fileSize: MAX_FILE_SIZE },
      },
    ),
  )
  run(@UploadedFiles() files: UploadedCsv = {}): Promise<AccountingImportStatus> {
    return this.service.start({
      chapters: files.chapters?.[0]?.buffer,
      commitments: files.commitments?.[0]?.buffer,
      liquidations: files.liquidations?.[0]?.buffer,
    });
  }
}
