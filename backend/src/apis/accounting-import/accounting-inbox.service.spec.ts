import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { AccountingInboxService } from './accounting-inbox.service';

type State = {
  enabled: boolean;
  from_year: number | null;
  last_success_at: Date | null;
  last_loaded_sha256: string | null;
};

function setup(
  patch: Partial<State> = {},
  opts: {
    running?: boolean;
    fail?: boolean;
    refuse?: boolean;
    during?: (dir: string) => void;
  } = {},
) {
  const dir = mkdtempSync(join(tmpdir(), 'inbox-'));
  const state: State = {
    enabled: true,
    from_year: 2023,
    last_success_at: null,
    last_loaded_sha256: null,
    ...patch,
  };
  const states = {
    state: jest.fn(async () => state),
    isActive: jest.fn(async () => state.enabled),
    update: jest.fn(async (p: Partial<State>) => Object.assign(state, p)),
  };
  const importer = {
    isRunning: jest.fn(() => opts.running ?? false),
    tryRun: jest.fn(async () => {
      if (opts.fail) throw new Error('giro non riuscito');
      if (opts.refuse) return null;
      opts.during?.(dir);
      return { loaded: {}, issues: {}, steps: {} };
    }),
  };
  const service = new AccountingInboxService(importer as never, states as never, dir);
  return { dir, state, states, importer, service };
}

function writeStatus(dir: string, status: Record<string, unknown>) {
  writeFileSync(join(dir, 'status'), JSON.stringify(status));
}

function deliver(dir: string, sha = 'abc') {
  writeFileSync(join(dir, 'capitoli.csv'), 'c');
  writeFileSync(join(dir, 'impegni.csv'), 'i');
  writeFileSync(join(dir, 'liquidazioni.csv'), 'l');
  writeFileSync(
    join(dir, 'ready'),
    JSON.stringify({ extracted_at: '2026-10-28T04:10:00+01:00', backup_sha256: sha, rows: {} }),
  );
}

const settings = (dir: string) => JSON.parse(readFileSync(join(dir, 'settings'), 'utf8'));

describe('AccountingInboxService', () => {
  const dirs: string[] = [];
  afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));
  const make = (...args: Parameters<typeof setup>) => {
    const s = setup(...args);
    dirs.push(s.dir);
    return s;
  };

  it('senza status il container non c’è: nessun lavoro', async () => {
    const { dir, service, importer } = make();
    deliver(dir);
    expect(service.present()).toBe(false);
    expect(await service.check()).toBe('none');
    expect(importer.tryRun).not.toHaveBeenCalled();
  });

  it('carica i tre file, li cancella e salva lo sha caricato', async () => {
    const { dir, service, importer, state } = make();
    writeStatus(dir, { state: 'ok' });
    deliver(dir);
    expect(await service.check()).toBe('loaded');
    expect(importer.tryRun).toHaveBeenCalledWith({
      chapters: Buffer.from('c'),
      commitments: Buffer.from('i'),
      liquidations: Buffer.from('l'),
    });
    expect(readdirSync(dir).sort()).toEqual(['settings', 'status']);
    expect(state.last_loaded_sha256).toBe('abc');
    expect(state.last_success_at).toBeInstanceOf(Date);
    expect(settings(dir)).toEqual(
      expect.objectContaining({ from_year: 2023, loaded_sha256: 'abc' }),
    );
  });

  it("lascia i file se l'import è spento", async () => {
    const { dir, service, importer } = make({ enabled: false });
    writeStatus(dir, { state: 'ok' });
    deliver(dir);
    expect(await service.check()).toBe('off');
    expect(importer.tryRun).not.toHaveBeenCalled();
    expect(existsSync(join(dir, 'ready'))).toBe(true);
    expect(existsSync(join(dir, 'ready.failed'))).toBe(false);
  });

  it("lascia i file se manca l'anno di partenza", async () => {
    const { dir, service } = make({ from_year: null });
    writeStatus(dir, { state: 'ok' });
    deliver(dir);
    expect(await service.check()).toBe('off');
    expect(existsSync(join(dir, 'ready'))).toBe(true);
  });

  it('aspetta se un giro è in corso', async () => {
    const { dir, service, importer } = make({}, { running: true });
    writeStatus(dir, { state: 'ok' });
    deliver(dir);
    expect(await service.check()).toBe('busy');
    expect(importer.tryRun).not.toHaveBeenCalled();
    expect(existsSync(join(dir, 'ready'))).toBe(true);
  });

  it('caricamento fallito: ready.failed e niente nuovo tentativo', async () => {
    const { dir, service, importer } = make({}, { fail: true });
    writeStatus(dir, { state: 'ok' });
    deliver(dir);
    expect(await service.check()).toBe('failed');
    expect(existsSync(join(dir, 'ready'))).toBe(false);
    expect(existsSync(join(dir, 'ready.failed'))).toBe(true);
    expect(await service.check()).toBe('none');
    expect(importer.tryRun).toHaveBeenCalledTimes(1);
  });

  it('backup invariato già caricato conferma last_success_at', async () => {
    const { dir, service, state } = make({ last_loaded_sha256: 'abc' });
    writeStatus(dir, {
      state: 'unchanged',
      backup_sha256: 'abc',
      finished_at: '2026-10-28T04:02:00+01:00',
    });
    expect(await service.check()).toBe('confirmed');
    expect(state.last_success_at).toEqual(new Date('2026-10-28T04:02:00+01:00'));
    expect(await service.check()).toBe('none');
  });

  it('backup invariato non caricato non conferma', async () => {
    const { dir, service, state } = make({ last_loaded_sha256: 'old' });
    writeStatus(dir, {
      state: 'unchanged',
      backup_sha256: 'abc',
      finished_at: '2026-10-28T04:02:00+01:00',
    });
    expect(await service.check()).toBe('none');
    expect(state.last_success_at).toBeNull();
  });

  it("riscrive settings all'avvio", async () => {
    const { dir, service } = make({ from_year: 2024, last_loaded_sha256: 'abc' });
    writeStatus(dir, { state: 'ok' });
    writeFileSync(join(dir, 'settings'), 'rovinato');
    await service.onApplicationBootstrap();
    expect(settings(dir)).toEqual({ from_year: 2024, loaded_sha256: 'abc', loaded_at: null });
  });

  it('status rovinato = null', () => {
    const { dir, service } = make();
    writeFileSync(join(dir, 'status'), '{non json');
    expect(service.present()).toBe(true);
    expect(service.readStatus()).toBeNull();
  });

  it('status letto in camelCase', () => {
    const { dir, service } = make();
    writeStatus(dir, {
      state: 'error',
      step: 'download',
      message: 'Server SFTP non raggiungibile',
      started_at: 's',
      finished_at: 'f',
      backup_sha256: null,
      backup_date: null,
      next_run_at: 'n',
    });
    expect(service.readStatus()).toEqual({
      state: 'error',
      step: 'download',
      message: 'Server SFTP non raggiungibile',
      startedAt: 's',
      finishedAt: 'f',
      backupSha256: null,
      backupDate: null,
      nextRunAt: 'n',
    });
  });

  it('Esegui ora crea request', () => {
    const { dir, service } = make();
    service.requestRun();
    expect(existsSync(join(dir, 'request'))).toBe(true);
  });

  it('giro rifiutato al momento (manuale partito o import spento): file lasciati', async () => {
    const { dir, service } = make({}, { refuse: true });
    writeStatus(dir, { state: 'ok' });
    deliver(dir);
    expect(await service.check()).toBe('busy');
    expect(readdirSync(dir).sort()).toEqual([
      'capitoli.csv',
      'impegni.csv',
      'liquidazioni.csv',
      'ready',
      'settings',
      'status',
    ]);
  });

  it('consegna nuova arrivata durante il caricamento: resta per il giro dopo', async () => {
    const { dir, service, state } = make({}, { during: (d) => deliver(d, 'new') });
    writeStatus(dir, { state: 'ok' });
    deliver(dir, 'old');
    expect(await service.check()).toBe('loaded');
    expect(state.last_loaded_sha256).toBe('old');
    expect(existsSync(join(dir, 'ready'))).toBe(true);
    expect(existsSync(join(dir, 'capitoli.csv'))).toBe(true);
    expect(JSON.parse(readFileSync(join(dir, 'ready'), 'utf8')).backup_sha256).toBe('new');
  });

  it('consegna presa da un caricamento interrotto: ripresa al controllo dopo', async () => {
    const { dir, service, importer } = make();
    writeStatus(dir, { state: 'ok' });
    deliver(dir);
    renameSync(join(dir, 'ready'), join(dir, 'ready.loading'));
    expect(await service.check()).toBe('loaded');
    expect(importer.tryRun).toHaveBeenCalledTimes(1);
    expect(readdirSync(dir).sort()).toEqual(['settings', 'status']);
  });
});
