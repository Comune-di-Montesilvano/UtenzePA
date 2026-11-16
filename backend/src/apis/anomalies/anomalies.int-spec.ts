import { DataSource } from 'typeorm';
import {
  ELEVATOR_INSPECTION_KIND,
  GROUNDING_INSPECTION_KIND,
  LIGHTNING_INSPECTION_KIND,
} from '@apis/plants/plant.calc';
import { currentYear } from '@apis/spending/chapter-year';
import { SYSTEM_USER_ID } from '@apis/system-users/system-user.constants';
import { romeDay } from '@apis/utility-supply/supply-reconcile.service';
import { itDataSource, resetTables } from '../../test/integration/data-source';
import {
  insert,
  insertConsipAgreement,
  insertContract,
  insertGrant,
  insertInvoice,
  insertInvoiceLine,
  insertPlant,
  insertPlantInspection,
  insertThirdParty,
  insertUtility,
} from '../../test/integration/fixtures';
import { Anomalies, AnomaliesService } from './anomalies.service';

// Anomalie della dashboard su MySQL vero: per ogni categoria un caso che la
// fa scattare e i casi vicini che non devono; le soglie con un caso appena
// sotto e uno appena sopra. Date relative a oggi (giorno di Roma).

const who = { created_by_user_id: SYSTEM_USER_ID, updated_by_user_id: SYSTEM_USER_ID };

const TABLES = [
  'acc_liquidations',
  'accounting_import_state',
  'asset_cadastral_units',
  'assets',
  'asset_functions',
  'asset_natures',
  'budget_chapter_spending',
  'budget_chapters',
  'budget_commitment_contracts',
  'budget_commitment_years',
  'budget_commitments',
  'consip_agreement',
  'consip_agreement_forecasts',
  'contract_utilities',
  'contracts',
  'invoice_commitment_shares',
  'invoice_import_issues',
  'invoice_lines',
  'invoices',
  'plant_assets',
  'plant_electrical',
  'plant_fire_equipment',
  'plant_inspections',
  'plant_thermal',
  'plants',
  'sdi_messages',
  'third_parties',
  'utilities',
  'utility_assets',
  'utility_consumptions',
  'utility_plants',
  'utility_supply_events',
  'utilizer_grant',
  'utilizer_grant_assets',
  'utilizer_grant_parties',
];

const today = romeDay(new Date());
const day = (n: number): string => {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const year = currentYear();

type Category = keyof Anomalies;
const ids = (a: Anomalies, k: Category): unknown[] =>
  (a[k].items as Record<string, unknown>[]).map((i) => i.id);

describe('AnomaliesService (integrazione)', () => {
  let ds: DataSource;
  let service: AnomaliesService;
  let LIGHT: number;
  let GAS: number;
  let INTERNET: number;
  const env = { ...process.env };

  beforeAll(async () => {
    ds = await itDataSource();
    service = new AnomaliesService(ds);
    const typeOf = async (hard: string) =>
      Number(
        (await ds.query('SELECT MIN(id) AS id FROM utility_types WHERE hard_type = ?', [hard]))[0]
          .id,
      );
    LIGHT = await typeOf('LIGHT');
    GAS = await typeOf('GAS');
    INTERNET = await typeOf('INTERNET');
  });

  afterAll(async () => {
    process.env = env;
    await ds.query(
      'UPDATE invoice_import_state SET enabled = 0, last_run_at = NULL, last_success_at = NULL, last_error = NULL WHERE id = 1',
    );
    await ds.destroy();
  });

  beforeEach(async () => {
    await resetTables(ds, TABLES);
    await ds.query(
      'UPDATE invoice_import_state SET enabled = 0, last_run_at = NULL, last_success_at = NULL, last_error = NULL WHERE id = 1',
    );
    process.env = { ...env };
    service.now = () => new Date();
    service.inboxPresent = () => true;
  });

  const run = () => service.getAnomalies();
  let n = 0;
  const utility = (over: Record<string, unknown> = {}) =>
    insertUtility(ds, { utility_type_id_fk: LIGHT, supply_active: 1, ...over });
  const contract = (over: Record<string, unknown> = {}) =>
    insertContract(ds, { cig_contract: `CIG${++n}`, supply_start_date: '2024-01-01', ...over });
  const link = (c: number, u: number) =>
    insert(ds, 'contract_utilities', { contract_id: c, utility_id: u });
  const asset = (over: Record<string, unknown> = {}) =>
    insert(ds, 'assets', { ...who, asset_name: `Immobile ${++n}`, ownership: 1, ...over });
  const chapter = (code: string, over: Record<string, unknown> = {}) =>
    insert(ds, 'budget_chapters', { ...who, chapter_code: code, article: 0, ...over });
  const spending = (chapterId: number, adjusted: number | null, y = year) =>
    insert(ds, 'budget_chapter_spending', {
      ...who,
      budget_chapter_id_fk: chapterId,
      year: y,
      adjusted_budget: adjusted,
    });
  const commitment = async (
    row: Record<string, unknown>,
    years: Record<number, number | null>,
    contracts: number[] = [],
  ) => {
    const id = await insert(ds, 'budget_commitments', { ...who, commitment_num: ++n, ...row });
    for (const [y, amount] of Object.entries(years))
      await insert(ds, 'budget_commitment_years', { commitment_id: id, fiscal_year: y, amount });
    for (const c of contracts)
      await insert(ds, 'budget_commitment_contracts', { commitment_id: id, contract_id: c });
    return id;
  };
  const share = (invoice: number, k: number, y: number, amount: number, source = 'AUTO') =>
    insert(ds, 'invoice_commitment_shares', {
      invoice_id_fk: invoice,
      commitment_id_fk: k,
      fiscal_year: y,
      amount,
      source,
    });
  const event = (utilityId: number, type: string, over: Record<string, unknown> = {}) =>
    insert(ds, 'utility_supply_events', { ...who, utility_id_fk: utilityId, type, ...over });
  const message = (over: Record<string, unknown> = {}) =>
    insert(ds, 'sdi_messages', {
      uid_validity: 1,
      uid: ++n,
      message_id: `<m${n}@pec>`,
      kind: 'INVOICE',
      file_name: `IT01234567890_${n}.xml`,
      status: 'PENDING',
      ...over,
    });
  const issue = (messageId: number, type: string, over: Record<string, unknown> = {}) =>
    insert(ds, 'invoice_import_issues', {
      sdi_message_id_fk: messageId,
      type,
      detail: `${type} ${++n}`,
      ...over,
    });

  it('a DB vuoto ogni categoria è vuota, con il conteggio uguale alle voci', async () => {
    const a = await run();
    expect(Object.keys(a)).toHaveLength(51);
    for (const list of Object.values(a)) expect(list).toEqual({ count: 0, items: [] });
  });

  it('il conteggio di ogni categoria è il numero delle voci', async () => {
    await utility();
    await contract({ cig_contract: null });
    await insertThirdParty(ds);
    const a = await run();
    for (const list of Object.values(a)) expect(list.count).toBe(list.items.length);
    expect(a.active_utilities_without_contract.count).toBe(1);
    expect(a.contracts_without_cig.count).toBe(1);
  });

  it('contracts_without_cig: ordinari aperti senza CIG, non bozze, esclusi o chiusi', async () => {
    const s = await insertThirdParty(ds, { company_name: 'Alfa' });
    const p = await contract({ cig_contract: '  ', supplier_id_fk: s });
    await link(p, await utility());
    await contract({ cig_contract: 'Z1' });
    await contract({ cig_contract: null, contract_kind: 'CIG_EXEMPT' });
    await contract({ cig_contract: null, draft: 1 });
    await contract({ cig_contract: null, closed: 1 });
    await contract({ cig_contract: null, deleted: 1 });
    expect((await run()).contracts_without_cig.items).toEqual([
      { id: p, supplier: 'Alfa', agreement: null, supply_expiry_date: null, utilities: 1 },
    ]);
  });

  it('active_utilities_without_contract: in carico senza contratto valido oggi', async () => {
    const p = await utility();
    const expired = await utility();
    await link(await contract({ supply_expiry_date: day(-5) }), expired);
    const draft = await utility();
    await link(await contract({ draft: 1 }), draft);
    const closed = await utility();
    await link(await contract({ closed: 1 }), closed);
    const covered = await utility();
    await link(await contract({ supply_expiry_date: day(5) }), covered);
    await utility({ supply_active: 0 });
    await utility({ transferred_to_third_party_id: await insertThirdParty(ds) });
    await utility({ deleted: 1 });
    expect(ids(await run(), 'active_utilities_without_contract').sort()).toEqual(
      [p, expired, draft, closed].sort(),
    );
  });

  it('active_utilities_without_cig_contract: contratti validi tutti ordinari senza CIG', async () => {
    const s = await insertThirdParty(ds, { company_name: 'Beta' });
    const c = await contract({ cig_contract: null, supplier_id_fk: s });
    const p = await utility();
    await link(c, p);
    const withCig = await utility();
    await link(c, withCig);
    await link(await contract(), withCig);
    const exempt = await utility();
    await link(await contract({ cig_contract: null, contract_kind: 'CIG_EXEMPT' }), exempt);
    await utility();
    const a = await run();
    expect(a.active_utilities_without_cig_contract.items).toEqual([
      expect.objectContaining({ id: p, contracts: `#${c} Beta` }),
    ]);
  });

  it('utilities_with_overlapping_contracts: periodi sovrapposti, non il subentro', async () => {
    const p = await utility();
    await link(await contract({ supply_start_date: '2024-01-01' }), p);
    await link(await contract({ supply_start_date: '2025-01-01' }), p);
    const handover = await utility();
    await link(
      await contract({ supply_start_date: '2024-01-01', supply_expiry_date: day(10) }),
      handover,
    );
    await link(await contract({ supply_start_date: day(11) }), handover);
    const closed = await utility();
    await link(await contract(), closed);
    await link(await contract({ closed: 1 }), closed);
    expect(ids(await run(), 'utilities_with_overlapping_contracts')).toEqual([p]);
  });

  it('duplicate_cigs: stesso CIG (spazi e maiuscole a parte) su contratti aperti', async () => {
    const a1 = await contract({ cig_contract: 'Z1' });
    const a2 = await contract({ cig_contract: ' z1 ' });
    await contract({ cig_contract: 'Y9' });
    await contract({ cig_contract: 'Y9', closed: 1 });
    await contract({ cig_contract: 'Y9', draft: 1 });
    const items = (await run()).duplicate_cigs.items;
    expect(items).toHaveLength(1);
    expect(items[0].contracts).toEqual([a1, a2]);
    expect(items[0].cig.toUpperCase()).toBe('Z1');
  });

  it('real_estate_contracts_without_assets e _without_parties', async () => {
    const party = await insertThirdParty(ds, { company_name: 'Gamma' });
    const gone = await insertThirdParty(ds, { deleted: 1 });
    const noAsset = await insertGrant(ds, [party], { subject: 'Sala' });
    const deletedAsset = await insertGrant(ds, [party]);
    await insert(ds, 'utilizer_grant_assets', {
      utilizer_grant_id: deletedAsset,
      asset_id: await asset({ deleted: 1 }),
    });
    const ok = await insertGrant(ds, [party]);
    await insert(ds, 'utilizer_grant_assets', { utilizer_grant_id: ok, asset_id: await asset() });
    const noParty = await insertGrant(ds, []);
    await insert(ds, 'utilizer_grant_assets', {
      utilizer_grant_id: noParty,
      asset_id: await asset(),
    });
    const deletedParty = await insertGrant(ds, [gone]);
    await insert(ds, 'utilizer_grant_assets', {
      utilizer_grant_id: deletedParty,
      asset_id: await asset(),
    });
    await insertGrant(ds, [], { deleted: 1 });
    const a = await run();
    expect(a.real_estate_contracts_without_assets.items).toEqual([
      { id: noAsset, counterparty: 'Gamma', subject: 'Sala' },
      { id: deletedAsset, counterparty: 'Gamma', subject: null },
    ]);
    expect(ids(a, 'real_estate_contracts_without_parties')).toEqual([noParty, deletedParty]);
  });

  it('plants_without_position e plants_without_asset', async () => {
    const located = await asset({ latitude: '42.1', longitude: '14.2' });
    const unlocated = await asset();
    const p = await insertPlant(ds, { type: 'ELEVATOR', code: 'A1' });
    await insertPlant(ds, { type: 'ELEVATOR', code: 'A2', latitude: '42', longitude: '14' });
    await insertPlant(ds, {
      type: 'ELEVATOR',
      code: 'A3',
      geocoded_latitude: '42',
      geocoded_longitude: '14',
    });
    const inLocated = await insertPlant(ds, { type: 'ELEVATOR', code: 'A4' });
    await insert(ds, 'plant_assets', { plant_id: inLocated, asset_id: located });
    const inGeocoded = await insertPlant(ds, { type: 'ELEVATOR', code: 'A6' });
    await insert(ds, 'plant_assets', {
      plant_id: inGeocoded,
      asset_id: await asset({ geocoded_latitude: '42', geocoded_longitude: '14' }),
    });
    const inUnlocated = await insertPlant(ds, { type: 'ELEVATOR', code: 'A5' });
    await insert(ds, 'plant_assets', { plant_id: inUnlocated, asset_id: unlocated });
    const lighting = await insertPlant(ds, {
      type: 'PUBLIC_LIGHTING',
      code: 'L1',
      latitude: '42',
      longitude: '14',
    });
    const a = await run();
    expect(ids(a, 'plants_without_position')).toEqual([p, inUnlocated]);
    expect(ids(a, 'plants_without_asset')).toEqual([p, expect.any(Number), expect.any(Number)]);
    expect(ids(a, 'plants_without_asset')).not.toContain(lighting);
    expect(ids(a, 'plants_without_asset')).not.toContain(inLocated);
    expect(ids(a, 'plants_without_asset')).not.toContain(inUnlocated);
  });

  it('third_parties_without_identifier: P.IVA per i giuridici, CF per le persone', async () => {
    const legal = await insertThirdParty(ds, { company_name: 'Aaa', vat_number: ' ' });
    const person = await insertThirdParty(ds, {
      type: 'NATURAL',
      last_name: 'Bianchi',
      first_name: 'Anna',
    });
    await insertThirdParty(ds, { company_name: 'Ccc', vat_number: '01234567890' });
    await insertThirdParty(ds, {
      type: 'NATURAL',
      last_name: 'Rossi',
      tax_code: 'RSSMRA80A01H501U',
    });
    await insertThirdParty(ds, { company_name: 'Ddd', deleted: 1 });
    expect((await run()).third_parties_without_identifier.items).toEqual([
      { id: legal, name: 'Aaa', type: 'LEGAL' },
      { id: person, name: 'Bianchi Anna', type: 'NATURAL' },
    ]);
  });

  it('tipologia ARERA e categoria d’uso del gas', async () => {
    const light = await utility();
    await utility({ arera_category: 'EL_BT_OTHER' });
    await utility({ utility_type_id_fk: INTERNET });
    const gas = await utility({ utility_type_id_fk: GAS, arera_category: 'GAS_OTHER' });
    await utility({ utility_type_id_fk: GAS, arera_category: 'GAS_OTHER', gas_use_category: 'C1' });
    await utility({ supply_active: 0 });
    const a = await run();
    expect(ids(a, 'active_utilities_without_arera_category')).toEqual([light]);
    expect(ids(a, 'active_gas_utilities_without_use_category')).toEqual([gas]);
  });

  it('a carico: da volturare con le parti del contratto immobiliare, da reintestare, da decidere', async () => {
    const party = await insertThirdParty(ds, { company_name: 'Delta' });
    const building = await asset();
    const grant = await insertGrant(ds, [party], {
      end_date: day(-1),
      tacit_renewal: 1,
      renewal_months: 12,
    });
    await insert(ds, 'utilizer_grant_assets', { utilizer_grant_id: grant, asset_id: building });
    const ended = await insertGrant(ds, [await insertThirdParty(ds)], { end_date: day(-1) });
    await insert(ds, 'utilizer_grant_assets', { utilizer_grant_id: ended, asset_id: building });
    const transfer = await utility({ cost_status: 'TO_TRANSFER', pending_since: day(-10) });
    await insert(ds, 'utility_assets', { utility_id: transfer, asset_id: building });
    const older = await utility({ cost_status: 'TO_TRANSFER', pending_since: day(-20) });
    await utility({ cost_status: 'TO_TRANSFER', supply_active: 0 });
    const recover = await utility({
      cost_status: 'TO_RECOVER',
      transferred_to_third_party_id: party,
      pending_since: day(-3),
    });
    const decide = await utility({ cost_status: 'TO_DECIDE' });
    const a = await run();
    expect(a.utilities_to_transfer.items).toEqual([
      expect.objectContaining({ id: older, contracts: null, pending_days: 20 }),
      expect.objectContaining({ id: transfer, contracts: 'Delta', pending_days: 10 }),
    ]);
    expect(a.utilities_to_recover.items).toEqual([
      expect.objectContaining({ id: recover, contracts: 'Delta', pending_days: 3 }),
    ]);
    expect(a.utilities_to_decide.items).toEqual([
      expect.objectContaining({ id: decide, pending_days: 0 }),
    ]);
  });

  it('immobili: classificazione, in uso senza contratto passivo, catasto, MEF', async () => {
    const building = await insert(ds, 'asset_natures', { ...who, name: 'Fabbricato' });
    const land = await insert(ds, 'asset_natures', { ...who, name: 'Terreno' });
    const office = await insert(ds, 'asset_functions', { ...who, name: 'Ufficio' });
    const typed = await insert(ds, 'asset_functions', {
      ...who,
      name: 'Scuola',
      mef_building_type: 'SCHOOL',
    });
    await insert(ds, 'asset_functions', { ...who, name: 'Inutile' });
    const leased = await insert(ds, 'asset_functions', { ...who, name: 'Solo in affitto' });
    await asset({
      asset_name: 'J',
      ownership: 0,
      nature_id: land,
      function_id: leased,
      status: 'Dismesso',
    });
    const noFunction = await asset({ asset_name: 'K', nature_id: land });
    await insert(ds, 'asset_cadastral_units', { asset_id: noFunction, sheet: 'k', parcel: '1' });
    const both = await asset({ asset_name: 'A' });
    const noNature = await asset({ asset_name: 'B', function_id: typed });
    const mef = await asset({ asset_name: 'C', nature_id: building, function_id: office });
    await asset({ asset_name: 'D', nature_id: building, function_id: typed, mef_id: 7 });
    await asset({ asset_name: 'E', nature_id: land, function_id: typed });
    const rented = await asset({
      asset_name: 'F',
      ownership: 0,
      nature_id: land,
      function_id: typed,
    });
    const passive = await asset({
      asset_name: 'G',
      ownership: 0,
      nature_id: land,
      function_id: typed,
    });
    const g = await insertGrant(ds, [], { direction: 'PASSIVE' });
    await insert(ds, 'utilizer_grant_assets', { utilizer_grant_id: g, asset_id: passive });
    const active = await asset({
      asset_name: 'H',
      ownership: 0,
      nature_id: land,
      function_id: typed,
    });
    const ga = await insertGrant(ds, []);
    await insert(ds, 'utilizer_grant_assets', { utilizer_grant_id: ga, asset_id: active });
    await asset({
      asset_name: 'I',
      ownership: 0,
      status: 'Dismesso',
      nature_id: land,
      function_id: typed,
    });
    for (const id of [noNature, mef])
      await insert(ds, 'asset_cadastral_units', { asset_id: id, sheet: String(id), parcel: '1' });
    const a = await run();
    expect(a.assets_without_classification.items).toEqual([
      { id: both, asset_name: 'A', missing: 'natura e funzione' },
      { id: noNature, asset_name: 'B', missing: 'natura' },
      { id: noFunction, asset_name: 'K', missing: 'funzione' },
    ]);
    expect(ids(a, 'rented_assets_without_passive_contract')).toEqual([rented, active]);
    expect(ids(a, 'assets_without_cadastre')).toEqual([
      both,
      expect.any(Number),
      expect.any(Number),
    ]);
    expect(ids(a, 'assets_without_cadastre')).not.toContain(rented);
    expect(ids(a, 'assets_without_mef_id')).toEqual([mef]);
    expect(a.functions_without_mef_type.items).toEqual([{ id: office, name: 'Ufficio' }]);
  });

  it('units_without_subordinate: stessa via, civico, foglio e particella senza subalterno', async () => {
    const at = { address: 'Via Roma', civic_number: '1' };
    const p = await asset(at);
    const other = await asset(at);
    const elsewhere = await asset({ address: 'Via Roma', civic_number: '2' });
    await insert(ds, 'asset_cadastral_units', { asset_id: p, sheet: '5', parcel: '10' });
    await insert(ds, 'asset_cadastral_units', {
      asset_id: other,
      sheet: '5',
      parcel: '10',
      subordinate: '2',
    });
    await insert(ds, 'asset_cadastral_units', { asset_id: elsewhere, sheet: '5', parcel: '10' });
    const otherParcel = await asset(at);
    await insert(ds, 'asset_cadastral_units', { asset_id: otherParcel, sheet: '5', parcel: '11' });
    expect(ids(await run(), 'units_without_subordinate')).toEqual([p]);
  });

  it('capitoli: utenze senza capitolo, capitolo senza impegni del contratto', async () => {
    const chA = await chapter('A1');
    const chB = await chapter('B1');
    const c = await contract();
    await commitment({ budget_chapter_id_fk: chB }, { [year]: 100 }, [c]);
    const uncommitted = await utility({ budget_chapter_code_fk: chA });
    await link(c, uncommitted);
    const committed = await utility({ budget_chapter_code_fk: chB });
    await link(c, committed);
    const bare = await utility({ budget_chapter_code_fk: chA });
    await link(await contract(), bare);
    const noChapter = await utility();
    const free = await utility();
    await link(await contract({ contract_kind: 'FREE', cig_contract: null }), free);
    const a = await run();
    expect(a.utilities_with_uncommitted_chapter.items).toEqual([
      expect.objectContaining({ id: uncommitted, chapter: 'A1/0' }),
    ]);
    expect(ids(a, 'active_utilities_without_chapter')).toEqual([noChapter]);
  });

  it('invoice_lines_without_utility: solo fatture valide senza contratto', async () => {
    const inv = await insertInvoice(ds);
    await insertInvoiceLine(ds, inv, 5, { supply_code: 'POD1' });
    await insertInvoiceLine(ds, inv, 6, { utility_id_fk: await utility() });
    await insertInvoiceLine(ds, await insertInvoice(ds, { contratto_id_fk: await contract() }), 7);
    await insertInvoiceLine(ds, await insertInvoice(ds, { sdi_status: 'REJECTED' }), 8);
    await insertInvoiceLine(ds, await insertInvoice(ds, { deleted: 1 }), 9);
    const [{ invoice_id }] = await ds.query('SELECT invoice_id FROM invoices WHERE id = ?', [inv]);
    expect((await run()).invoice_lines_without_utility.items).toEqual([
      { invoice_id: inv, number: invoice_id, supply_code: 'POD1', amount: 5 },
    ]);
  });

  it('chapters_over_budget: impegnato appena sopra l’assestato sì, uguale no', async () => {
    const over = await chapter('A1', { description: 'Luce' });
    await spending(over, 100);
    await commitment({ budget_chapter_id_fk: over }, { [year]: 100.01 });
    const equal = await chapter('B1');
    await spending(equal, 100);
    await commitment({ budget_chapter_id_fk: equal }, { [year]: 100 });
    const invoiced = await chapter('C1');
    await spending(invoiced, 50);
    await commitment({ budget_chapter_id_fk: invoiced }, { [year - 1]: 500 });
    const u = await utility({ budget_chapter_code_fk: invoiced });
    await insertInvoiceLine(ds, await insertInvoice(ds, { invoice_date: `${year}-02-01` }), 50.01, {
      utility_id_fk: u,
    });
    const a = await run();
    expect(a.chapters_over_budget.items).toEqual([
      {
        id: over,
        chapter: 'A1/0',
        description: 'Luce',
        adjusted_budget: 100,
        committed: 100.01,
        invoiced: 0,
      },
      expect.objectContaining({ id: invoiced, invoiced: 50.01 }),
    ]);
  });

  it('chapters_without_budget: capitoli in uso senza assestato dell’esercizio', async () => {
    const used = await chapter('A1');
    await utility({ budget_chapter_code_fk: used });
    const budgeted = await chapter('B1');
    await utility({ budget_chapter_code_fk: budgeted });
    await spending(budgeted, 10);
    const nullBudget = await chapter('C1');
    await utility({ budget_chapter_code_fk: nullBudget });
    await spending(nullBudget, null);
    const lastYear = await chapter('D1');
    await utility({ budget_chapter_code_fk: lastYear });
    await spending(lastYear, 10, year - 1);
    const committed = await chapter('E1');
    await commitment({ budget_chapter_id_fk: committed }, { [year]: 10 });
    const oldCommitment = await chapter('F1');
    await commitment({ budget_chapter_id_fk: oldCommitment }, { [year - 1]: 10 });
    const inactive = await chapter('G1');
    await utility({ budget_chapter_code_fk: inactive, supply_active: 0 });
    expect(ids(await run(), 'chapters_without_budget')).toEqual([
      used,
      nullBudget,
      lastYear,
      committed,
    ]);
  });

  it('active_utilities_without_position: né proprie, né immobile, né impianto localizzati', async () => {
    const p = await utility();
    await utility({ latitude: '42', longitude: '14' });
    const viaAsset = await utility();
    await insert(ds, 'utility_assets', {
      utility_id: viaAsset,
      asset_id: await asset({ geocoded_latitude: '42', geocoded_longitude: '14' }),
    });
    const viaPlant = await utility();
    await insert(ds, 'utility_plants', {
      utility_id: viaPlant,
      plant_id: await insertPlant(ds, { latitude: '42', longitude: '14' }),
    });
    const viaPlantAsset = await utility();
    const plant = await insertPlant(ds);
    await insert(ds, 'plant_assets', {
      plant_id: plant,
      asset_id: await asset({ latitude: '42', longitude: '14' }),
    });
    await insert(ds, 'utility_plants', { utility_id: viaPlantAsset, plant_id: plant });
    const unlocated = await utility();
    await insert(ds, 'utility_assets', { utility_id: unlocated, asset_id: await asset() });
    const halfCoords = await utility({ latitude: '42' });
    expect(ids(await run(), 'active_utilities_without_position').sort()).toEqual(
      [p, unlocated, halfCoords].sort(),
    );
  });

  it('plants_fire_equipment_overdue: estintore scaduto il mese scorso sì, in scadenza questo mese no', async () => {
    // Primo giorno del mese a `offset` mesi da questo.
    const monthStart = (offset: number) => {
      const d = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
      d.setUTCMonth(d.getUTCMonth() + offset);
      return d.toISOString().slice(0, 10);
    };
    const lastMonth = monthStart(-1);
    const overdue = await insertPlant(ds, { type: 'FIRE_PROTECTION', code: 'F1' });
    await insert(ds, 'plant_fire_equipment', {
      ...who,
      plant_id: overdue,
      equipment_type: 'EXTINGUISHER',
      revision_due_on: lastMonth,
    });
    const check = await insertPlant(ds, { type: 'FIRE_PROTECTION', code: 'F2' });
    await insert(ds, 'plant_fire_equipment', {
      ...who,
      plant_id: check,
      equipment_type: 'EXTINGUISHER',
      last_check_on: monthStart(-7),
    });
    const thisMonth = await insertPlant(ds, { type: 'FIRE_PROTECTION', code: 'F3' });
    await insert(ds, 'plant_fire_equipment', {
      ...who,
      plant_id: thisMonth,
      equipment_type: 'EXTINGUISHER',
      revision_due_on: `${today.slice(0, 7)}-01`,
    });
    const checkedLately = await insertPlant(ds, { type: 'FIRE_PROTECTION', code: 'F5' });
    await insert(ds, 'plant_fire_equipment', {
      ...who,
      plant_id: checkedLately,
      equipment_type: 'EXTINGUISHER',
      last_check_on: monthStart(-6),
    });
    const hydrant = await insertPlant(ds, { type: 'FIRE_PROTECTION', code: 'F4' });
    await insert(ds, 'plant_fire_equipment', {
      ...who,
      plant_id: hydrant,
      equipment_type: 'HYDRANT',
      revision_due_on: lastMonth,
    });
    expect(ids(await run(), 'plants_fire_equipment_overdue')).toEqual([overdue, check]);
  });

  it('utilities_with_reactive_penalty: penale in un periodo finito da 364 giorni sì, 366 no', async () => {
    const recent = await utility();
    const old = await utility();
    const none = await utility();
    const reading = (u: number, end: string, penalty = 1) =>
      insert(ds, 'utility_consumptions', {
        ...who,
        utility_id_fk: u,
        kind: 'PERIOD',
        period_end: end,
        reactive_penalty: penalty,
      });
    await reading(recent, day(-364));
    await reading(old, day(-366));
    await reading(none, day(-10), 0);
    expect(ids(await run(), 'utilities_with_reactive_penalty')).toEqual([recent]);
  });

  it('plants_missing_inspections: verifiche di legge senza date', async () => {
    const elevator = await insertPlant(ds, { type: 'ELEVATOR', code: 'P1' });
    const done = await insertPlant(ds, { type: 'ELEVATOR', code: 'P2' });
    await insertPlantInspection(ds, done, {
      kind: ELEVATOR_INSPECTION_KIND,
      last_date: '2025-01-01',
    });
    const undated = await insertPlant(ds, { type: 'ELEVATOR', code: 'P3' });
    await insertPlantInspection(ds, undated, { kind: ELEVATOR_INSPECTION_KIND });
    await insertPlant(ds, { type: 'ELEVATOR', code: 'P4', status: 'DECOMMISSIONED' });
    const electrical = await insertPlant(ds, { type: 'ELECTRICAL_SYSTEM', code: 'P5' });
    await insert(ds, 'plant_electrical', { plant_id: electrical, lightning_protection: 1 });
    await insertPlantInspection(ds, electrical, {
      kind: GROUNDING_INSPECTION_KIND,
      next_date: '2027-01-01',
    });
    expect((await run()).plants_missing_inspections.items).toEqual([
      expect.objectContaining({ id: elevator, missing: ELEVATOR_INSPECTION_KIND }),
      expect.objectContaining({ id: undated, missing: ELEVATOR_INSPECTION_KIND }),
      expect.objectContaining({ id: electrical, missing: LIGHTNING_INSPECTION_KIND }),
    ]);
  });

  it('attivazioni e cessazioni in sospeso: la più vecchia per utenza', async () => {
    const u = await utility();
    await event(u, 'ACTIVATION', { requested_on: day(-5) });
    await event(u, 'ACTIVATION', { requested_on: day(-8) });
    await event(u, 'ACTIVATION', { requested_on: day(-30), cancelled_on: day(-1) });
    await event(u, 'ACTIVATION', { requested_on: day(-30), effective_on: day(-29) });
    await event(u, 'ACTIVATION', { requested_on: day(-30), date_unknown: 1 });
    await event(u, 'ACTIVATION', { requested_on: day(-30), deleted: 1 });
    await event(u, 'ACTIVATION', {
      requested_on: day(-30),
      utilizer_grant_id_fk: await insertGrant(ds, []),
    });
    const c = await utility();
    await event(c, 'CESSATION');
    await event(await utility(), 'TRANSFER', { requested_on: day(-3) });
    const a = await run();
    expect(a.pending_activations.items).toEqual([
      expect.objectContaining({ id: u, pending_days: 8 }),
    ]);
    expect(a.pending_cessations.items).toEqual([
      expect.objectContaining({ id: c, pending_days: 0 }),
    ]);
  });

  it('invoices_outside_supply_periods: 30 giorni dopo la cessazione sì, 31 no', async () => {
    const u = await utility({ supply_active: 0 });
    await event(u, 'CESSATION', { effective_on: day(-100) });
    const line = async (end: string) => {
      const inv = await insertInvoice(ds, { invoice_date: day(-10) });
      await insertInvoiceLine(ds, inv, 10, {
        utility_id_fk: u,
        period_start: day(-130),
        period_end: end,
      });
      return inv;
    };
    await line(day(-70));
    const outside = await line(day(-69));
    const rejected = await insertInvoice(ds, { invoice_date: day(-10), sdi_status: 'REJECTED' });
    await insertInvoiceLine(ds, rejected, 10, { utility_id_fk: u, period_end: day(-20) });
    expect((await run()).invoices_outside_supply_periods.items).toEqual([
      expect.objectContaining({ invoice_id: outside, utility_id: u, invoice_date: day(-10) }),
    ]);
  });

  describe('import fatture', () => {
    const imap = () =>
      Object.assign(process.env, {
        PEC_IMAP_HOST: 'imap.example.invalid',
        PEC_IMAP_USER: 'utente',
        PEC_IMAP_PASSWORD: 'x',
        INVOICE_IMPORT_DISABLED: 'false',
      });
    const lastSuccess = (minutes: number) => {
      const now = new Date(Math.floor(Date.now() / 1000) * 1000);
      service.now = () => now;
      return ds.query(
        'UPDATE invoice_import_state SET enabled = 1, last_run_at = ?, last_success_at = ? WHERE id = 1',
        [now, new Date(now.getTime() - minutes * 60_000)],
      );
    };

    it('invoice_import_stalled: 2 ore e 1 minuto senza giro riuscito sì, 1 ora e 59 no', async () => {
      imap();
      await lastSuccess(119);
      expect((await run()).invoice_import_stalled.count).toBe(0);
      await lastSuccess(121);
      expect((await run()).invoice_import_stalled.items).toEqual([
        { last_success_at: expect.any(String), last_error: null },
      ]);
      process.env.INVOICE_IMPORT_DISABLED = 'true';
      expect((await run()).invoice_import_stalled.count).toBe(0);
    });

    it('pending, esito scartato e strutture senza pattern', async () => {
      const s = await insertThirdParty(ds, { company_name: 'Epsilon' });
      const pending = await message({
        supplier_id_fk: s,
        document_number: 'F1',
        structure_key: 'k1',
      });
      await message({ supplier_id_fk: s, status: 'LINKED', structure_key: 'k1' });
      await message({ supplier_id_fk: s, status: 'IGNORED', structure_key: 'k2' });
      const discarded = await insertInvoice(ds, { sdi_outcome_discarded: 1 });
      await insertInvoice(ds, { sdi_outcome_discarded: 1, deleted: 1 });
      const a = await run();
      expect(a.invoice_import_pending.items).toEqual([
        { id: pending, supplier: 'Epsilon', number: 'F1', date: null },
      ]);
      expect(a.invoice_sdi_outcome_discarded.items).toEqual([
        expect.objectContaining({ invoice_id: discarded }),
      ]);
      expect(a.invoice_patterns_unknown.items).toEqual([
        expect.objectContaining({ supplier_id: s, structure_key: 'k1', count: 2 }),
      ]);
    });

    it('invoice_import_issues e utilities_with_meter_mismatch: ricontrollate al momento', async () => {
      const m = await message();
      const plain = await issue(m, 'TOTAL_MISMATCH');
      await issue(m, 'TOTAL_MISMATCH', { muted: 1 });
      await issue(await message({ status: 'IGNORED' }), 'TOTAL_MISMATCH');
      await issue(m, 'TOTAL_MISMATCH', { invoice_id_fk: await insertInvoice(ds, { deleted: 1 }) });
      await issue(m, 'TOTAL_MISMATCH', {
        invoice_id_fk: await insertInvoice(ds, { import_locked: 1 }),
      });
      const open = await insertInvoice(ds);
      await insertInvoiceLine(ds, open, 1);
      const unknown = await issue(m, 'UNKNOWN_UTILITY', { invoice_id_fk: open });
      const fixed = await insertInvoice(ds);
      await insertInvoiceLine(ds, fixed, 1, { utility_id_fk: await utility() });
      await issue(m, 'UNKNOWN_UTILITY', { invoice_id_fk: fixed });
      const meter = await utility({ meter_number: '00123' });
      const mismatch = await issue(m, 'METER_MISMATCH', { utility_id_fk: meter, value: '124' });
      await issue(m, 'METER_MISMATCH', {
        utility_id_fk: await utility({ meter_number: '123' }),
        value: '0 0123',
      });
      const a = await run();
      expect(ids(a, 'invoice_import_issues')).toEqual([mismatch, plain, unknown]);
      expect(a.utilities_with_meter_mismatch.items).toEqual([
        expect.objectContaining({ id: meter }),
      ]);
    });
  });

  it('impegni: sforati, senza contratto (una volta), senza importo', async () => {
    const ch = await chapter('A1');
    const c = await contract();
    const inv = await insertInvoice(ds);
    const over = await commitment({ budget_chapter_id_fk: ch }, { [year]: 100 }, [c]);
    await share(inv, over, year, 100.01);
    const full = await commitment({ budget_chapter_id_fk: ch }, { [year]: 100 }, [c]);
    await share(inv, full, year, 100);
    await share(await insertInvoice(ds, { sdi_status: 'REJECTED' }), full, year, 50);
    const multi = await commitment({ budget_chapter_id_fk: ch }, { [year]: 100, [year + 1]: 100 }, [
      c,
    ]);
    await share(inv, multi, year, 50);
    await share(await insertInvoice(ds), multi, year + 1, 60);
    const lastYear = await commitment({ budget_chapter_id_fk: ch }, { [year - 1]: 10 }, [c]);
    await share(inv, lastYear, year - 1, 20);
    const loose = await commitment({ budget_chapter_id_fk: ch }, { [year]: 5, [year + 1]: 5 });
    await commitment({ budget_chapter_id_fk: ch }, { [year - 1]: 5 });
    const noAmount = await commitment({ budget_chapter_id_fk: ch }, { [year]: null }, [c]);
    await commitment({ budget_chapter_id_fk: ch, deleted: 1 }, { [year]: null });
    const a = await run();
    expect(a.commitments_overspent.items).toEqual([
      expect.objectContaining({ id: over, chapter: 'A1/0', fiscal_year: year, remaining: -0.01 }),
    ]);
    expect(ids(a, 'commitments_without_contract')).toEqual([loose]);
    expect(ids(a, 'commitments_without_amount')).toEqual([noAmount]);
  });

  it('invoices_shares_mismatch: quote a mano lontane dal totale più di un centesimo', async () => {
    const ch = await chapter('A1');
    const k = await commitment({ budget_chapter_id_fk: ch }, { [year]: 1000 });
    const twoCents = await insertInvoice(ds, { total_amount: 100, invoice_date: '2025-01-01' });
    await share(twoCents, k, year, 99.98, 'MANUAL');
    const oneCent = await insertInvoice(ds, { total_amount: 100 });
    await share(oneCent, k, year, 99.99, 'MANUAL');
    const byLines = await insertInvoice(ds, { invoice_date: '2025-02-01' });
    await insertInvoiceLine(ds, byLines, 50);
    await share(byLines, k, year, 40, 'MANUAL');
    const auto = await insertInvoice(ds, { total_amount: 100 });
    await share(auto, k, year, 10);
    expect((await run()).invoices_shares_mismatch.items).toEqual([
      expect.objectContaining({ id: byLines, total: 50, shares: 40 }),
      expect.objectContaining({ id: twoCents, total: 100, shares: 99.98 }),
    ]);
  });

  it('accounting_liquidations_unmatched: né per IdentificativoSdI né per fornitore, numero e data', async () => {
    const s = await insertThirdParty(ds, { vat_number: '01234567890' });
    await insertInvoice(ds, {
      supplier_id_fk: s,
      invoice_id: '0012/A',
      invoice_date: '2025-03-01',
    });
    await insertInvoice(ds, { sdi_identifier: '999' });
    const ch = await chapter('A1');
    await commitment(
      { budget_chapter_id_fk: ch, commitment_year: 2025, commitment_num: 7, commitment_sub: 1 },
      {},
    );
    const liquidation = (key: string, over: Record<string, unknown>) =>
      insert(ds, 'acc_liquidations', {
        liquidation_key: key,
        commitment_year: 2025,
        commitment_num: 7,
        commitment_sub: 1,
        fiscal_year: 2025,
        amount: 10,
        supplier_vat: '01234567890',
        invoice_date: '2025-03-01',
        ...over,
      });
    await liquidation('L1', { invoice_number: '12-a' });
    await liquidation('L2', { invoice_number: 'X', sdi_identifier: '999' });
    await liquidation('L3', { invoice_number: '13' });
    await liquidation('L4', { invoice_number: '14', commitment_num: 8 });
    await liquidation('L5', { invoice_number: '15', cancelled: 1 });
    await liquidation('L6', {});
    expect((await run()).accounting_liquidations_unmatched.items).toEqual([
      {
        id: 'L3',
        number: '13',
        date: '2025-03-01',
        amount: 10,
        supplier_vat: '01234567890',
        commitment: '2025/7/1',
      },
    ]);
  });

  it('contabilità: impegni senza contratto e utenze con più capitoli nell’ultimo esercizio', async () => {
    const chA = await chapter('A1');
    const chB = await chapter('B1');
    const acc = await commitment(
      {
        budget_chapter_id_fk: chA,
        source: 'ACCOUNTING',
        commitment_year: 2025,
        commitment_num: 3,
        commitment_sub: 1,
      },
      { 2025: 10 },
    );
    await commitment({ budget_chapter_id_fk: chA }, { 2025: 10 });
    const kB = await commitment({ budget_chapter_id_fk: chB }, { 2025: 10 }, [await contract()]);
    const ambiguous = await utility();
    const settled = await utility();
    const paid = async (u: number, k: number, y: number) => {
      const inv = await insertInvoice(ds);
      await insertInvoiceLine(ds, inv, 5, { utility_id_fk: u });
      await share(inv, k, y, 5, 'ACCOUNTING');
    };
    await paid(ambiguous, acc, 2025);
    await paid(ambiguous, kB, 2025);
    await paid(settled, acc, 2024);
    await paid(settled, kB, 2024);
    await paid(settled, acc, 2025);
    const a = await run();
    expect(a.accounting_commitments_without_contract.items).toEqual([
      { id: acc, label: '2025/3/1' },
    ]);
    expect(a.accounting_utility_chapter_ambiguous.items).toEqual([
      expect.objectContaining({ id: ambiguous, chapters: 'A1/0, B1/0' }),
    ]);
  });

  it('accounting_import_stale: 2 giorni meno un minuto no, 2 giorni e un minuto sì', async () => {
    const now = new Date(Math.floor(Date.now() / 1000) * 1000);
    service.now = () => now;
    delete process.env.ACCOUNTING_IMPORT_DISABLED;
    const state = (minutes: number | null) =>
      ds.query(
        'REPLACE INTO accounting_import_state (id, enabled, last_success_at) VALUES (1, 1, ?)',
        [minutes === null ? null : new Date(now.getTime() - minutes * 60_000)],
      );
    await state(2 * 24 * 60 - 1);
    expect((await run()).accounting_import_stale.count).toBe(0);
    await state(2 * 24 * 60 + 1);
    expect((await run()).accounting_import_stale.items).toEqual([
      { id: 1, label: 'Contabilità non aggiornata da 2 giorni' },
    ]);
    await state(null);
    expect((await run()).accounting_import_stale.items).toEqual([
      { id: 1, label: 'Contabilità mai caricata' },
    ]);
    service.inboxPresent = () => false;
    expect((await run()).accounting_import_stale.count).toBe(0);
  });

  it('invoices_without_commitment: senza impegni nell’esercizio o con impegni ma senza quota', async () => {
    const ch = await chapter('A1');
    const c = await contract();
    await commitment({ budget_chapter_id_fk: ch }, { 2025: 100 }, [c]);
    const ambiguous = await insertInvoice(ds, {
      contratto_id_fk: c,
      invoice_date: '2025-05-01',
      total_amount: 50,
    });
    const noCommitments = await insertInvoice(ds, {
      contratto_id_fk: c,
      invoice_date: '2025-01-10',
    });
    await insertInvoiceLine(ds, noCommitments, 30, {
      period_start: '2024-11-01',
      period_end: '2024-12-31',
    });
    const withShare = await insertInvoice(ds, { contratto_id_fk: c, total_amount: 50 });
    const k = await commitment({ budget_chapter_id_fk: ch }, { 2025: 100 });
    await share(withShare, k, 2025, 50);
    await insertInvoice(ds, { contratto_id_fk: c, total_amount: 0 });
    await insertInvoice(ds, { total_amount: 50 });
    await insertInvoice(ds, { contratto_id_fk: c, total_amount: 50, sdi_status: 'REJECTED' });
    expect((await run()).invoices_without_commitment.items).toEqual([
      expect.objectContaining({ id: ambiguous, contract_id: c, amount: 50, reason: 'AMBIGUOUS' }),
      expect.objectContaining({ id: noCommitments, amount: 30, reason: 'NO_COMMITMENTS' }),
    ]);
  });

  it('contracts_draft_overdue: bozze con inizio previsto già passato', async () => {
    const overdue = await contract({ draft: 1, supply_start_date: day(-5), cig_contract: ' ' });
    await contract({ draft: 1, supply_start_date: day(5) });
    await contract({ draft: 1, supply_start_date: day(-5), closed: 1 });
    await contract({ supply_start_date: day(-5) });
    expect((await run()).contracts_draft_overdue.items).toEqual([
      { id: overdue, cig_contract: null, supply_start_date: day(-5) },
    ]);
  });

  it('fabbisogno: convenzioni con impegni insufficienti e capitoli da variare', async () => {
    const s = await insertThirdParty(ds);
    const open = await insertConsipAgreement(ds, s, { name: 'Luce 21' });
    const order = await contract({ consip_agreement_id: open });
    const closed = await insertConsipAgreement(ds, s);
    await contract({ consip_agreement_id: closed, closed: 1 });
    const short = await chapter('A1', { description: 'Energia' });
    await spending(short, 1000);
    const k = await commitment({ budget_chapter_id_fk: short }, { [year]: 800 }, [order]);
    const enough = await chapter('B1');
    await spending(enough, 1000);
    const kEnough = await commitment({ budget_chapter_id_fk: enough }, { [year]: 700 }, [order]);
    await commitment({ budget_chapter_id_fk: enough }, { [year - 1]: 500 }, [order]);
    await commitment({ budget_chapter_id_fk: short }, { [year]: 1 }, [
      await contract({ consip_agreement_id: closed, closed: 1 }),
    ]);
    const forecast = (agreement: number, chapterId: number | null, shortfall: number, y = year) =>
      insert(ds, 'consip_agreement_forecasts', {
        consip_agreement_id_fk: agreement,
        budget_chapter_id_fk: chapterId,
        fiscal_year: y,
        utilities: 1,
        invoiced: 0,
        to_invoice: 0,
        committed: 0,
        remaining: 0,
        difference: 0,
        coverage: 1,
        shortfall,
        computed_at: new Date(),
      });
    await forecast(open, short, 300);
    await forecast(open, enough, 300);
    await forecast(open, null, 0);
    await forecast(open, short, 999, year - 1);
    await forecast(closed, short, 500);
    const a = await run();
    expect(a.agreements_commitments_short.items).toEqual([
      {
        id: open,
        label: 'Luce 21',
        missing: 600,
        chapters: [
          { id: short, label: 'A1/0 — Energia', missing: 300 },
          { id: enough, label: 'B1/0', missing: 300 },
        ],
        commitment_ids: [k, kEnough],
      },
    ]);
    expect(a.chapters_variation_needed.items).toEqual([
      { id: short, chapter: 'A1/0', description: 'Energia', missing: 300, available: 199 },
    ]);
  });
});
