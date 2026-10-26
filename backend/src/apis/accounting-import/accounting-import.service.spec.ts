import { BadRequestException } from '@nestjs/common';
import { AccountingImportService, type AccountingStep } from './accounting-import.service';
import { AccountingStateService } from './accounting-state.service';
import { AccChapter } from './entity/acc-chapter.entity';
import { AccCommitment } from './entity/acc-commitment.entity';

type State = { id: number; enabled: boolean; from_year: number | null; last_run_at?: Date | null };

function stateService(state: State, env: Record<string, string | undefined> = {}) {
  const repo = {
    findOneBy: jest.fn(async () => state),
    insert: jest.fn(),
    update: jest.fn(async (_id: number, patch: Partial<State>) => Object.assign(state, patch)),
  };
  return new AccountingStateService(repo as never, env);
}

function setup(state: State, steps: AccountingStep[] = []) {
  const queries: string[] = [];
  const inserts: { entity: unknown; rows: unknown[] }[] = [];
  const manager = {
    query: jest.fn(async (sql: string) => {
      queries.push(sql);
      return [];
    }),
    insert: jest.fn(async (entity: unknown, rows: unknown[]) => {
      inserts.push({ entity, rows });
    }),
  };
  const dataSource = {
    transaction: jest.fn(async (cb: (m: typeof manager) => Promise<unknown>) => cb(manager)),
    query: jest.fn(async () => [{ chapters: 0, commitments: 0, liquidations: 0 }]),
  };
  const reconcile = { reconcileAll: jest.fn(async () => undefined) };
  const states = stateService(state);
  const service = new AccountingImportService(
    dataSource as never,
    states,
    reconcile as never,
    steps,
  );
  return { service, queries, inserts, reconcile, state };
}

const COMMITMENTS =
  'commitment_year;commitment_num;commitment_sub;fiscal_year;chapter;article;amount\n' +
  '2022;10;1;2022;11407;0;5\n' +
  '2026;514;1;2026;11407;0;18500\n';

describe('AccountingStateService', () => {
  it('attivo solo se acceso e non forzato spento', async () => {
    expect(await stateService({ id: 1, enabled: true, from_year: 2023 }).isActive()).toBe(true);
    expect(await stateService({ id: 1, enabled: false, from_year: 2023 }).isActive()).toBe(false);
    expect(
      await stateService(
        { id: 1, enabled: true, from_year: 2023 },
        { ACCOUNTING_IMPORT_DISABLED: 'true' },
      ).isActive(),
    ).toBe(false);
  });
});

describe('AccountingImportService.run', () => {
  const on = (): State => ({ id: 1, enabled: true, from_year: 2023 });

  it('ogni file sostituisce solo la sua tabella', async () => {
    const { service, queries, inserts } = setup(on());
    await service.run({ commitments: Buffer.from(COMMITMENTS) });
    expect(queries).toEqual(['DELETE FROM `acc_commitments`']);
    expect(inserts.map((i) => i.entity)).toEqual([AccCommitment]);
  });

  it('righe con anno prima di from_year scartate senza issue', async () => {
    const { service, inserts } = setup(on());
    const summary = await service.run({ commitments: Buffer.from(COMMITMENTS) });
    expect(inserts[0].rows).toEqual([expect.objectContaining({ commitment_num: 514 })]);
    expect(summary.loaded).toEqual({ commitments: 1 });
    expect(summary.issues).toEqual({ commitments: [] });
  });

  it('file con soli issue non svuota la tabella', async () => {
    const { service, queries } = setup(on());
    const summary = await service.run({ chapters: Buffer.from('year;chapter;article\n2026;;0\n') });
    expect(queries).toEqual([]);
    expect(summary.issues.chapters).toHaveLength(1);
  });

  it('esegue i passi in ordine, poi il ricalcolo, e salva lo stato', async () => {
    const order: string[] = [];
    const steps: AccountingStep[] = [
      { name: 'chapters', apply: async () => (order.push('chapters'), { created: 1 }) },
      { name: 'commitments', apply: async () => (order.push('commitments'), { created: 2 }) },
    ];
    const { service, reconcile, state } = setup(on(), steps);
    reconcile.reconcileAll.mockImplementation(async () => void order.push('reconcile'));
    const summary = await service.run({
      chapters: Buffer.from('year;chapter;article\n2026;1;0\n'),
    });
    expect(order).toEqual(['chapters', 'commitments', 'reconcile']);
    expect(summary.steps).toEqual({ chapters: { created: 1 }, commitments: { created: 2 } });
    expect(state.last_run_at).toBeInstanceOf(Date);
  });

  it('errore in un passo: last_error salvato, tabelle già caricate restano, eccezione 400', async () => {
    const steps: AccountingStep[] = [
      {
        name: 'chapters',
        apply: async () => {
          throw new Error('boom');
        },
      },
    ];
    const { service, inserts, state } = setup(on(), steps);
    await expect(
      service.run({ chapters: Buffer.from('year;chapter;article\n2026;1;0\n') }),
    ).rejects.toThrow(BadRequestException);
    expect(inserts.map((i) => i.entity)).toEqual([AccChapter]);
    expect(state).toEqual(expect.objectContaining({ last_error: 'boom' }));
  });

  it('nessun file = 400', async () => {
    const { service } = setup(on());
    await expect(service.run({})).rejects.toThrow('Nessun file caricato.');
  });

  it('import spento = 400', async () => {
    const { service } = setup({ id: 1, enabled: false, from_year: 2023 });
    await expect(service.run({ commitments: Buffer.from(COMMITMENTS) })).rejects.toThrow(
      'Import contabilità spento.',
    );
  });

  it('anno di partenza non impostato = 400', async () => {
    const { service } = setup({ id: 1, enabled: true, from_year: null });
    await expect(service.run({ commitments: Buffer.from(COMMITMENTS) })).rejects.toThrow(
      "Impostare l'anno di partenza.",
    );
  });

  it('giro concorrente = 400', async () => {
    let release: () => void = () => undefined;
    const steps: AccountingStep[] = [
      { name: 'slow', apply: () => new Promise((resolve) => (release = () => resolve({}))) },
    ];
    const { service } = setup(on(), steps);
    const first = service.run({ commitments: Buffer.from(COMMITMENTS) });
    await new Promise((r) => setImmediate(r));
    await expect(service.run({ commitments: Buffer.from(COMMITMENTS) })).rejects.toThrow(
      'Import contabilità già in corso.',
    );
    release();
    await first;
  });
});
