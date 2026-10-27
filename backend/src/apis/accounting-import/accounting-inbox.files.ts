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

// Container presente = ha scritto uno status e il suo prossimo giro non è passato
// da più di 7 giorni: tolto il profilo, lo status vecchio resta nel volume e la
// sezione e la segnalazione sparirebbero mai. Per una settimana la segnalazione
// «non aggiornata» resta (scatta dopo 2 giorni).
const ABANDONED_MS = 7 * 24 * 60 * 60 * 1000;

export function inboxPresent(dir: string, now = new Date()): boolean {
  if (!existsSync(join(dir, 'status'))) return false;
  const next = str(readJson(join(dir, 'status'))?.next_run_at);
  if (!next) return true;
  const at = new Date(next).getTime();
  return Number.isNaN(at) || now.getTime() - at <= ABANDONED_MS;
}

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

export function readReady(dir: string, name = 'ready'): TinnReady | null {
  if (!existsSync(join(dir, name))) return null;
  const r = readJson(join(dir, name));
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

// Consegna presa in carico: ready → ready.loading prima di leggere i CSV. Se nel
// frattempo il container consegna di nuovo (nuovo ready), quella resta intatta.
const LOADING = 'ready.loading';

export function claimDelivery(dir: string): void {
  renameSync(join(dir, 'ready'), join(dir, LOADING));
}

// Caricamento interrotto (API riavviata) o rimandato: la consegna torna in attesa,
// salvo che ne sia arrivata una nuova.
export function releaseClaim(dir: string): void {
  if (!existsSync(join(dir, LOADING))) return;
  if (existsSync(join(dir, 'ready'))) unlinkSync(join(dir, LOADING));
  else renameSync(join(dir, LOADING), join(dir, 'ready'));
}

export function claimPending(dir: string): boolean {
  return existsSync(join(dir, LOADING));
}

// Caricata: si tolgono i CSV solo se non è arrivata una consegna nuova.
export function clearDelivery(dir: string): void {
  if (existsSync(join(dir, LOADING))) unlinkSync(join(dir, LOADING));
  if (existsSync(join(dir, 'ready'))) return;
  for (const name of Object.values(INBOX_CSV)) {
    if (existsSync(join(dir, name))) unlinkSync(join(dir, name));
  }
}

// Consegna non caricabile: non si riprova da sola (fallirebbe uguale), aspetta
// la consegna successiva o «Esegui ora». I CSV restano per capire cosa è successo.
export function markFailed(dir: string): void {
  if (!existsSync(join(dir, LOADING))) return;
  if (existsSync(join(dir, 'ready'))) unlinkSync(join(dir, LOADING));
  else renameSync(join(dir, LOADING), join(dir, 'ready.failed'));
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
