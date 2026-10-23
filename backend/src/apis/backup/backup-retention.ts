// Retention a scaglioni (nonno-padre-figlio): per ogni scaglione resta il
// backup più recente di ciascuno degli ultimi N giorni/settimane/mesi/anni
// in cui esiste almeno un backup. Contare i periodi con backup, non quelli
// di calendario, fa sì che un cron fermo per settimane non porti a cancellare
// tutto: gli ultimi backup restano finché non ne arrivano di nuovi.
// Un backup resta se lo tiene almeno uno scaglione; il più recente resta sempre.

export interface RetentionPolicy {
  daily: number;
  weekly: number;
  monthly: number;
  yearly: number;
}

export const DEFAULT_RETENTION: RetentionPolicy = { daily: 7, weekly: 4, monthly: 12, yearly: 0 };

const pad = (n: number) => n.toString().padStart(2, '0');

const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Settimana ISO 8601 (da lunedì; la settimana 1 contiene il primo giovedì).
function weekKey(d: Date): string {
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const weekday = (t.getDay() + 6) % 7;
  t.setDate(t.getDate() - weekday + 3);
  const isoYear = t.getFullYear();
  const firstThursday = new Date(isoYear, 0, 4);
  firstThursday.setDate(firstThursday.getDate() - ((firstThursday.getDay() + 6) % 7) + 3);
  const week = 1 + Math.round((t.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60 * 1000));
  return `${isoYear}-W${pad(week)}`;
}

const monthKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;

const yearKey = (d: Date) => `${d.getFullYear()}`;

/** Ritorna l'insieme dei backup da conservare. */
export function selectBackupsToKeep<T extends { createdAt: Date }>(
  backups: T[],
  policy: RetentionPolicy,
): Set<T> {
  const sorted = [...backups].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const keep = new Set<T>();
  if (sorted.length > 0) keep.add(sorted[0]);

  const tiers: [(d: Date) => string, number][] = [
    [dayKey, policy.daily],
    [weekKey, policy.weekly],
    [monthKey, policy.monthly],
    [yearKey, policy.yearly],
  ];
  for (const [key, limit] of tiers) {
    const seen = new Set<string>();
    for (const backup of sorted) {
      if (seen.size >= limit) break;
      const k = key(backup.createdAt);
      if (seen.has(k)) continue;
      seen.add(k);
      keep.add(backup);
    }
  }
  return keep;
}

function readCount(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function retentionPolicyFromEnv(): RetentionPolicy {
  return {
    daily: readCount('BACKUP_KEEP_DAILY', DEFAULT_RETENTION.daily),
    weekly: readCount('BACKUP_KEEP_WEEKLY', DEFAULT_RETENTION.weekly),
    monthly: readCount('BACKUP_KEEP_MONTHLY', DEFAULT_RETENTION.monthly),
    yearly: readCount('BACKUP_KEEP_YEARLY', DEFAULT_RETENTION.yearly),
  };
}
