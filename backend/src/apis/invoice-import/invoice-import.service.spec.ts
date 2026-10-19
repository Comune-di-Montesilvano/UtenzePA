import { maintenance } from '@common/maintenance/maintenance';
import { SdiStatus } from '@apis/invoices/enum/sdi-status.enum';
import { InvoiceImportService } from './invoice-import.service';
import { SdiMessageStatus } from './enum/sdi-message-status.enum';
import type { PecMailbox } from './pec-imap.client';
import {
  attachment,
  envelope,
  fixture,
  invoiceEml,
  mail,
  notificationEml,
  text,
} from './sdi/fixtures/eml';
import { structureKey } from './pattern/pattern-rules';

type Row = Record<string, unknown>;

// Repository in memoria: solo i metodi usati dal service.
function fakeRepo(rows: Row[] = []) {
  const matches = (row: Row, where: Row) => Object.entries(where).every(([k, v]) => row[k] === v);
  let nextId = rows.length + 1;
  const updates: { criteria: unknown; patch: Row }[] = [];
  return {
    rows,
    updates,
    findOneBy: jest.fn(async (where: Row) => rows.find((r) => matches(r, where)) ?? null),
    findBy: jest.fn(async (where: Row) => rows.filter((r) => matches(r, where))),
    find: jest.fn(async ({ where }: { where: Row }) => rows.filter((r) => matches(r, where))),
    save: jest.fn(async (entity: Row) => {
      if (!entity.id) {
        entity.id = nextId++;
        entity.create_date = entity.create_date ?? new Date();
        rows.push(entity);
      }
      return entity;
    }),
    update: jest.fn(async (criteria: number | Row, patch: Row) => {
      updates.push({ criteria, patch });
      const where = typeof criteria === 'number' ? { id: criteria } : criteria;
      for (const row of rows.filter((r) => matches(r, where))) {
        for (const [k, v] of Object.entries(patch)) if (typeof v !== 'function') row[k] = v;
      }
      return { affected: 1 };
    }),
  };
}

function fakeMailbox(messages: { uid: number; raw: Buffer }[], uidValidity = 7, failAt?: number) {
  const box = {
    opened: 0,
    open: jest.fn(async () => {
      box.opened++;
      return { uidValidity };
    }),
    fetchSince: jest.fn(async function* (lastUid: number) {
      for (const m of messages.filter((x) => x.uid > lastUid)) {
        if (m.uid === failAt) throw new Error('connessione persa');
        yield m;
      }
    }),
    fetchRaw: jest.fn(async () => null),
    close: jest.fn(async () => undefined),
  };
  return box;
}

const noLinker = { link: jest.fn(async () => ({ issues: [], utilityIds: [] })), unlink: jest.fn(async () => []) };
const noRecalc = { recalcUtility: jest.fn() };

const ENV = {
  PEC_IMAP_HOST: 'imap.prova.it',
  PEC_IMAP_USER: 'sdi@prova.it',
  PEC_IMAP_PASSWORD: 'x',
};

describe('InvoiceImportService.runOnce', () => {
  let state: ReturnType<typeof fakeRepo>;
  let messages: ReturnType<typeof fakeRepo>;
  let invoices: ReturnType<typeof fakeRepo>;
  let query: jest.Mock;
  let mailbox: ReturnType<typeof fakeMailbox>;
  const savedEnv = { ...process.env };

  const service = () =>
    new InvoiceImportService(
      state as never,
      messages as never,
      invoices as never,
      { query, transaction: (cb: (m: unknown) => unknown) => cb({}) } as never,
      () => mailbox as unknown as PecMailbox,
      fakeRepo() as never,
      {} as never,
      {} as never,
      noLinker as never,
      noRecalc as never,
    );

  beforeEach(() => {
    Object.assign(process.env, ENV);
    delete process.env.INVOICE_IMPORT_DISABLED;
    state = fakeRepo([{ id: 1, enabled: true, uid_validity: null, last_uid: null }]);
    messages = fakeRepo();
    invoices = fakeRepo([
      {
        id: 50,
        supplier_id_fk: 9,
        invoice_id: 'FPR 1/26',
        invoice_date: '2026-07-10',
        deleted: false,
        sdi_identifier: null,
        sdi_status: null,
      },
    ]);
    // Perimetro: la P.IVA 01234567897 è il fornitore 9.
    query = jest.fn(async (sql: string, params?: unknown[]) =>
      sql.includes('FROM third_parties') && params?.[0] === '01234567897' ? [{ id: 9 }] : [],
    );
    mailbox = fakeMailbox([]);
  });

  afterEach(() => {
    process.env = { ...savedEnv };
    maintenance.end();
  });

  it.each([
    ['non configurato', () => delete process.env.PEC_IMAP_HOST],
    ['spento', () => (state.rows[0].enabled = false)],
    ['forzato spento', () => (process.env.INVOICE_IMPORT_DISABLED = 'true')],
    ['in manutenzione', () => maintenance.start()],
  ])('%s: non si collega', async (_label, setup) => {
    setup();
    await service().runOnce();
    expect(mailbox.open).not.toHaveBeenCalled();
  });

  it('fornitore fuori perimetro: registrato, nessuna fattura toccata', async () => {
    query.mockResolvedValue([]);
    mailbox = fakeMailbox([{ uid: 1, raw: invoiceEml('<m1@pec>') }]);
    await service().runOnce();
    expect(messages.rows).toHaveLength(1);
    expect(messages.rows[0]).toMatchObject({
      kind: 'INVOICE',
      status: SdiMessageStatus.OUT_OF_SCOPE,
      supplier_vat: '01234567897',
    });
    expect(invoices.update).not.toHaveBeenCalled();
  });

  it('fattura presente: collegata, ricevuta, senza toccare l’ultima modifica', async () => {
    mailbox = fakeMailbox([{ uid: 1, raw: invoiceEml('<m1@pec>') }]);
    const result = await service().runOnce();
    expect(result).toEqual({ processed: 1, linked: 1, pending: 0, extracted: 0 });
    expect(messages.rows[0]).toMatchObject({
      status: SdiMessageStatus.LINKED,
      sdi_identifier: '99000000001',
      supplier_id_fk: 9,
      document_number: 'FPR 1/26',
    });
    expect(invoices.rows[0]).toMatchObject({
      sdi_identifier: '99000000001',
      sdi_status: SdiStatus.RECEIVED,
    });
    expect(invoices.updates.every((u) => typeof u.patch.update_date === 'function')).toBe(true);
    expect(state.rows[0]).toMatchObject({ uid_validity: '7', last_uid: '1', last_error: null });
    expect(state.rows[0].last_success_at).toBeInstanceOf(Date);
  });

  it('fattura assente: in attesa', async () => {
    invoices.rows.length = 0;
    mailbox = fakeMailbox([{ uid: 1, raw: invoiceEml('<m1@pec>') }]);
    expect(await service().runOnce()).toEqual({
      processed: 1,
      linked: 0,
      pending: 1,
      extracted: 0,
    });
    expect(messages.rows[0].status).toBe(SdiMessageStatus.PENDING);
  });

  it('rifiuto arrivato prima del collegamento: applicato quando la fattura arriva', async () => {
    mailbox = fakeMailbox([
      {
        uid: 1,
        raw: notificationEml(
          '<r1@pec>',
          'IT01234567897_a1B2c_EC_001.xml',
          'ec02.xml',
          'Mon, 13 Jul 2026 09:00:00 +0200',
        ),
      },
    ]);
    await service().runOnce();
    expect(messages.rows[0]).toMatchObject({
      kind: 'EC',
      outcome: 'EC02',
      status: SdiMessageStatus.NOTIFICATION,
    });
    mailbox = fakeMailbox([
      { uid: 2, raw: invoiceEml('<m1@pec>', 'Fri, 10 Jul 2026 09:00:00 +0200') },
    ]);
    await service().runOnce();
    expect(invoices.rows[0].sdi_status).toBe(SdiStatus.REJECTED);
  });

  it('messaggio riletto dopo il cambio di UIDVALIDITY: nessun doppione', async () => {
    mailbox = fakeMailbox([{ uid: 1, raw: invoiceEml('<m1@pec>') }], 7);
    await service().runOnce();
    mailbox = fakeMailbox([{ uid: 5, raw: invoiceEml('<m1@pec>') }], 8);
    await service().runOnce();
    expect(mailbox.fetchSince).toHaveBeenCalledWith(0);
    expect(messages.rows).toHaveLength(1);
    expect(state.rows[0]).toMatchObject({ uid_validity: '8', last_uid: '5' });
  });

  it('errore a metà giro: riprende dall’ultimo messaggio elaborato', async () => {
    const previousSuccess = new Date(2026, 6, 1);
    state.rows[0].last_success_at = previousSuccess;
    mailbox = fakeMailbox(
      [
        { uid: 1, raw: invoiceEml('<m1@pec>') },
        { uid: 2, raw: notificationEml('<r1@pec>', 'IT01234567897_a1B2c_DT_001.xml', 'dt.xml') },
        { uid: 3, raw: notificationEml('<r2@pec>', 'IT01234567897_a1B2c_EC_001.xml', 'ec01.xml') },
      ],
      7,
      3,
    );
    await service().runOnce();
    expect(state.rows[0].last_uid).toBe('2');
    expect(state.rows[0].last_error).toBe('connessione persa');
    expect(state.rows[0].last_success_at).toBe(previousSuccess);
    expect(mailbox.close).toHaveBeenCalled();
  });

  it('fattura inserita dopo il messaggio: collegata al giro successivo', async () => {
    messages.rows.push({
      id: 1,
      kind: 'INVOICE',
      status: SdiMessageStatus.PENDING,
      sdi_identifier: '99000000001',
      supplier_id_fk: 9,
      document_number: 'FPR 1/26',
      document_date: '2026-07-10',
      received_at: new Date(2026, 6, 10),
    });
    query.mockImplementation(async (sql: string) =>
      sql.includes("m.status = 'PENDING'")
        ? [{ id: 1, sdi_identifier: '99000000001', invoice_id: 50 }]
        : [],
    );
    const result = await service().runOnce();
    expect(result.linked).toBe(1);
    expect(messages.rows[0].status).toBe(SdiMessageStatus.LINKED);
    expect(invoices.rows[0]).toMatchObject({
      sdi_identifier: '99000000001',
      sdi_status: SdiStatus.RECEIVED,
    });
    expect(invoices.updates.every((u) => typeof u.patch.update_date === 'function')).toBe(true);
  });

  it('errore prima della casella: registrato, nessuna eccezione', async () => {
    query.mockRejectedValue(new Error('db giù'));
    await expect(service().runOnce()).resolves.toEqual({
      processed: 0,
      linked: 0,
      pending: 0,
      extracted: 0,
    });
    expect(state.rows[0].last_error).toBe('db giù');
  });

  it('giro già in corso: il secondo esce senza collegarsi', async () => {
    let release: () => void = () => undefined;
    mailbox = fakeMailbox([]);
    mailbox.open.mockImplementationOnce(
      () => new Promise((resolve) => (release = () => resolve({ uidValidity: 7 }))),
    );
    const svc = service();
    const first = svc.runOnce();
    // Il primo giro arriva alla casella dopo le query sul DB.
    while (!mailbox.open.mock.calls.length) await new Promise((r) => setImmediate(r));
    await svc.runOnce();
    expect(mailbox.open).toHaveBeenCalledTimes(1);
    release();
    await first;
  });
});

const PRICE_RULES = { header: {}, line: { amount: { kind: 'field', path: 'PrezzoTotale' } } };
const pricePattern = (over: Row = {}) => ({
  id: 3,
  supplier_id_fk: 9,
  deleted: false,
  ignored: false,
  rules: PRICE_RULES,
  paths_count: 1,
  structure_key: 'x',
  ...over,
});

describe('InvoiceImportService con i pattern', () => {
  let state: ReturnType<typeof fakeRepo>;
  let messages: ReturnType<typeof fakeRepo>;
  let invoices: ReturnType<typeof fakeRepo>;
  let patterns: ReturnType<typeof fakeRepo>;
  let query: jest.Mock;
  let mailbox: ReturnType<typeof fakeMailbox>;
  let matcher: { match: jest.Mock };
  let applier: { apply: jest.Mock; importUserId: jest.Mock };
  let linker: { link: jest.Mock; unlink: jest.Mock };
  let recalc: { recalcUtility: jest.Mock };
  const savedEnv = { ...process.env };
  const manager = {};

  const service = () =>
    new InvoiceImportService(
      state as never,
      messages as never,
      invoices as never,
      { query, transaction: (cb: (m: unknown) => unknown) => cb(manager) } as never,
      () => mailbox as unknown as PecMailbox,
      patterns as never,
      matcher as never,
      applier as never,
      linker as never,
      recalc as never,
    );

  beforeEach(() => {
    Object.assign(process.env, ENV);
    delete process.env.INVOICE_IMPORT_DISABLED;
    state = fakeRepo([{ id: 1, enabled: true, uid_validity: null, last_uid: null }]);
    messages = fakeRepo();
    invoices = fakeRepo();
    patterns = fakeRepo();
    query = jest.fn(async (sql: string, params?: unknown[]) =>
      sql.includes('FROM third_parties') && params?.[0] === '01234567897' ? [{ id: 9 }] : [],
    );
    mailbox = fakeMailbox([{ uid: 1, raw: invoiceEml('<m1@pec>') }]);
    matcher = {
      match: jest.fn(async () => ({
        supplierId: 9,
        existingInvoiceId: null,
        contratto_id_fk: null,
        lines: [],
        issues: [],
      })),
    };
    applier = {
      apply: jest.fn(async () => {
        invoices.rows.push({
          id: 77,
          deleted: false,
          sdi_identifier: '99000000001',
          import_locked: false,
        });
        return 77;
      }),
      importUserId: jest.fn(async () => 1),
    };
    linker = {
      link: jest.fn(async () => ({ issues: [], utilityIds: [812] })),
      unlink: jest.fn(async () => [812]),
    };
    recalc = { recalcUtility: jest.fn() };
  });

  afterEach(() => {
    process.env = { ...savedEnv };
  });

  it('fattura estratta poi rifiutata: consumi tolti e utenza ricalcolata', async () => {
    patterns.rows.push(pricePattern());
    mailbox = fakeMailbox([
      { uid: 1, raw: invoiceEml('<m1@pec>') },
      { uid: 2, raw: notificationEml('<n1@pec>', 'IT01234567897_a1B2c_EC_001.xml', 'ec02.xml') },
    ]);
    await service().runOnce();
    expect(invoices.rows[0].sdi_status).toBe(SdiStatus.REJECTED);
    expect(linker.unlink).toHaveBeenCalledWith(manager, 77);
    expect(recalc.recalcUtility).toHaveBeenCalledWith(812);
  });

  it('rifiuto superato (scarto dell’esito): consumi ricollegati', async () => {
    messages.rows.push({ id: 40, kind: 'INVOICE', status: SdiMessageStatus.EXTRACTED, invoice_id_fk: 77, sdi_identifier: '99000000001' });
    invoices.rows.push({ id: 77, deleted: false, sdi_identifier: '99000000001', sdi_status: SdiStatus.REJECTED, import_locked: false, updated_by_user_id: 7 });
    mailbox = fakeMailbox([
      { uid: 2, raw: notificationEml('<n1@pec>', 'IT01234567897_a1B2c_EC_001.xml', 'ec02.xml', 'Fri, 10 Jul 2026 10:00:00 +0200') },
      { uid: 3, raw: notificationEml('<n2@pec>', 'IT01234567897_a1B2c_SE_001.xml', 'se.xml', 'Fri, 10 Jul 2026 11:00:00 +0200') },
    ]);
    await service().runOnce();
    expect(invoices.rows[0].sdi_status).not.toBe(SdiStatus.REJECTED);
    expect(linker.link).toHaveBeenCalledWith(manager, 77, 7, []);
  });

  it('pattern che riconosce la fattura: estratta e scritta, struttura registrata', async () => {
    patterns.rows.push(pricePattern());
    const result = await service().runOnce();
    expect(result.extracted).toBe(1);
    expect(applier.apply).toHaveBeenCalledWith(
      expect.objectContaining({ file_name: 'IT01234567897_a1B2c.xml.p7m' }),
      expect.objectContaining({ number: 'FPR 1/26' }),
      expect.anything(),
      3,
      1,
    );
    expect(messages.rows[0]).toMatchObject({
      status: SdiMessageStatus.EXTRACTED,
      structure_key: structureKey(fixture('fattura.xml')),
    });
    expect(invoices.rows[0].sdi_status).toBe(SdiStatus.RECEIVED);
  });

  it('struttura ignorata dal fornitore: nessuna fattura scritta', async () => {
    patterns.rows.push(
      pricePattern({
        id: 4,
        ignored: true,
        rules: null,
        structure_key: structureKey(fixture('fattura.xml')),
      }),
    );
    await service().runOnce();
    expect(applier.apply).not.toHaveBeenCalled();
    expect(messages.rows[0].status).toBe(SdiMessageStatus.IGNORED);
  });

  it('nessun pattern: comportamento della parte 1 (in attesa)', async () => {
    await service().runOnce();
    expect(applier.apply).not.toHaveBeenCalled();
    expect(messages.rows[0].status).toBe(SdiMessageStatus.PENDING);
  });

  it('nessun amministratore attivo: errore sul messaggio, nessuna fattura', async () => {
    patterns.rows.push(pricePattern());
    applier.importUserId.mockResolvedValue(null);
    await service().runOnce();
    expect(applier.apply).not.toHaveBeenCalled();
    expect(messages.rows[0]).toMatchObject({
      status: SdiMessageStatus.ERROR,
      error: 'Nessun amministratore per le fatture importate',
    });
  });

  it('lotto con più fatture: non estratto, segnalato', async () => {
    patterns.rows.push(pricePattern());
    const xml = fixture('fattura.xml').toString('utf8');
    const body = /<FatturaElettronicaBody>[\s\S]*<\/FatturaElettronicaBody>/.exec(xml)![0];
    const lot = Buffer.from(xml.replace(body, body + body));
    mailbox = fakeMailbox([
      {
        uid: 1,
        raw: envelope(
          mail('Subject: Invio File 99000000002\r\n', 'INTERNA', [
            text('INTERNA', 'Invio file'),
            attachment('INTERNA', 'IT01234567897_b1B2c.xml', lot),
          ]),
          'POSTA CERTIFICATA: Invio File 99000000002',
          '<lotto@pec>',
        ),
      },
    ]);
    await service().runOnce();
    expect(applier.apply).not.toHaveBeenCalled();
    expect(messages.rows[0].status).toBe(SdiMessageStatus.PENDING);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO invoice_import_issues'),
      [messages.rows[0].id, 'BATCH_NOT_SUPPORTED', expect.any(String)],
    );
  });

  describe('reprocess', () => {
    const stored = (id: number, uid: string, over: Row = {}) => ({
      id,
      kind: 'INVOICE',
      status: SdiMessageStatus.PENDING,
      supplier_id_fk: 9,
      sdi_identifier: `9900000000${id}`,
      uid_validity: '7',
      uid,
      message_id: `<m${id}@pec>`,
      file_name: 'IT01234567897_a1B2c.xml.p7m',
      invoice_id_fk: null,
      ...over,
    });

    beforeEach(() => {
      patterns.rows.push(pricePattern());
      messages.rows.push(
        stored(1, '1'),
        stored(2, '2', { status: SdiMessageStatus.EXTRACTED, invoice_id_fk: 60 }),
        stored(3, '3'),
      );
      invoices.rows.push({ id: 60, deleted: false, import_locked: true });
      mailbox.fetchRaw.mockImplementation((async (_v: number, uid: number) =>
        uid === 3 ? null : invoiceEml('<m@pec>')) as never);
    });

    it('estrae i messaggi ancora sulla PEC, salta spariti e fatture modificate a mano', async () => {
      expect(await service().reprocess([1, 2, 3])).toEqual({ extracted: 1, skipped: 2, queued: 0 });
      expect(applier.apply).toHaveBeenCalledTimes(1);
      expect(mailbox.open).toHaveBeenCalledTimes(1);
    });

    it('fattura importata poi eliminata: non si ricrea rielaborando', async () => {
      messages.rows.push(stored(4, '4', { status: SdiMessageStatus.EXTRACTED, invoice_id_fk: 61 }));
      invoices.rows.push({ id: 61, deleted: true, import_locked: false });
      expect(await service().reprocess([4])).toEqual({ extracted: 0, skipped: 1, queued: 0 });
      expect(applier.apply).not.toHaveBeenCalled();
    });

    it('con un giro in corso: in coda, elaborati alla fine del giro', async () => {
      mailbox = fakeMailbox([]);
      mailbox.fetchRaw.mockImplementation((async () => invoiceEml('<m@pec>')) as never);
      const svc = service();
      let queued: unknown;
      mailbox.fetchSince.mockImplementation(async function* () {
        queued = await svc.reprocess([1]);
      } as never);
      await svc.runOnce();
      expect(queued).toEqual({ extracted: 0, skipped: 0, queued: 1 });
      expect(applier.apply).toHaveBeenCalledTimes(1);
    });

    it('struttura mancante sui messaggi della parte 1: completata a ogni giro', async () => {
      mailbox = fakeMailbox([]);
      mailbox.fetchRaw.mockImplementation((async () => invoiceEml('<m@pec>')) as never);
      patterns.rows.length = 0;
      messages.rows.length = 0;
      messages.rows.push(stored(1, '1', { structure_key: null }));
      query.mockImplementation(async (sql: string) =>
        sql.includes('structure_key IS NULL') ? [{ id: 1 }] : [],
      );
      await service().runOnce();
      expect(messages.rows[0].structure_key).toBe(structureKey(fixture('fattura.xml')));
    });
  });
});

describe('InvoiceImportService.getStatus', () => {
  it('conteggi per esito e ultimi messaggi in errore', async () => {
    const created = new Date('2026-10-19T10:00:00Z');
    const query = jest.fn(async (sql: string) =>
      sql.includes('GROUP BY status')
        ? [{ status: 'LINKED', total: '3' }]
        : sql.includes("status = 'ERROR'")
          ? [{ file_name: 'IT01234567897_x.xml', error: 'XML illeggibile', create_date: created }]
          : [],
    );
    const service = new InvoiceImportService(
      fakeRepo([{ id: 1, enabled: true }]) as never,
      fakeRepo() as never,
      fakeRepo() as never,
      { query } as never,
      () => ({}) as PecMailbox,
      fakeRepo() as never,
      {} as never,
      {} as never,
      noLinker as never,
      noRecalc as never,
    );
    const status = await service.getStatus();
    expect(status.counts).toEqual({ LINKED: 3 });
    expect(status.recentErrors).toEqual([
      { file_name: 'IT01234567897_x.xml', error: 'XML illeggibile', create_date: created },
    ]);
  });
});

describe('InvoiceImportService.getDocument', () => {
  const savedEnv = { ...process.env };
  let messages: ReturnType<typeof fakeRepo>;
  let invoices: ReturnType<typeof fakeRepo>;
  let mailbox: ReturnType<typeof fakeMailbox>;

  const service = () =>
    new InvoiceImportService(
      fakeRepo() as never,
      messages as never,
      invoices as never,
      { query: jest.fn() } as never,
      () => mailbox as unknown as PecMailbox,
      fakeRepo() as never,
      {} as never,
      {} as never,
      noLinker as never,
      noRecalc as never,
    );

  beforeEach(() => {
    Object.assign(process.env, ENV);
    invoices = fakeRepo([{ id: 50, deleted: false, sdi_identifier: '99000000001' }]);
    messages = fakeRepo([
      {
        id: 1,
        kind: 'INVOICE',
        status: SdiMessageStatus.LINKED,
        sdi_identifier: '99000000001',
        uid_validity: '7',
        uid: '3',
        message_id: '<m1@pec>',
        file_name: 'IT01234567897_a1B2c.xml.p7m',
      },
    ]);
    mailbox = fakeMailbox([]);
    mailbox.fetchRaw.mockResolvedValue(invoiceEml('<m1@pec>') as never);
  });

  afterEach(() => {
    process.env = { ...savedEnv };
  });

  it('XML in chiaro riletto dalla casella', async () => {
    const doc = await service().getDocument(50, 'xml');
    expect(doc.contentType).toBe('application/xml');
    expect(doc.data.equals(fixture('fattura.xml'))).toBe(true);
    expect(mailbox.fetchRaw).toHaveBeenCalledWith(7, 3, '<m1@pec>');
    expect(mailbox.close).toHaveBeenCalled();
  });

  it('PDF allegato alla fattura', async () => {
    const doc = await service().getDocument(50, 'pdf');
    expect(doc.contentType).toBe('application/pdf');
    expect(doc.data.equals(fixture('documento.pdf'))).toBe(true);
  });

  it('messaggio sparito dalla casella: rimanda al protocollo', async () => {
    mailbox.fetchRaw.mockResolvedValue(null as never);
    await expect(service().getDocument(50, 'xml')).rejects.toThrow(
      'Non più disponibile sulla PEC: cercare la fattura nel protocollo.',
    );
  });

  it('struttura ignorata dopo il collegamento: XML e PDF restano visibili', async () => {
    messages.rows[0].status = SdiMessageStatus.IGNORED;
    const doc = await service().getDocument(50, 'xml');
    expect(doc.contentType).toBe('application/xml');
  });

  it('fattura senza messaggio SDI', async () => {
    invoices.rows[0].sdi_identifier = null;
    await expect(service().getDocument(50, 'xml')).rejects.toThrow('Fattura senza messaggio SDI.');
    expect(mailbox.open).not.toHaveBeenCalled();
  });
});
