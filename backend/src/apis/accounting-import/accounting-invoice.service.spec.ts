import { AuditAction } from '@apis/audit-log/entity/audit-log.entity';
import { Invoice } from '@apis/invoices/entity/invoice.entity';
import { SdiStatus } from '@apis/invoices/enum/sdi-status.enum';
import { SYSTEM_USER_ID } from '@apis/system-users/system-user.constants';
import type { AccLiquidationRow } from './accounting-csv';
import { AccountingInvoiceService } from './accounting-invoice.service';
import { RecordSource } from './record-source.enum';

const liq = (key: string, patch: Partial<AccLiquidationRow> = {}): AccLiquidationRow => ({
  liquidation_key: key,
  commitment_year: 2026,
  commitment_num: 1,
  commitment_sub: 1,
  fiscal_year: 2026,
  sdi_identifier: '777',
  invoice_number: 'FT/12',
  invoice_date: '2026-03-01',
  invoice_total: 122,
  invoice_cig: 'CIG1',
  supplier_vat: '00000000001',
  amount: 61,
  cancelled: false,
  ...patch,
});

interface Fixture {
  liquidations: AccLiquidationRow[];
  invoices?: Record<string, unknown>[];
  contracts?: Record<string, unknown>[];
  messages?: Record<string, unknown>[];
}

function setup(f: Fixture) {
  const inserts: Record<string, unknown>[] = [];
  const updates: { id: number; values: Record<string, unknown> }[] = [];
  const manager = {
    insert: jest.fn(async (_entity: unknown, values: Record<string, unknown>) => {
      inserts.push(values);
      return { identifiers: [{ id: 500 + inserts.length }] };
    }),
    update: jest.fn(async (_entity: unknown, id: number, values: Record<string, unknown>) => {
      updates.push({ id, values });
    }),
  };
  const dataSource = {
    query: jest.fn(async (sql: string) => {
      const marker = /\/\* (a_\w+) \*\//.exec(sql)?.[1];
      if (marker === 'a_invoices') return f.invoices ?? [];
      if (marker === 'a_contracts') return f.contracts ?? [];
      if (marker === 'a_messages') return f.messages ?? [];
      return [];
    }),
    transaction: jest.fn(async (cb: (m: typeof manager) => Promise<unknown>) => cb(manager)),
    getRepository: jest.fn(() => manager),
  };
  const data = {
    liquidations: jest.fn(async () => f.liquidations),
    suppliersByVat: jest.fn(async () => new Map([['00000000001', 3]])),
  };
  const audit = { record: jest.fn(async () => undefined) };
  const service = new AccountingInvoiceService(dataSource as never, data as never, audit as never);
  return { service, inserts, updates, audit, manager };
}

describe('AccountingInvoiceService', () => {
  it('liquidazione non annullata senza fattura, fornitore in perimetro, invoice_total presente = fattura creata', async () => {
    const { service, inserts, audit, updates } = setup({
      liquidations: [liq('L1')],
      contracts: [{ id: 9, supplier_id_fk: 3, cig_contract: 'CIG1' }],
      messages: [{ kind: 'INVOICE', outcome: null, status: 'DONE', received_at: '2026-03-02', create_date: '2026-03-02' }],
    });
    const result = await service.apply();
    expect(inserts).toEqual([
      expect.objectContaining({
        invoice_id: 'FT/12',
        invoice_date: '2026-03-01',
        supplier_id_fk: 3,
        total_amount: 122,
        sdi_identifier: '777',
        contratto_id_fk: 9,
        source: RecordSource.ACCOUNTING,
        created_by_user_id: SYSTEM_USER_ID,
        updated_by_user_id: SYSTEM_USER_ID,
      }),
    ]);
    expect(updates).toEqual([
      { id: 501, values: expect.objectContaining({ sdi_status: SdiStatus.RECEIVED, sdi_outcome_discarded: false }) },
    ]);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ entityName: 'invoices', entityId: 501, action: AuditAction.CREATE, userId: SYSTEM_USER_ID }),
    );
    expect(result).toEqual({ created: 1, sdiCompleted: 0 });
  });

  it('CIG di più contratti o di nessuno = fattura senza contratto', async () => {
    const { service, inserts } = setup({
      liquidations: [liq('L1')],
      contracts: [
        { id: 9, supplier_id_fk: 3, cig_contract: 'CIG1' },
        { id: 10, supplier_id_fk: 3, cig_contract: 'CIG1' },
      ],
    });
    await service.apply();
    expect(inserts[0]).toEqual(expect.objectContaining({ contratto_id_fk: null }));
  });

  it('più liquidazioni della stessa fattura = una sola fattura', async () => {
    const { service, inserts } = setup({ liquidations: [liq('L1'), liq('L2', { invoice_number: 'ft-12' })] });
    const result = await service.apply();
    expect(inserts).toHaveLength(1);
    expect(result.created).toBe(1);
  });

  it('fornitore fuori perimetro o invoice_total vuoto = nessuna fattura', async () => {
    const { service, inserts } = setup({
      liquidations: [
        liq('L1', { supplier_vat: '99999999999' }),
        liq('L2', { invoice_total: null, sdi_identifier: '888' }),
        liq('L3', { cancelled: true, sdi_identifier: '889', invoice_number: 'X' }),
      ],
    });
    await service.apply();
    expect(inserts).toEqual([]);
  });

  it('fattura esistente senza sdi_identifier lo prende dal file', async () => {
    const { service, updates, inserts, audit } = setup({
      liquidations: [liq('L1')],
      invoices: [{ id: 40, supplier_vat: '00000000001', invoice_number: 'FT12', invoice_date: '2026-03-01', sdi_identifier: null }],
    });
    const result = await service.apply();
    expect(inserts).toEqual([]);
    expect(updates[0]).toEqual({ id: 40, values: { sdi_identifier: '777', updated_by_user_id: SYSTEM_USER_ID } });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        entityName: 'invoices',
        entityId: 40,
        action: AuditAction.UPDATE,
        fields: [{ fieldName: 'sdi_identifier', oldValue: null, newValue: '777' }],
      }),
    );
    expect(result).toEqual({ created: 0, sdiCompleted: 1 });
  });

  it('sdi già presente e diverso non toccato', async () => {
    const { service, updates } = setup({
      liquidations: [liq('L1')],
      invoices: [{ id: 40, supplier_vat: '00000000001', invoice_number: 'FT12', invoice_date: '2026-03-01', sdi_identifier: '555' }],
    });
    expect(await service.apply()).toEqual({ created: 0, sdiCompleted: 0 });
    expect(updates).toEqual([]);
  });

  it('ricarico identico = nessuna modifica', async () => {
    const { service, updates, inserts } = setup({
      liquidations: [liq('L1')],
      invoices: [{ id: 501, supplier_vat: '00000000001', invoice_number: 'FT/12', invoice_date: '2026-03-01', sdi_identifier: '777' }],
    });
    expect(await service.apply()).toEqual({ created: 0, sdiCompleted: 0 });
    expect(inserts).toEqual([]);
    expect(updates).toEqual([]);
  });

  it('matchedByKey abbina le liquidazioni alle fatture presenti', async () => {
    const { service } = setup({
      liquidations: [liq('L1'), liq('L2', { sdi_identifier: null, invoice_number: 'ALTRA' })],
      invoices: [{ id: 501, supplier_vat: '00000000001', invoice_number: 'FT/12', invoice_date: '2026-03-01', sdi_identifier: '777' }],
    });
    expect(await service.matchedByKey()).toEqual(new Map([['L1', 501]]));
  });
});
