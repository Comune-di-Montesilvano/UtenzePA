import { FireEquipmentDetails1794200000000 } from './migrations/1794200000000-FireEquipmentDetails';
import { IMPORTED_PREFIX, joinImportedNotes, splitImportedNotes } from './fire-equipment-notes';

describe('FireEquipmentDetails: note importate', () => {
  it('tre anni → tre date, nota con solo il prefisso', () => {
    expect(
      splitImportedNotes('scad. carica 2017; scad. collaudo 2018; ultima verifica 2014'),
    ).toEqual({ revision: 2017, test: 2018, check: 2014, notes: IMPORTED_PREFIX });
  });

  it('testo extra conservato dopo il prefisso', () => {
    expect(
      splitImportedNotes('scad. carica 2017; scad. collaudo 2017; ultima verifica 2014; armeria'),
    ).toEqual({ revision: 2017, test: 2017, check: 2014, notes: `${IMPORTED_PREFIX}; armeria` });
  });

  it('due anni soltanto', () => {
    expect(splitImportedNotes('scad. carica 2020; scad. collaudo 2025')).toEqual({
      revision: 2020,
      test: 2025,
      check: null,
      notes: IMPORTED_PREFIX,
    });
  });

  it('nota estranea, vuota o con anni fuori scala: nessuna conversione', () => {
    expect(splitImportedNotes('da riepilogo antincendio 2014')).toBeNull();
    expect(splitImportedNotes('carica 8; scad. carica 1600; scad. collaudo 4')).toBeNull();
    expect(splitImportedNotes(null)).toBeNull();
  });

  it('join ricompone la nota originale (giro up → down)', () => {
    for (const original of [
      'scad. carica 2017; scad. collaudo 2018; ultima verifica 2014',
      'scad. carica 2017; scad. collaudo 2017; ultima verifica 2014; armeria',
      'scad. carica 2020; scad. collaudo 2025',
    ]) {
      expect(joinImportedNotes(splitImportedNotes(original)!)).toBe(original);
    }
  });
});

describe('FireEquipmentDetails: up/down', () => {
  const runner = (rows: unknown[], newTypes = 0) => {
    const sqls: string[] = [];
    const params: unknown[][] = [];
    const query = jest.fn(async (sql: string, p?: unknown[]) => {
      sqls.push(sql);
      if (p) params.push(p);
      if (sql.includes('/* select-notes */') || sql.includes('/* select-dates */')) return rows;
      if (sql.includes('/* count-new-types */')) return [{ n: newTypes }];
      return [];
    });
    return { q: { query } as never, sqls, params };
  };

  it('up: enum esteso, colonne aggiunte, note convertite', async () => {
    const { q, sqls, params } = runner([
      { id: 1, notes: 'scad. carica 2017; scad. collaudo 2018; ultima verifica 2014' },
      { id: 2, notes: 'altro' },
    ]);
    await new FireEquipmentDetails1794200000000().up(q);
    const all = sqls.join('\n');
    expect(all).toContain("'SMOKE_DETECTOR'");
    expect(all).toContain('ADD `quantity` int NOT NULL DEFAULT 1');
    expect(all).toContain('ADD `last_check_on` date NULL');
    expect(all).toContain('`deleted` = 0');
    expect(params).toContainEqual(['2017-01-01', '2018-01-01', '2014-01-01', IMPORTED_PREFIX, 1]);
    expect(params.some((p) => p[4] === 2)).toBe(false);
  });

  it('down: note ricomposte, nuovi tipi eliminati, colonne tolte', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { q, sqls, params } = runner(
      [{ id: 1, r: 2017, t: 2018, c: 2014, notes: IMPORTED_PREFIX }],
      3,
    );
    await new FireEquipmentDetails1794200000000().down(q);
    const all = sqls.join('\n');
    expect(params).toContainEqual(['scad. carica 2017; scad. collaudo 2018; ultima verifica 2014', 1]);
    expect(all).toContain('DELETE FROM `plant_fire_equipment` WHERE `equipment_type` IN');
    expect(all).toContain('DROP COLUMN `quantity`');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('3 presidi'));
    warn.mockRestore();
  });
});
