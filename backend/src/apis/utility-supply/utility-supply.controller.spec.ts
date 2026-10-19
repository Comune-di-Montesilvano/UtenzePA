import { Logger } from '@nestjs/common';
import { UtilitySupplyController } from './utility-supply.controller';
import { SupplyEventType } from './enum/supply-event-type.enum';

const saved = {
  id: 12,
  utility_id_fk: 7,
  type: SupplyEventType.CESSATION,
  third_party_id_fk: null,
  requested_on: '2026-10-01',
  effective_on: null,
  date_unknown: false,
  cancelled_on: null,
  utilizer_grant_id_fk: null,
  notes: null,
  deleted: false,
  utility: { id: 7 },
};
const user = { id: 42 } as never;

function build() {
  const events = {
    create: jest.fn().mockResolvedValue(saved),
    update: jest.fn().mockResolvedValue(saved),
    cancel: jest.fn().mockResolvedValue(saved),
    listByUtility: jest.fn().mockResolvedValue({ events: [], warnings: [] }),
  };
  const controller = new UtilitySupplyController(events as never, {} as never);
  return { controller, events };
}

describe('UtilitySupplyController', () => {
  afterEach(() => jest.restoreAllMocks());

  it('scrittura: risponde con lo storico riletto', async () => {
    const { controller, events } = build();
    const list = { events: [{ id: 12 }], warnings: ['x'] };
    events.listByUtility.mockResolvedValue(list);
    await expect(controller.create({} as never, user)).resolves.toBe(list);
    expect(events.listByUtility).toHaveBeenCalledWith(7);
  });

  it.each(['create', 'update', 'cancel'] as const)(
    '%s: rilettura fallita dopo il commit → 2xx con la riga salvata, stale, errore registrato',
    async (action) => {
      const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      const { controller, events } = build();
      events.listByUtility.mockRejectedValue(new Error('db giù'));
      const result =
        action === 'create'
          ? await controller.create({} as never, user)
          : action === 'update'
            ? await controller.update(12, {} as never, user)
            : await controller.cancel(12, user);
      expect(result.stale).toBe(true);
      expect(result.warnings).toEqual([]);
      expect(result.events).toHaveLength(1);
      expect(result.events[0]).toMatchObject({ id: 12, utility_id_fk: 7, third_party_name: null, grant_label: null });
      expect(result.events[0]).not.toHaveProperty('utility');
      expect(error).toHaveBeenCalledWith(expect.stringContaining('riga 12'), expect.any(Error));
    },
  );
});
