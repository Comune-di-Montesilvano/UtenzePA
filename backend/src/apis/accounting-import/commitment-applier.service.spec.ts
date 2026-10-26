import { AuditAction } from '@apis/audit-log/entity/audit-log.entity';
import { BudgetCommitment } from '@apis/budget-commitments/entity/budget-commitment.entity';
import { SYSTEM_USER_ID } from '@apis/system-users/system-user.constants';
import { CommitmentApplierService } from './commitment-applier.service';
import { RecordSource } from './record-source.enum';

function setup(commitments: unknown[]) {
  const calls: string[] = [];
  const manager = {
    insert: jest.fn(async (entity: unknown, values: Record<string, unknown>) => {
      calls.push(`insert ${entity === BudgetCommitment ? 'commitment' : 'other'} ${JSON.stringify(values)}`);
      return { identifiers: [{ id: 50 }] };
    }),
    update: jest.fn(async (_entity: unknown, id: number, values: Record<string, unknown>) => {
      calls.push(`update ${id} ${JSON.stringify(values)}`);
    }),
    query: jest.fn(async (sql: string, params: unknown[]) => {
      calls.push(`query ${sql.split(' ').slice(0, 3).join(' ')} ${JSON.stringify(params)}`);
    }),
  };
  const dataSource = {
    query: jest.fn(async (sql: string) => {
      if (sql.includes('FROM budget_chapters')) return [{ id: 7, chapter_code: '100', article: 0 }];
      if (sql.includes('FROM budget_commitments')) return commitments;
      return [];
    }),
    transaction: jest.fn(async (cb: (m: typeof manager) => Promise<unknown>) => cb(manager)),
  };
  const data = {
    commitments: jest.fn(async () => [
      {
        commitment_year: 2026,
        commitment_num: 1,
        commitment_sub: 1,
        fiscal_year: 2026,
        chapter: '100',
        article: 0,
        supplier_vat: null,
        amount: 18500,
        cig: null,
        cancelled: false,
        description: null,
      },
    ]),
    scope: jest.fn(async () => ({ chapterKeys: new Set(['100/0']), commitmentKeys: new Set(['2026/1/1']) })),
    thirdPartiesByVat: jest.fn(async () => new Map()),
  };
  const audit = { record: jest.fn(async () => undefined) };
  const service = new CommitmentApplierService(dataSource as never, data as never, audit as never);
  return { service, calls, audit };
}

describe('CommitmentApplierService', () => {
  it('crea impegno e annualità della contabilità con l utente di sistema', async () => {
    const { service, calls, audit } = setup([]);
    const result = await service.apply();
    expect(calls[0]).toContain('insert commitment');
    expect(calls[0]).toContain(`"source":"${RecordSource.ACCOUNTING}"`);
    expect(calls[0]).toContain(`"created_by_user_id":${SYSTEM_USER_ID}`);
    expect(calls[1]).toContain('[50,2026,18500,"ACCOUNTING"]');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ entityName: 'budget_commitments', entityId: 50, action: AuditAction.CREATE }),
    );
    expect(result).toEqual({ created: 1, updated: 0, deleted: 0 });
  });

  it('impegno a mano cancellato: prima via le quote automatiche e a mano, poi la cancellazione', async () => {
    const { service, calls, audit } = setup([
      {
        id: 1,
        commitment_year: 2026,
        commitment_num: 1,
        commitment_sub: 1,
        budget_chapter_id_fk: 7,
        supplier_id_fk: null,
        source: 'ACCOUNTING',
        years: JSON.stringify([{ fiscal_year: 2026, amount: '18500.00', source: 'ACCOUNTING' }]),
      },
      {
        id: 9,
        commitment_year: 2025,
        commitment_num: 77,
        commitment_sub: 1,
        budget_chapter_id_fk: 7,
        supplier_id_fk: null,
        source: 'MANUAL',
        years: JSON.stringify([{ fiscal_year: 2026, amount: '10.00', source: 'MANUAL' }]),
      },
    ]);
    const result = await service.apply();
    expect(calls).toEqual([
      expect.stringMatching(/^query DELETE FROM invoice_commitment_shares \[9\]/),
      `update 9 {"deleted":true,"updated_by_user_id":${SYSTEM_USER_ID}}`,
    ]);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ entityName: 'budget_commitments', entityId: 9, action: AuditAction.DELETE }),
    );
    expect(result).toEqual({ created: 0, updated: 0, deleted: 1 });
  });
});
