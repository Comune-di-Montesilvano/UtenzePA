import { DataSource } from 'typeorm';
import { SYSTEM_USER_ID } from '@apis/system-users/system-user.constants';
import { itDataSource, resetTables } from '../../test/integration/data-source';
import { insert, insertThirdParty, insertUtility } from '../../test/integration/fixtures';
import { InvoiceApplier } from './invoice-applier.service';
import type { MatchResult } from './invoice-matcher.service';
import { InvoicePatternsService } from './invoice-patterns.service';
import {
  UNKNOWN_STRUCTURES_SQL,
  UNTYPED_SQL,
  toUnknownStructure,
} from './pattern/unknown-structures.sql';

describe('import fatture: scritture puntuali e strutture sconosciute (integrazione)', () => {
  let ds: DataSource;
  let applier: InvoiceApplier;
  let seq = 0;

  beforeAll(async () => {
    ds = await itDataSource();
    applier = new InvoiceApplier(ds, {} as never, {} as never);
  });

  afterAll(() => ds.destroy());

  beforeEach(() =>
    resetTables(ds, [
      'audit_logs',
      'invoice_import_issues',
      'invoice_patterns',
      'sdi_messages',
      'utilities',
      'third_parties',
    ]),
  );

  const message = (over: Record<string, unknown> = {}) => {
    const n = ++seq;
    return insert(ds, 'sdi_messages', {
      uid_validity: 1,
      uid: n,
      message_id: `<m-${n}@pec>`,
      kind: 'INVOICE',
      file_name: `f${n}.xml`,
      status: 'PENDING',
      ...over,
    });
  };

  it('autore dell’import: l’utente di sistema', async () => {
    expect(await applier.importUserId()).toBe(SYSTEM_USER_ID);
  });

  it('matricola: scritta se vuota o diversa, con audit; uguale = nessuna scrittura', async () => {
    const empty = await insertUtility(ds);
    const different = await insertUtility(ds, { meter_number: 'OLD' });
    const same = await insertUtility(ds, { meter_number: 'M-3' });
    const match = {
      meterFills: [
        { utilityId: empty, meter: 'M-1', previous: null },
        { utilityId: different, meter: 'M-2', previous: 'OLD' },
        { utilityId: same, meter: 'M-3', previous: 'M-3' },
      ],
    } as unknown as MatchResult;
    await ds.transaction((m) =>
      (
        applier as unknown as {
          fillMeters: (m: unknown, match: MatchResult, user: number) => Promise<void>;
        }
      ).fillMeters(m, match, SYSTEM_USER_ID),
    );
    const meters = await ds.query('SELECT id, meter_number FROM utilities ORDER BY id');
    expect(meters.map((r: { meter_number: string }) => r.meter_number)).toEqual([
      'M-1',
      'M-2',
      'M-3',
    ]);
    const audit = await ds.query(
      "SELECT entity_id, old_value, new_value FROM audit_logs WHERE entity_name = 'utilities' ORDER BY id",
    );
    expect(audit).toEqual([
      { entity_id: empty, old_value: null, new_value: 'M-1' },
      { entity_id: different, old_value: 'OLD', new_value: 'M-2' },
    ]);
  });

  it('silenziare: solo PDF mancante e lettura più bassa', async () => {
    const service = new InvoicePatternsService(
      {} as never,
      {} as never,
      ds,
      {} as never,
      {} as never,
    );
    const msg = await message();
    const pdf = await insert(ds, 'invoice_import_issues', {
      sdi_message_id_fk: msg,
      type: 'PDF_DATA_MISSING',
      detail: 'x',
    });
    const other = await insert(ds, 'invoice_import_issues', {
      sdi_message_id_fk: msg,
      type: 'UNKNOWN_UTILITY',
      detail: 'x',
    });
    await service.muteIssue(pdf);
    await expect(service.muteIssue(other)).rejects.toThrow('Si possono silenziare solo');
    await expect(service.muteIssue(999999)).rejects.toThrow('Segnalazione non trovata.');
    const muted = await ds.query('SELECT id, muted FROM invoice_import_issues ORDER BY id');
    expect(muted.map((r: { muted: number }) => Number(r.muted))).toEqual([1, 0]);
  });

  it('strutture sconosciute: una riga per fornitore e tipo con la struttura più frequente', async () => {
    const tp = await insertThirdParty(ds, { company_name: 'Alfa' });
    const pattern = await insert(ds, 'invoice_patterns', {
      supplier_id_fk: tp,
      name: 'p',
      structure_key: 'a',
      created_by_user_id: SYSTEM_USER_ID,
      updated_by_user_id: SYSTEM_USER_ID,
    });
    await message({ supplier_id_fk: tp, structure_key: 'a', document_type: 'TD01' });
    await message({ supplier_id_fk: tp, structure_key: 'a', document_type: 'TD01' });
    const lastA = await message({ supplier_id_fk: tp, structure_key: 'a', document_type: 'TD01' });
    await message({ supplier_id_fk: tp, structure_key: 'b', document_type: 'TD01' });
    const credit = await message({ supplier_id_fk: tp, structure_key: 'c', document_type: 'TD04' });
    await message({
      supplier_id_fk: tp,
      structure_key: 'a',
      document_type: 'TD01',
      pattern_id_fk: pattern,
    });
    await message({ supplier_id_fk: tp, structure_key: '', document_type: 'TD01' });
    const untyped = await message({ supplier_id_fk: tp, structure_key: 'd' });

    const rows = (await ds.query(UNKNOWN_STRUCTURES_SQL)).map(toUnknownStructure);
    expect(rows).toEqual([
      {
        supplier_id: tp,
        supplier: 'Alfa',
        document_type: '',
        structure_key: 'd',
        count: 1,
        structures: 1,
        message_id: untyped,
      },
      {
        supplier_id: tp,
        supplier: 'Alfa',
        document_type: 'TD01',
        structure_key: 'a',
        count: 4,
        structures: 2,
        message_id: lastA,
      },
      {
        supplier_id: tp,
        supplier: 'Alfa',
        document_type: 'TD04',
        structure_key: 'c',
        count: 1,
        structures: 1,
        message_id: credit,
      },
    ]);
    expect((await ds.query(UNTYPED_SQL)).map((r: { id: number }) => Number(r.id))).toEqual([
      untyped,
    ]);
  });
});
