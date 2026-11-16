import { DataSource } from 'typeorm';
import { SYSTEM_USER_ID } from '@apis/system-users/system-user.constants';
import { itDataSource, resetTables } from '../../test/integration/data-source';
import {
  insert,
  insertContract,
  insertInvoice,
  insertThirdParty,
} from '../../test/integration/fixtures';
import * as q from './invoice-import.queries';

const AUTHOR = { created_by_user_id: SYSTEM_USER_ID, updated_by_user_id: SYSTEM_USER_ID };

describe('letture dell’import fatture (integrazione)', () => {
  let ds: DataSource;
  let seq = 0;

  beforeAll(async () => {
    ds = await itDataSource();
  });

  afterAll(() => ds.destroy());

  beforeEach(() =>
    resetTables(ds, [
      'invoice_import_issues',
      'invoice_patterns',
      'sdi_messages',
      'invoices',
      'contracts',
      'third_parties',
    ]),
  );

  const message = (over: Record<string, unknown> = {}) => {
    const n = ++seq;
    return insert(ds, 'sdi_messages', {
      uid_validity: 1,
      uid: n,
      message_id: `<msg-${n}@pec>`,
      kind: 'INVOICE',
      file_name: `IT01234567890_${n}.xml`,
      status: 'PENDING',
      ...over,
    });
  };
  const pattern = (supplier: number, over: Record<string, unknown> = {}) =>
    insert(ds, 'invoice_patterns', {
      ...AUTHOR,
      supplier_id_fk: supplier,
      name: `Pattern ${++seq}`,
      structure_key: 'k1',
      ...over,
    });
  const inScope = async (over: Record<string, unknown> = {}) => {
    const tp = await insertThirdParty(ds, { vat_number: `0${++seq}`.padStart(11, '0'), ...over });
    await insertContract(ds, { supplier_id_fk: tp });
    return tp;
  };

  it('conteggi per stato e ultimi dieci errori, i più recenti prima', async () => {
    await message();
    await message();
    const errors = [];
    for (let i = 0; i < 11; i++) errors.push(await message({ status: 'ERROR', error: `e${i}` }));
    expect(
      Object.fromEntries(
        (await q.statusCounts(ds.manager)).map((r) => [r.status, Number(r.total)]),
      ),
    ).toEqual({ PENDING: 2, ERROR: 11 });
    const recent = await q.recentErrors(ds.manager);
    expect(recent.map((r) => r.error)).toEqual([
      'e10',
      'e9',
      'e8',
      'e7',
      'e6',
      'e5',
      'e4',
      'e3',
      'e2',
      'e1',
    ]);
    expect(Object.keys(recent[0]).sort()).toEqual(['create_date', 'error', 'file_name']);
  });

  it('backfill: fatture in attesa o collegate senza struttura o senza tipo, con fornitore', async () => {
    const tp = await insertThirdParty(ds);
    const noKey = await message({ supplier_id_fk: tp });
    const noType = await message({ supplier_id_fk: tp, status: 'LINKED', structure_key: 'k' });
    await message({ supplier_id_fk: tp, structure_key: '' }); // sparito dalla casella
    await message({ supplier_id_fk: tp, structure_key: 'k', document_type: 'TD01' });
    await message({ structure_key: null }); // senza fornitore
    await message({ supplier_id_fk: tp, status: 'EXTRACTED' });
    await message({ supplier_id_fk: tp, kind: 'RECEIPT' });
    expect(await q.backfillIds(ds.manager)).toEqual([noKey, noType]);
  });

  it('sbloccate: con pattern e una segnalazione METER_MISMATCH', async () => {
    const tp = await insertThirdParty(ds);
    const p = await pattern(tp);
    const blocked = await message({ supplier_id_fk: tp, pattern_id_fk: p });
    await insert(ds, 'invoice_import_issues', {
      sdi_message_id_fk: blocked,
      type: 'METER_MISMATCH',
      detail: 'x',
    });
    const other = await message({ supplier_id_fk: tp, pattern_id_fk: p });
    await insert(ds, 'invoice_import_issues', {
      sdi_message_id_fk: other,
      type: 'UNKNOWN_UTILITY',
      detail: 'x',
    });
    const noPattern = await message({ supplier_id_fk: tp });
    await insert(ds, 'invoice_import_issues', {
      sdi_message_id_fk: noPattern,
      type: 'METER_MISMATCH',
      detail: 'x',
    });
    expect(await q.unblockedIds(ds.manager)).toEqual([blocked]);
  });

  it('rientro nel perimetro: fuori perimetro con identificativo SDI, fornitore con contratto non bozza', async () => {
    const tp = await inScope({ vat_number: '11111111111' });
    await insertThirdParty(ds, { vat_number: '22222222222' }); // senza contratto
    const draftOnly = await insertThirdParty(ds, { vat_number: '33333333333' });
    await insertContract(ds, { supplier_id_fk: draftOnly, draft: 1 });
    const deleted = await insertThirdParty(ds, { vat_number: '44444444444', deleted: 1 });
    await insertContract(ds, { supplier_id_fk: deleted });

    const back = await message({
      status: 'OUT_OF_SCOPE',
      supplier_vat: '11111111111',
      sdi_identifier: '1',
    });
    await message({ status: 'OUT_OF_SCOPE', supplier_vat: '11111111111' }); // copia senza SDI
    await message({ status: 'OUT_OF_SCOPE', supplier_vat: '22222222222', sdi_identifier: '2' });
    await message({ status: 'OUT_OF_SCOPE', supplier_vat: '33333333333', sdi_identifier: '3' });
    await message({ status: 'OUT_OF_SCOPE', supplier_vat: '44444444444', sdi_identifier: '4' });
    await message({ status: 'PENDING', supplier_vat: '11111111111', sdi_identifier: '5' });
    expect(await q.rescopable(ds.manager)).toEqual([{ id: back, supplier_id: tp }]);

    expect(await q.supplierInScope(ds.manager, '11111111111')).toBe(tp);
    expect(await q.supplierInScope(ds.manager, '22222222222')).toBeNull();
    expect(await q.supplierInScope(ds.manager, '33333333333')).toBeNull();
    expect(await q.supplierInScope(ds.manager, '44444444444')).toBeNull();
  });

  it('ricollegamento: in attesa con SDI e fattura inserita (stesso fornitore, numero, data)', async () => {
    const tp = await insertThirdParty(ds);
    const first = await insertInvoice(ds, {
      supplier_id_fk: tp,
      invoice_id: 'A1',
      invoice_date: '2025-05-02',
    });
    await insertInvoice(ds, { supplier_id_fk: tp, invoice_id: 'A1', invoice_date: '2025-05-02' });
    await insertInvoice(ds, {
      supplier_id_fk: tp,
      invoice_id: 'B1',
      invoice_date: '2025-05-02',
      deleted: 1,
    });
    const pending = await message({
      supplier_id_fk: tp,
      document_number: 'A1',
      document_date: '2025-05-02',
      sdi_identifier: '900',
    });
    await message({ supplier_id_fk: tp, document_number: 'A1', document_date: '2025-05-02' });
    await message({
      supplier_id_fk: tp,
      document_number: 'B1',
      document_date: '2025-05-02',
      sdi_identifier: '901',
    });
    await message({
      supplier_id_fk: tp,
      document_number: 'A1',
      document_date: '2025-05-02',
      sdi_identifier: '902',
      status: 'LINKED',
    });
    expect(await q.pendingRelinks(ds.manager)).toEqual([
      { id: pending, sdi_identifier: '900', invoice_id: first },
    ]);
  });

  describe('pattern', () => {
    it('elenco: non cancellati, ignorati in fondo, con estratte e fattura d’esempio', async () => {
      const a = await insertThirdParty(ds, { company_name: 'Alfa' });
      const b = await insertThirdParty(ds, {
        company_name: null,
        type: 'NATURAL',
        last_name: 'Rossi',
        first_name: 'Ada',
      });
      const pa = await pattern(a, { name: 'luce' });
      const pi = await pattern(a, { name: 'aaa', ignored: 1 });
      const pb = await pattern(b, { name: 'gas', structure_key: 'k2' });
      await pattern(a, { name: 'via', deleted: 1 });
      await message({
        supplier_id_fk: a,
        pattern_id_fk: pa,
        status: 'EXTRACTED',
        structure_key: 'k1',
      });
      await message({
        supplier_id_fk: a,
        pattern_id_fk: pa,
        status: 'PENDING',
        structure_key: 'k1',
      });
      const sample = await message({ supplier_id_fk: a, structure_key: 'k1' });
      await message({ supplier_id_fk: a, structure_key: 'k1', kind: 'RECEIPT' });

      const rows = await q.patternList(ds.manager);
      expect(
        rows.map((r) => [
          r.id,
          r.supplier,
          Number(r.extracted),
          r.sample_message_id === null ? null : Number(r.sample_message_id),
        ]),
      ).toEqual([
        [pa, 'Alfa', 1, sample],
        [pb, 'Rossi Ada', 0, null],
        [pi, 'Alfa', 0, sample],
      ]);
      expect(await q.supplierName(ds.manager, b)).toBe('Rossi Ada');
      expect(await q.supplierName(ds.manager, 999999)).toBe('');
    });

    it('simili: stesso fornitore e tipo (vuoto = non letto), senza pattern, in attesa o collegate', async () => {
      const tp = await insertThirdParty(ds);
      const p = await pattern(tp);
      const older = await message({
        supplier_id_fk: tp,
        document_type: 'TD01',
        structure_key: 'k',
        document_number: '1',
      });
      const newer = await message({ supplier_id_fk: tp, document_type: 'TD01', status: 'LINKED' });
      await message({ supplier_id_fk: tp, document_type: 'TD04' });
      await message({ supplier_id_fk: tp, document_type: 'TD01', pattern_id_fk: p });
      await message({ supplier_id_fk: tp, document_type: 'TD01', status: 'EXTRACTED' });
      const untyped = await message({ supplier_id_fk: tp });

      expect((await q.similarMessages(ds.manager, tp, 'TD01')).map((r) => Number(r.id))).toEqual([
        newer,
        older,
      ]);
      expect(await q.similarMessages(ds.manager, tp, 'TD01')).toContainEqual(
        expect.objectContaining({ structure_key: 'k', document_number: '1' }),
      );
      expect((await q.similarMessages(ds.manager, tp, '')).map((r) => Number(r.id))).toEqual([
        untyped,
      ]);
    });

    it('da rielaborare: in attesa e collegate del fornitore, estratte solo dallo stesso pattern', async () => {
      const tp = await insertThirdParty(ds);
      const p = await pattern(tp);
      const other = await pattern(tp, { name: 'altro' });
      const pending = await message({ supplier_id_fk: tp });
      const linked = await message({ supplier_id_fk: tp, status: 'LINKED' });
      const mine = await message({ supplier_id_fk: tp, status: 'EXTRACTED', pattern_id_fk: p });
      await message({ supplier_id_fk: tp, status: 'EXTRACTED', pattern_id_fk: other });
      await message({ supplier_id_fk: tp, status: 'IGNORED' });
      await message({ supplier_id_fk: tp, kind: 'RECEIPT' });
      await message({ supplier_id_fk: await insertThirdParty(ds) });
      expect(await q.reprocessIds(ds.manager, tp, p)).toEqual([pending, linked, mine]);
    });
  });
});
