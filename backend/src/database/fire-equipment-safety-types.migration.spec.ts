import { FireEquipmentSafetyTypes1794400000000 } from './migrations/1794400000000-FireEquipmentSafetyTypes';

describe('FireEquipmentSafetyTypes', () => {
  const runner = (n = 0) => {
    const sqls: string[] = [];
    const query = jest.fn(async (sql: string) => {
      sqls.push(sql);
      return sql.includes('COUNT(*)') ? [{ n }] : [];
    });
    return { q: { query } as never, sqls };
  };

  it('up: porte REI, maniglioni, segnaletica e lampade di emergenza nell\'enum', async () => {
    const { q, sqls } = runner();
    await new FireEquipmentSafetyTypes1794400000000().up(q);
    for (const t of ['FIRE_DOOR', 'PANIC_BAR', 'EXIT_SIGN', 'EMERGENCY_LIGHT', 'SMOKE_DETECTOR']) {
      expect(sqls.join('\n')).toContain(`'${t}'`);
    }
  });

  it('down: righe dei quattro tipi eliminate prima di restringere l\'enum', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { q, sqls } = runner(5);
    await new FireEquipmentSafetyTypes1794400000000().down(q);
    const del = sqls.findIndex((s) => s.startsWith('DELETE'));
    const alter = sqls.findIndex((s) => s.startsWith('ALTER'));
    expect(del).toBeGreaterThanOrEqual(0);
    expect(del).toBeLessThan(alter);
    expect(sqls[alter]).not.toContain('FIRE_DOOR');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('5 presidi'));
    warn.mockRestore();
  });
});
