import { chmodSync, existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'fs';
import { basename, dirname, join } from 'path';

// Casella condivisa con il container Tinn (volume accounting_inbox, tinn/app/inbox.py):
// il container scrive i tre CSV, poi ready e status; UtenzePA scrive settings e
// request. Scritture con file .tmp + rename, mai letto un file a metà.

export const DEFAULT_INBOX_DIR = '/usr/src/app/accounting-inbox';

export const inboxDir = (): string => process.env.ACCOUNTING_INBOX_DIR || DEFAULT_INBOX_DIR;

export const INBOX_CSV = {
  chapters: 'capitoli.csv',
  commitments: 'impegni.csv',
  liquidations: 'liquidazioni.csv',
} as const;

export interface TinnStatus {
  state: 'running' | 'ok' | 'unchanged' | 'error';
  step: string | null;
  message: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  backupSha256: string | null;
  backupDate: string | null;
  nextRunAt: string | null;
}

export interface TinnReady {
  backupSha256: string;
  extractedAt: string | null;
}

function readJson(path: string): Record<string, unknown> | null {
  try {
    const data: unknown = JSON.parse(readFileSync(path, 'utf8'));
    return data && typeof data === 'object' && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

// Container presente = ha scritto almeno uno status.
export const inboxPresent = (dir: string): boolean => existsSync(join(dir, 'status'));

export function readStatus(dir: string): TinnStatus | null {
  const s = readJson(join(dir, 'status'));
  if (!s || !['running', 'ok', 'unchanged', 'error'].includes(s.state as string)) return null;
  return {
    state: s.state as TinnStatus['state'],
    step: str(s.step),
    message: str(s.message),
    startedAt: str(s.started_at),
    finishedAt: str(s.finished_at),
    backupSha256: str(s.backup_sha256),
    backupDate: str(s.backup_date),
    nextRunAt: str(s.next_run_at),
  };
}

export function readReady(dir: string): TinnReady | null {
  if (!existsSync(join(dir, 'ready'))) return null;
  const r = readJson(join(dir, 'ready'));
  return { backupSha256: str(r?.backup_sha256) ?? '', extractedAt: str(r?.extracted_at) };
}

export function readCsvs(dir: string): Record<keyof typeof INBOX_CSV, Buffer> | null {
  const paths = Object.entries(INBOX_CSV).map(([kind, name]) => [kind, join(dir, name)] as const);
  if (paths.some(([, path]) => !existsSync(path))) return null;
  return Object.fromEntries(paths.map(([kind, path]) => [kind, readFileSync(path)])) as Record<
    keyof typeof INBOX_CSV,
    Buffer
  >;
}

export function clearDelivery(dir: string): void {
  for (const name of [...Object.values(INBOX_CSV), 'ready']) {
    if (existsSync(join(dir, name))) unlinkSync(join(dir, name));
  }
}

// Consegna non caricabile: non si riprova da sola (fallirebbe uguale), aspetta
// la consegna successiva o «Esegui ora». I CSV restano per capire cosa è successo.
export function markFailed(dir: string): void {
  if (existsSync(join(dir, 'ready'))) renameSync(join(dir, 'ready'), join(dir, 'ready.failed'));
}

function writeAtomic(path: string, content: string): void {
  const tmp = join(dirname(path), `.${basename(path)}.tmp`);
  writeFileSync(tmp, content, { mode: 0o664 });
  chmodSync(tmp, 0o664);
  renameSync(tmp, path);
}

export function writeSettings(
  dir: string,
  settings: { from_year: number | null; loaded_sha256: string | null; loaded_at: string | null },
): void {
  writeAtomic(join(dir, 'settings'), JSON.stringify(settings));
}

export function requestRun(dir: string): void {
  writeAtomic(join(dir, 'request'), '');
}
