import { Inject, Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AccountingImportState } from './entity/accounting-import-state.entity';

const STATE_ID = 1;
export const ACCOUNTING_ENV = 'ACCOUNTING_ENV';

// Stato dell'import contabilità (singleton nel DB). Acceso = la contabilità è
// la fonte di verità: gli altri moduli lo leggono con isActive() per mettere
// in sola lettura i dati importati. ACCOUNTING_IMPORT_DISABLED=true lo spegne
// comunque, interruttore incluso.
@Injectable()
export class AccountingStateService {
  private readonly env: Record<string, string | undefined>;

  constructor(
    @InjectRepository(AccountingImportState)
    private readonly repo: Repository<AccountingImportState>,
    @Optional() @Inject(ACCOUNTING_ENV) env?: Record<string, string | undefined>,
  ) {
    this.env = env ?? process.env;
  }

  get forcedOff(): boolean {
    return this.env.ACCOUNTING_IMPORT_DISABLED === 'true';
  }

  async state(): Promise<AccountingImportState> {
    const row = await this.repo.findOneBy({ id: STATE_ID });
    if (row) return row;
    await this.repo.insert({ id: STATE_ID });
    return { id: STATE_ID, enabled: false, from_year: null, last_run_at: null, last_summary: null, last_error: null };
  }

  async isActive(): Promise<boolean> {
    return !this.forcedOff && (await this.state()).enabled;
  }

  async update(patch: Partial<Omit<AccountingImportState, 'id'>>): Promise<void> {
    await this.state();
    await this.repo.update(STATE_ID, patch);
  }
}
