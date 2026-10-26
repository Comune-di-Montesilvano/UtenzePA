import { assertCanChange, assertCanCreate, ACCOUNTING_LOCKED_MESSAGE, changedFields } from './accounting-lock';
import { RecordSource } from './record-source.enum';

const state = (active: boolean) => ({ isActive: jest.fn(async () => active) }) as never;

describe('accounting-lock', () => {
  it('changedFields: importi al centesimo, vuoto = null, campi assenti ignorati', () => {
    expect(
      changedFields({ a: '10.00', b: null, c: 'X', d: 1 }, { a: 10, b: '', c: 'Y' }, ['a', 'b', 'c', 'd']),
    ).toEqual(['c']);
  });

  it('assertCanCreate: 400 solo con import attivo', async () => {
    await expect(assertCanCreate(state(true))).rejects.toThrow(ACCOUNTING_LOCKED_MESSAGE);
    await expect(assertCanCreate(state(false))).resolves.toBeUndefined();
    await expect(assertCanCreate(undefined)).resolves.toBeUndefined();
  });

  it('assertCanChange: 400 solo su dato importato, cambiato, import attivo', async () => {
    const acc = { source: RecordSource.ACCOUNTING };
    await expect(assertCanChange(state(true), acc, true)).rejects.toThrow(ACCOUNTING_LOCKED_MESSAGE);
    await expect(assertCanChange(state(true), acc, false)).resolves.toBeUndefined();
    await expect(assertCanChange(state(false), acc, true)).resolves.toBeUndefined();
    await expect(assertCanChange(state(true), { source: RecordSource.MANUAL }, true)).resolves.toBeUndefined();
  });
});
