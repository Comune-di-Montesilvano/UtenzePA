import { retentionPolicyFromEnv, selectBackupsToKeep } from './backup-retention';

const at = (y: number, m: number, d: number, h = 0) => ({
  name: `${y}-${m}-${d} ${h}`,
  createdAt: new Date(y, m - 1, d, h),
});

function everyDay(from: Date, to: Date) {
  const out: ReturnType<typeof at>[] = [];
  for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
    out.push(at(d.getFullYear(), d.getMonth() + 1, d.getDate()));
  }
  return out;
}

const kept = (
  backups: ReturnType<typeof at>[],
  policy: Parameters<typeof selectBackupsToKeep>[1],
) => [...selectBackupsToKeep(backups, policy)].map((b) => b.name).sort();

describe('selectBackupsToKeep', () => {
  it('tiene il più recente di ciascun giorno, settimana e mese', () => {
    const backups = everyDay(new Date(2026, 0, 1), new Date(2026, 2, 31));
    const result = kept(backups, { daily: 7, weekly: 4, monthly: 3, yearly: 0 });
    expect(result).toEqual(
      [
        '2026-3-25 0',
        '2026-3-26 0',
        '2026-3-27 0',
        '2026-3-28 0',
        '2026-3-29 0',
        '2026-3-30 0',
        '2026-3-31 0',
        '2026-3-22 0',
        '2026-3-15 0',
        '2026-2-28 0',
        '2026-1-31 0',
      ].sort(),
    );
  });

  it('nello stesso giorno tiene solo il backup più recente', () => {
    const result = kept([at(2026, 5, 1, 0), at(2026, 5, 1, 14), at(2026, 4, 30, 0)], {
      daily: 2,
      weekly: 0,
      monthly: 0,
      yearly: 0,
    });
    expect(result).toEqual(['2026-4-30 0', '2026-5-1 14']);
  });

  it('conta i periodi con un backup, non il calendario: un cron fermo non svuota la cartella', () => {
    const backups = [at(2020, 1, 1), at(2020, 1, 2), at(2020, 1, 3)];
    expect(kept(backups, { daily: 7, weekly: 0, monthly: 0, yearly: 0 })).toHaveLength(3);
  });

  it('con tutti gli scaglioni a 0 resta solo il più recente', () => {
    const backups = [at(2026, 1, 1), at(2026, 2, 1), at(2026, 3, 1)];
    expect(kept(backups, { daily: 0, weekly: 0, monthly: 0, yearly: 0 })).toEqual(['2026-3-1 0']);
  });

  it('usa le settimane ISO anche a cavallo d’anno', () => {
    // 28/12/2026 (lunedì) e 3/1/2027 (domenica) sono entrambi nella settimana 53 del 2026.
    const backups = [at(2026, 12, 27), at(2026, 12, 28), at(2027, 1, 3)];
    expect(kept(backups, { daily: 0, weekly: 2, monthly: 0, yearly: 0 })).toEqual([
      '2026-12-27 0',
      '2027-1-3 0',
    ]);
  });

  it('tiene il più recente di ogni anno', () => {
    const backups = [at(2024, 3, 1), at(2024, 6, 1), at(2025, 6, 1), at(2026, 6, 1)];
    expect(kept(backups, { daily: 0, weekly: 0, monthly: 0, yearly: 2 })).toEqual([
      '2025-6-1 0',
      '2026-6-1 0',
    ]);
  });
});

describe('retentionPolicyFromEnv', () => {
  const vars = [
    'BACKUP_KEEP_DAILY',
    'BACKUP_KEEP_WEEKLY',
    'BACKUP_KEEP_MONTHLY',
    'BACKUP_KEEP_YEARLY',
  ];
  afterEach(() => vars.forEach((v) => delete process.env[v]));

  it('usa i default se le variabili mancano o non sono valide', () => {
    process.env.BACKUP_KEEP_WEEKLY = 'abc';
    process.env.BACKUP_KEEP_MONTHLY = '-1';
    expect(retentionPolicyFromEnv()).toEqual({ daily: 7, weekly: 4, monthly: 12, yearly: 0 });
  });

  it('legge i valori impostati, 0 compreso', () => {
    process.env.BACKUP_KEEP_DAILY = '14';
    process.env.BACKUP_KEEP_WEEKLY = '0';
    process.env.BACKUP_KEEP_YEARLY = '5';
    expect(retentionPolicyFromEnv()).toEqual({ daily: 14, weekly: 0, monthly: 12, yearly: 5 });
  });
});
