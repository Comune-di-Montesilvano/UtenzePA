import { AuditAction, AuditLog } from '@apis/audit-log/entity/audit-log.entity';
import { Invoice } from '@apis/invoices/entity/invoice.entity';
import { InvoiceLine } from '@apis/invoices/entity/invoice-line.entity';
import { InvoiceImportIssue } from './entity/invoice-import-issue.entity';
import { SdiMessage } from './entity/sdi-message.entity';
import { ImportIssueType } from './enum/import-issue-type.enum';
import { SdiMessageStatus } from './enum/sdi-message-status.enum';
import { InvoiceApplier } from './invoice-applier.service';
import type { MatchResult } from './invoice-matcher.service';
import type { ExtractedInvoice } from './pattern/pattern-rules';

const extracted: ExtractedInvoice = {
  supplierVat: '01234567897',
  supplierName: 'Energia Prova S.p.A.',
  number: 'EP 7/26',
  date: '2026-07-10',
  documentType: 'TD01',
  total: 183,
  netAmount: 150,
  cig: null,
  contractRef: null,
  lines: [],
};

const match = (over: Partial<MatchResult> = {}): MatchResult => ({
  supplierId: 46,
  existingInvoiceId: null,
  contratto_id_fk: 5,
  lines: [
    {
      utility_id_fk: 812,
      contract_id: 5,
      commitment_id_fk: 70,
      period_start: '2026-06-01',
      period_end: '2026-06-30',
      amount: 122,
      consumption: 542,
      estimated: false,
      description: 'Materia',
      supply_code: 'IT001E00000001',
    },
  ],
  issues: [
    { type: ImportIssueType.CIG_MISMATCH, lineIndex: 0, detail: 'CIG fattura X, contratto Y' },
  ],
  blocking: [],
  meters: [],
  meterFills: [],
  ...over,
});

const message = () => Object.assign(new SdiMessage(), { id: 9, sdi_identifier: '111' });

describe('InvoiceApplier', () => {
  let manager: {
    findOne: jest.Mock;
    find: jest.Mock;
    save: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
  let linker: { link: jest.Mock };
  let recalc: { recalcUtility: jest.Mock };
  let applier: InvoiceApplier;

  beforeEach(() => {
    manager = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),
      save: jest.fn(async (_e, data) => (Array.isArray(data) ? data : { id: 500, ...data })),
      update: jest.fn(),
      delete: jest.fn(),
    };
    const dataSource = { transaction: jest.fn((cb) => cb(manager)), query: jest.fn() };
    linker = { link: jest.fn(async () => ({ issues: [], utilityIds: [812] })) };
    recalc = { recalcUtility: jest.fn() };
    applier = new InvoiceApplier(dataSource as never, linker as never, recalc as never);
  });

  it('crea la fattura con le righe e l’autore indicato', async () => {
    const id = await applier.apply(message(), extracted, match(), 3, 7);
    expect(id).toBe(500);
    expect(manager.save).toHaveBeenCalledWith(
      Invoice,
      expect.objectContaining({
        invoice_id: 'EP 7/26',
        invoice_date: '2026-07-10',
        supplier_id_fk: 46,
        total_amount: 183,
        net_amount_excl_vat: 150,
        contratto_id_fk: 5,
        sdi_identifier: '111',
        created_by_user_id: 7,
        updated_by_user_id: 7,
      }),
    );
    expect(manager.save).toHaveBeenCalledWith(InvoiceLine, [
      expect.objectContaining({
        invoice_id_fk: 500,
        utility_id_fk: 812,
        commitment_id_fk: 70,
        amount: 122,
      }),
    ]);
    expect(manager.update).toHaveBeenCalledWith(SdiMessage, 9, {
      status: SdiMessageStatus.EXTRACTED,
      pattern_id_fk: 3,
      invoice_id_fk: 500,
      error: null,
    });
  });

  it('arricchisce la fattura esistente: stesso id, righe sostituite, ultima modifica invariata', async () => {
    manager.findOne.mockResolvedValue({ id: 321, contratto_id_fk: null, import_locked: false });
    const id = await applier.apply(message(), extracted, match({ existingInvoiceId: 321 }), 3, 7);
    expect(id).toBe(321);
    expect(manager.update).toHaveBeenCalledWith(
      Invoice,
      321,
      expect.objectContaining({
        total_amount: 183,
        contratto_id_fk: 5,
        sdi_identifier: '111',
        update_date: expect.any(Function),
      }),
    );
    const invoiceUpdate = manager.update.mock.calls.find(([e]) => e === Invoice)[2];
    expect(invoiceUpdate).not.toHaveProperty('updated_by_user_id');
    expect(manager.delete).toHaveBeenCalledWith(InvoiceLine, { invoice_id_fk: 321 });
    expect(manager.save).toHaveBeenCalledWith(InvoiceLine, [
      expect.objectContaining({ invoice_id_fk: 321 }),
    ]);
  });

  it('contratto già valorizzato sulla fattura: non sovrascritto', async () => {
    manager.findOne.mockResolvedValue({ id: 321, contratto_id_fk: 2, import_locked: false });
    await applier.apply(message(), extracted, match({ existingInvoiceId: 321 }), 3, 7);
    const invoiceUpdate = manager.update.mock.calls.find(([e]) => e === Invoice)[2];
    expect(invoiceUpdate).not.toHaveProperty('contratto_id_fk');
  });

  it('fattura bloccata (modificata a mano): righe e testata intatte, solo il messaggio', async () => {
    manager.findOne.mockResolvedValue({ id: 321, contratto_id_fk: null, import_locked: true });
    const id = await applier.apply(message(), extracted, match({ existingInvoiceId: 321 }), 3, 7);
    expect(id).toBe(321);
    expect(manager.delete).not.toHaveBeenCalledWith(InvoiceLine, expect.anything());
    expect(manager.update).not.toHaveBeenCalledWith(Invoice, expect.anything(), expect.anything());
    expect(manager.update).toHaveBeenCalledWith(
      SdiMessage,
      9,
      expect.objectContaining({ invoice_id_fk: 321 }),
    );
  });

  it('segnalazioni del messaggio sostituite', async () => {
    await applier.apply(message(), extracted, match(), 3, 7);
    expect(manager.delete).toHaveBeenCalledWith(InvoiceImportIssue, { sdi_message_id_fk: 9 });
    expect(manager.save).toHaveBeenCalledWith(InvoiceImportIssue, [
      expect.objectContaining({
        sdi_message_id_fk: 9,
        invoice_id_fk: 500,
        line_index: 0,
        type: ImportIssueType.CIG_MISMATCH,
      }),
    ]);
  });

  it('consumi: collega le righe passando le rilevazioni di prima, poi ricalcola le utenze', async () => {
    manager.findOne.mockResolvedValue({ id: 321, contratto_id_fk: 5, import_locked: false });
    manager.find.mockResolvedValue([{ consumption_id_fk: 60 }, { consumption_id_fk: null }]);
    linker.link.mockResolvedValue({
      issues: [{ type: ImportIssueType.PERIOD_COVERED, lineIndex: 0, detail: 'coperto' }],
      utilityIds: [812],
    });
    await applier.apply(message(), extracted, match({ existingInvoiceId: 321, issues: [] }), 3, 7);
    expect(linker.link).toHaveBeenCalledWith(manager, 321, 7, [60], new Map(), new Set());
    expect(manager.save).toHaveBeenCalledWith(InvoiceImportIssue, [
      expect.objectContaining({ type: ImportIssueType.PERIOD_COVERED }),
    ]);
    expect(recalc.recalcUtility).toHaveBeenCalledWith(812);
  });

  it('fattura rifiutata: righe scritte ma nessun consumo', async () => {
    manager.findOne.mockResolvedValue({
      id: 321,
      contratto_id_fk: 5,
      import_locked: false,
      sdi_status: 'REJECTED',
    });
    await applier.apply(message(), extracted, match({ existingInvoiceId: 321 }), 3, 7);
    expect(linker.link).not.toHaveBeenCalled();
    expect(manager.save).toHaveBeenCalledWith(InvoiceLine, expect.anything());
  });
});

describe('InvoiceApplier: matricola', () => {
  let manager: { findOne: jest.Mock; find: jest.Mock; save: jest.Mock; update: jest.Mock; delete: jest.Mock; query: jest.Mock };
  let linker: { link: jest.Mock };
  let applier: InvoiceApplier;

  beforeEach(() => {
    manager = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),
      save: jest.fn(async (_e, data) => (Array.isArray(data) ? data : { id: 500, ...data })),
      update: jest.fn(),
      delete: jest.fn(),
      query: jest.fn(async () => ({ affectedRows: 1 })),
    };
    const dataSource = { transaction: jest.fn((cb) => cb(manager)), query: jest.fn() };
    linker = { link: jest.fn(async () => ({ issues: [], utilityIds: [812] })) };
    applier = new InvoiceApplier(dataSource as never, linker as never, { recalcUtility: jest.fn() } as never);
  });

  it('utenza senza matricola: la completa, con la riga nel log attività, e la passa alla rilevazione', async () => {
    await applier.apply(
      message(),
      extracted,
      match({
        meters: [{ utilityId: 812, meter: '000000000000283767' }],
        meterFills: [{ utilityId: 812, meter: '000000000000283767' }],
      }),
      3,
      7,
    );
    const [sql, params] = manager.query.mock.calls[0];
    expect(sql).toMatch(/UPDATE utilities SET meter_number = \? WHERE id = \? AND \(meter_number IS NULL OR meter_number = ''\)/);
    expect(params).toEqual(['000000000000283767', 812]);
    expect(manager.save).toHaveBeenCalledWith(
      AuditLog,
      expect.objectContaining({
        entity_name: 'utilities',
        entity_id: 812,
        action: AuditAction.UPDATE,
        field_name: 'meter_number',
        new_value: '000000000000283767',
        user_id: 7,
      }),
    );
    expect(linker.link).toHaveBeenCalledWith(
      manager,
      500,
      7,
      [],
      new Map([[812, '000000000000283767']]),
      new Set(),
    );
  });

  it('consumo stimato dal fornitore: l’utenza passa alla rilevazione come stimata', async () => {
    const base = match();
    await applier.apply(
      message(),
      extracted,
      match({ lines: [{ ...base.lines[0], estimated: true }] }),
      3,
      7,
    );
    expect(linker.link).toHaveBeenCalledWith(manager, 500, 7, [], new Map(), new Set([812]));
  });

  it('blocco: nessuna fattura scritta, segnalazione con utenza e matricola, pattern sul messaggio', async () => {
    const blocking = [
      {
        type: ImportIssueType.METER_MISMATCH,
        lineIndex: 0,
        utilityId: 812,
        value: '285039',
        detail: 'IT001E00000001: matricola in fattura 285039, in anagrafica 3983',
      },
    ];
    await applier.block(message(), match({ blocking, existingInvoiceId: 321 }), 3);
    expect(manager.save).not.toHaveBeenCalledWith(Invoice, expect.anything());
    expect(manager.delete).toHaveBeenCalledWith(InvoiceImportIssue, { sdi_message_id_fk: 9 });
    expect(manager.save).toHaveBeenCalledWith(InvoiceImportIssue, [
      expect.objectContaining({
        sdi_message_id_fk: 9,
        invoice_id_fk: 321,
        type: ImportIssueType.METER_MISMATCH,
        utility_id_fk: 812,
        value: '285039',
      }),
      expect.objectContaining({ type: ImportIssueType.CIG_MISMATCH }),
    ]);
    expect(manager.update).toHaveBeenCalledWith(SdiMessage, 9, { pattern_id_fk: 3, error: null });
  });
});
