import { Body, Controller, Get, Patch, Post, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '@core/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@core/auth/guards/roles.guard';
import { Roles } from '@core/auth/decorators/roles.decorator';
import { UpdateAccountingImportDto } from './dto/update-accounting-import.dto';
import {
  AccountingImportService,
  type AccountingImportStatus,
  type AccountingImportSummary,
} from './accounting-import.service';
import { AccountingStateService } from './accounting-state.service';

const MAX_FILE_SIZE = 50 * 1024 * 1024;

type UploadedCsv = Partial<Record<'chapters' | 'commitments' | 'liquidations', Express.Multer.File[]>>;

@Controller('accounting-import')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('Admin')
export class AccountingImportController {
  constructor(
    private readonly service: AccountingImportService,
    private readonly states: AccountingStateService,
  ) {}

  @Get('status')
  status(): Promise<AccountingImportStatus> {
    return this.service.getStatus();
  }

  @Patch()
  async update(@Body() dto: UpdateAccountingImportDto): Promise<AccountingImportStatus> {
    await this.states.update({
      ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
      ...(dto.from_year !== undefined ? { from_year: dto.from_year } : {}),
    });
    return this.service.getStatus();
  }

  @Post()
  @UseInterceptors(
    FileFieldsInterceptor([{ name: 'chapters' }, { name: 'commitments' }, { name: 'liquidations' }], {
      limits: { fileSize: MAX_FILE_SIZE },
    }),
  )
  run(@UploadedFiles() files: UploadedCsv = {}): Promise<AccountingImportSummary> {
    return this.service.run({
      chapters: files.chapters?.[0]?.buffer,
      commitments: files.commitments?.[0]?.buffer,
      liquidations: files.liquidations?.[0]?.buffer,
    });
  }
}
