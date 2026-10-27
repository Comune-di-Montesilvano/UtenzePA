import { getRepositoryToken } from '@nestjs/typeorm';
import type { DynamicModule, Provider } from '@nestjs/common';
import { AccountingImportModule, inboxCronTime } from './accounting-import.module';
import { AccChapter } from './entity/acc-chapter.entity';
import { AccCommitment } from './entity/acc-commitment.entity';
import { AccLiquidation } from './entity/acc-liquidation.entity';

// Moduli che caricano @nestjs/schedule (solo ESM, rompe jest).
jest.mock('@apis/audit-log/audit-log.module', () => ({ AuditLogModule: class {} }));
jest.mock('@apis/budget-commitments/budget-commitments.module', () => ({
  BudgetCommitmentsModule: class {},
}));

// Con autoLoadEntities le entity entrano nel DataSource solo da forFeature:
// senza, manager.insert(AccChapter, …) fallisce con «this.subQuery is not a function».
describe('AccountingImportModule', () => {
  it('registra le tabelle di appoggio in TypeORM', () => {
    const imports = Reflect.getMetadata('imports', AccountingImportModule) as DynamicModule[];
    const tokens = imports
      .flatMap((m) => (m?.providers ?? []) as Provider[])
      .map((p) => (typeof p === 'object' && 'provide' in p ? p.provide : p));
    for (const entity of [AccChapter, AccCommitment, AccLiquidation]) {
      expect(tokens).toContain(getRepositoryToken(entity));
    }
  });

  it('cron della casella: vuoto o non valido = ogni 5 minuti', () => {
    expect(inboxCronTime(undefined)).toBe('*/5 * * * *');
    expect(inboxCronTime('')).toBe('*/5 * * * *');
    expect(inboxCronTime('ogni tanto')).toBe('*/5 * * * *');
    expect(inboxCronTime('*/10 * * * *')).toBe('*/10 * * * *');
  });
});
