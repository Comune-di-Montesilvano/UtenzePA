import { BadRequestException } from '@nestjs/common';
import { SupplyEventsService } from './supply-events.service';
import { SupplyEventType } from './enum/supply-event-type.enum';

const NOW = new Date('2026-10-19T10:00:00Z');
const AUTO_MESSAGE = 'Riga gestita dal contratto immobiliare: cambia la decisione sul contratto.';

type Row = Record<string, any>;

const event = (o: Row) => ({
  utility_id_fk: 7,
  third_party_id_fk: null,
  requested_on: null,
  effective_on: null,
  date_unknown: false,
  cancelled_on: null,
  utilizer_grant_id_fk: null,
  notes: null,
  deleted: false,
  create_date: new Date('2026-01-01T10:00:00Z'),
  updated_by_user_id: 1,
  ...o,
});

function build(rows: Row[]) {
  let nextId = 100;
  // Ordine delle chiamate, con il segno «tx» se dentro una transazione.
  const calls: string[] = [];
  let inTx = false;
  const log = (c: string) => calls.push(inTx ? c : `${c}(fuori)`);
  const repo = {
    find: jest.fn(async ({ where }: { where: Row }) => {
      log('find');
      return rows
        .filter((r) => Object.entries(where).every(([k, v]) => r[k] === v))
        .map((r) => ({ ...r }));
    }),
    findOne: jest.fn(async ({ where }: { where: Row }) => {
      log('findOne');
      const r = rows.find((x) => Object.entries(where).every(([k, v]) => x[k] === v));
      return r ? { ...r } : null;
    }),
    create: jest.fn((r: Row) => ({ ...r })),
    save: jest.fn(async (r: Row) => {
      log('save');
      const saved = { create_date: NOW, ...r, id: r.id ?? nextId++ };
      const i = rows.findIndex((x) => x.id === saved.id);
      if (i >= 0) rows[i] = saved;
      else rows.push(saved);
      return { ...saved };
    }),
  };
  const manager = { getRepository: () => repo };
  const dataSource = {
    transaction: jest.fn(async (fn: (m: typeof manager) => Promise<unknown>) => {
      inTx = true;
      try {
        return await fn(manager);
      } finally {
        inTx = false;
      }
    }),
  };
  const reconcile = {
    lockUtility: jest.fn(async (_m: unknown, id: number) => {
      log(`lock:${id}`);
      return id === 7 ? { id: 7, deleted: false } : null;
    }),
    reconcileWith: jest.fn(async () => {
      log('reconcile');
      return false;
    }),
  };
  const service = new SupplyEventsService(dataSource as never, repo as never, reconcile as never);
  service.now = () => NOW;
  return { service, repo, reconcile, rows, calls, dataSource, manager };
}

const activation = event({ id: 1, type: SupplyEventType.ACTIVATION, date_unknown: true });

describe('SupplyEventsService', () => {
  it('create: salva la riga e riconcilia l’utenza', async () => {
    const { service, reconcile, rows } = build([activation]);
    await service.create(
      { utility_id_fk: 7, type: SupplyEventType.CESSATION, requested_on: '2026-10-01' },
      42,
    );
    expect(rows.find((r) => r.type === SupplyEventType.CESSATION)).toMatchObject({
      utility_id_fk: 7,
      requested_on: '2026-10-01',
      effective_on: null,
      created_by_user_id: 42,
    });
    expect(reconcile.reconcileWith).toHaveBeenCalledWith(expect.anything(), 7, 42);
  });

  it('create: 400 con il messaggio di validateEvent', async () => {
    const { service, reconcile } = build([activation]);
    await expect(
      service.create({ utility_id_fk: 7, type: SupplyEventType.CESSATION, effective_on: '2026-12-01' }, 42),
    ).rejects.toThrow(new BadRequestException('La data effettiva non può essere nel futuro.'));
    await expect(service.create({ utility_id_fk: 7, type: SupplyEventType.RETURN }, 42)).rejects.toThrow(
      new BadRequestException("L'utenza è già intestata al Comune."),
    );
    expect(reconcile.reconcileWith).not.toHaveBeenCalled();
  });

  it('create: 400 su utenza inesistente', async () => {
    const { service } = build([]);
    await expect(
      service.create({ utility_id_fk: 99, type: SupplyEventType.ACTIVATION }, 42),
    ).rejects.toThrow(new BadRequestException('Utenza non trovata.'));
  });

  it('createInitial: attiva senza data = data non nota; non attiva = attivazione in sospeso', async () => {
    const { service, rows } = build([]);
    await service.createInitial(7, { active: true }, 42);
    expect(rows[0]).toMatchObject({ type: 'ACTIVATION', date_unknown: true, effective_on: null });
    const b = build([]);
    await b.service.createInitial(7, { active: false, requested_on: '2026-10-01' }, 42);
    expect(b.rows[0]).toMatchObject({
      type: 'ACTIVATION',
      date_unknown: false,
      effective_on: null,
      requested_on: '2026-10-01',
    });
  });

  it('update: data effettiva su una riga automatica ammessa', async () => {
    const auto = event({ id: 2, type: SupplyEventType.TRANSFER, third_party_id_fk: 5, utilizer_grant_id_fk: 10 });
    const { service, rows, reconcile } = build([activation, auto]);
    await service.update(2, { effective_on: '2026-10-10', third_party_id_fk: 5 }, 42);
    expect(rows.find((r) => r.id === 2)?.effective_on).toBe('2026-10-10');
    expect(reconcile.reconcileWith).toHaveBeenCalledWith(expect.anything(), 7, 42);
  });

  it('update: altri campi di una riga automatica → 400', async () => {
    const auto = event({ id: 2, type: SupplyEventType.TRANSFER, third_party_id_fk: 5, utilizer_grant_id_fk: 10 });
    const { service } = build([activation, auto]);
    await expect(service.update(2, { third_party_id_fk: 6 }, 42)).rejects.toThrow(
      new BadRequestException(AUTO_MESSAGE),
    );
  });

  it('cancel/remove di una riga automatica → 400', async () => {
    const auto = event({ id: 2, type: SupplyEventType.TRANSFER, third_party_id_fk: 5, utilizer_grant_id_fk: 10 });
    const { service } = build([activation, auto]);
    await expect(service.cancel(2, 42)).rejects.toThrow(new BadRequestException(AUTO_MESSAGE));
    await expect(service.remove(2, 42)).rejects.toThrow(new BadRequestException(AUTO_MESSAGE));
  });

  it('cancel di una riga manuale in sospeso: annullata oggi e riconcilia', async () => {
    const manual = event({ id: 2, type: SupplyEventType.CESSATION });
    const { service, rows, reconcile } = build([activation, manual]);
    await service.cancel(2, 42);
    expect(rows.find((r) => r.id === 2)?.cancelled_on).toBe('2026-10-19');
    expect(reconcile.reconcileWith).toHaveBeenCalledWith(expect.anything(), 7, 42);
  });

  it('listByUtility: righe ordinate, nomi risolti e avvisi di sequenza', async () => {
    const rows = [
      event({ id: 3, type: SupplyEventType.TRANSFER, third_party_id_fk: 5, utilizer_grant_id_fk: 10 }),
      event({ id: 2, type: SupplyEventType.ACTIVATION, effective_on: '2025-01-01' }),
      activation,
    ];
    const { service, repo } = build(rows);
    repo.find.mockImplementation(async () =>
      rows.map((r) => ({
        ...r,
        thirdParty: r.third_party_id_fk ? { type: 'LEGAL', company_name: 'Alfa srl', tax_code: 'X' } : null,
        grant: r.utilizer_grant_id_fk ? { id: 10, subject: null, concession_act: 'Atto 1' } : null,
      })),
    );
    const result = await service.listByUtility(7);
    expect(result.events.map((e) => e.id)).toEqual([1, 2, 3]);
    expect(result.events[2]).toMatchObject({ third_party_name: 'Alfa srl', grant_label: 'Atto 1' });
    expect(result.events[2]).not.toHaveProperty('thirdParty');
    expect(result.warnings).toEqual(['Due attivazioni di fila: manca una cessazione?']);
  });

  it('create: blocco, validazione, salvataggio e riconciliazione in una sola transazione', async () => {
    const { service, calls, dataSource } = build([activation]);
    await service.create({ utility_id_fk: 7, type: SupplyEventType.CESSATION }, 42);
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(['lock:7', 'find', 'save', 'reconcile']);
  });

  it('update/cancel/remove: una transazione, blocco prima della rilettura, riconciliazione dentro', async () => {
    for (const op of ['update', 'cancel', 'remove'] as const) {
      const manual = event({ id: 2, type: SupplyEventType.CESSATION });
      const { service, calls, dataSource } = build([activation, manual]);
      if (op === 'update') await service.update(2, { notes: 'x' }, 42);
      else if (op === 'cancel') await service.cancel(2, 42);
      else await service.remove(2, 42);
      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(calls.every((c) => !c.endsWith('(fuori)'))).toBe(true);
      expect(calls.slice(0, 3)).toEqual(['findOne', 'lock:7', 'findOne']);
      expect(calls[calls.length - 1]).toBe('reconcile');
    }
  });

  it('riconciliazione fallita: errore propagato dalla transazione (la riga non resta)', async () => {
    const { service, reconcile } = build([activation]);
    reconcile.reconcileWith.mockRejectedValueOnce(new Error('boom'));
    await expect(
      service.create({ utility_id_fk: 7, type: SupplyEventType.CESSATION }, 42),
    ).rejects.toThrow('boom');
  });
});
