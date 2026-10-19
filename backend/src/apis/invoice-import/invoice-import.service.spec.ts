import { maintenance } from '@common/maintenance/maintenance';
import { SdiStatus } from '@apis/invoices/enum/sdi-status.enum';
import { InvoiceImportService } from './invoice-import.service';
import { SdiMessageStatus } from './enum/sdi-message-status.enum';
import type { PecMailbox } from './pec-imap.client';
import { fixture, invoiceEml, notificationEml } from './sdi/fixtures/eml';

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
      { query } as never,
      () => mailbox as unknown as PecMailbox,
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
    expect(result).toEqual({ processed: 1, linked: 1, pending: 0 });
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
    expect(await service().runOnce()).toEqual({ processed: 1, linked: 0, pending: 1 });
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
    await expect(service().runOnce()).resolves.toEqual({ processed: 0, linked: 0, pending: 0 });
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

  it('fattura senza messaggio SDI', async () => {
    invoices.rows[0].sdi_identifier = null;
    await expect(service().getDocument(50, 'xml')).rejects.toThrow('Fattura senza messaggio SDI.');
    expect(mailbox.open).not.toHaveBeenCalled();
  });
});
