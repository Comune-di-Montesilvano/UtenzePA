import { AuditAction } from '@apis/audit-log/entity/audit-log.entity';
import { BudgetCommitment } from '@apis/budget-commitments/entity/budget-commitment.entity';
import { SYSTEM_USER_ID } from '@apis/system-users/system-user.constants';
import { CommitmentApplierService } from './commitment-applier.service';
import { RecordSource } from './record-source.enum';
import * as q from './accounting-import.queries';

jest.mock('./accounting-import.queries');
const mq = jest.mocked(q);

function setup(commitments: unknown[]) {
  const calls: string[] = [];
  const manager = {
    insert: jest.fn(async (entity: unknown, values: Record<string, unknown>) => {
      calls.push(
        `insert ${entity === BudgetCommitment ? 'commitment' : 'other'} ${JSON.stringify(values)}`,
      );
      return { identifiers: [{ id: 50 }] };
    }),
    update: jest.fn(async (_entity: unknown, id: number, values: Record<string, unknown>) => {
      calls.push(`update ${id} ${JSON.stringify(values)}`);
    }),
  };
  // Scritture del modulo registrate per nome; le query vere sono provate in
  // accounting-import.int-spec.ts.
  const record =
    (name: string) =>
    async (...args: unknown[]) => {
      calls.push(`${name} ${JSON.stringify(args.slice(1))}`);
    };
  mq.upsertYears.mockImplementation(record('upsertYears'));
  mq.dropManualSplits.mockImplementation(record('dropManualSplits'));
  mq.dropCommitmentShares.mockImplementation(record('dropCommitmentShares'));
  mq.dropYears.mockImplementation(record('dropYears'));
  mq.liveChapters.mockResolvedValue([{ id: 7, chapter_code: '100', article: 0 }]);
  mq.currentCommitments.mockResolvedValue(commitments as never);
  const dataSource = {
    manager: {},
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
    scope: jest.fn(async () => ({
      chapterKeys: new Set(['100/0']),
      commitmentKeys: new Set(['2026/1/1']),
    })),
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
    expect(calls[1]).toBe('upsertYears [50,[{"fiscal_year":2026,"amount":18500}]]');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        entityName: 'budget_commitments',
        entityId: 50,
        action: AuditAction.CREATE,
      }),
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
        years: [{ fiscal_year: 2026, amount: 18500, source: 'ACCOUNTING' }],
      },
      {
        id: 9,
        commitment_year: 2025,
        commitment_num: 77,
        commitment_sub: 1,
        budget_chapter_id_fk: 7,
        supplier_id_fk: null,
        source: 'MANUAL',
        years: [{ fiscal_year: 2026, amount: 10, source: 'MANUAL' }],
      },
    ]);
    const result = await service.apply();
    expect(calls).toEqual([
      // Fatture divise a mano anche su altri impegni: via tutte le loro quote a
      // mano, così tornano all'automatico (non restano quote che non tornano).
      'dropManualSplits [9]',
      'dropCommitmentShares [9]',
      `update 9 {"deleted":true,"updated_by_user_id":${SYSTEM_USER_ID}}`,
    ]);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        entityName: 'budget_commitments',
        entityId: 9,
        action: AuditAction.DELETE,
      }),
    );
    expect(result).toEqual({ created: 0, updated: 0, deleted: 1 });
  });
});
