// Recupero dati persi dall'import iniziale da UTENZE.accdb:
//  1. CIG DERIVATO delle utenze → contracts.cig_contract (mai importato);
//  2. utenze con testo multilinea in Access: l'import si interrompeva al primo
//     a capo, perdendo note intere e i campi successivi (capitolo, fornitore,
//     date contratto, coordinate, ...);
//  3. scadenza concessioni utilizzatori in formati non gg/mm/aaaa
//     ("24.9.2026", "1/1/2000"), scartata dall'import.
//
// Regola: si riempiono SOLO campi vuoti (o testo troncato dall'import). Un
// valore già presente e diverso è stato modificato in produzione: non si
// tocca, finisce nel report.
//
// Input: export mdbtools di UTENZE.accdb (separatore "|", UTF-8) in
//   src/data-importer/source/access-utenze.csv
//   src/data-importer/source/access-utilizzatori.csv
// (gitignored, dati reali). Export: vedi CLAUDE.md, "Export da .accdb via mdbtools".
//
// Uso (default: prova, nessuna scrittura; --apply scrive in transazione):
//   docker exec utenzepa-api-1 node -r ts-node/register -r tsconfig-paths/register tools/data-importer/backfill-access.ts [--apply]
// Report completo in /tmp/backfill-access-report.txt nel container.
import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import * as csv from 'csv-parser';
import { QueryRunner } from 'typeorm';
import dataSource from '../../src/database/data-source';
import {
  hasMultilineField,
  normalizeCoordinate,
  parseItalianDate,
  parseItalianDecimal,
  truncatedTextFix,
} from './backfill-access.lib';

const APPLY = process.argv.includes('--apply');
const SOURCE_DIR = path.join(process.cwd(), 'src', 'data-importer', 'source');
const REPORT_PATH = '/tmp/backfill-access-report.txt';
const SYSTEM_USER_ID = 1;

type Row = Record<string, string>;
type DbRow = Record<string, unknown>;

const changes: string[] = [];
const issues: string[] = [];

function readCsv(file: string): Promise<Row[]> {
  return new Promise((resolve, reject) => {
    const rows: Row[] = [];
    fs.createReadStream(path.join(SOURCE_DIR, file), { encoding: 'utf8' })
      .pipe(csv({ separator: '|' }))
      .on('data', (row: Row) => rows.push(row))
      .on('end', () => resolve(rows))
      .on('error', reject);
  });
}

const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v).trim());
const lower = (v: unknown): string => str(v).toLowerCase();
const isEmpty = (v: unknown): boolean => str(v) === '';
const dateStr = (v: unknown): string =>
  v instanceof Date ? v.toISOString().slice(0, 10) : str(v).slice(0, 10);

async function setField(
  qr: QueryRunner,
  table: 'utilities' | 'contracts' | 'utilizer_grant',
  id: number,
  column: string,
  label: string,
  from: unknown,
  to: unknown,
  guard: string,
  guardParams: unknown[] = [],
): Promise<void> {
  changes.push(`${label} | ${column}: ${JSON.stringify(str(from))} → ${JSON.stringify(to)}`);
  if (!APPLY) return;
  const result = await qr.query(
    `UPDATE \`${table}\` SET \`${column}\` = ?, updated_by_user_id = ? WHERE id = ? AND ${guard}`,
    [to, SYSTEM_USER_ID, id, ...guardParams],
  );
  if (!result?.affectedRows)
    issues.push(`${label} | ${column}: nessuna riga aggiornata (valore cambiato nel frattempo?)`);
}

const fillGuard = (column: string) => `(\`${column}\` IS NULL OR \`${column}\` = '')`;
const nullGuard = (column: string) => `\`${column}\` IS NULL`;

async function run(): Promise<void> {
  const utenze = await readCsv('access-utenze.csv');
  const utilizzatori = await readCsv('access-utilizzatori.csv');

  await dataSource.initialize();
  const qr = dataSource.createQueryRunner();
  await qr.connect();
  if (APPLY) await qr.startTransaction();

  try {
    const utilities: DbRow[] = await qr.query(
      `SELECT id, utility_id, notes, additional_notes, supplier_address, specifications,
              latitude, longitude, power_kw_electric, budget_chapter_code_fk
       FROM utilities WHERE deleted = 0`,
    );
    const utilityByCode = new Map(utilities.map((u) => [lower(u.utility_id), u]));

    // Contratto corrente: stessa definizione di UtilitiesService.loadCurrentContracts.
    const currentContracts: DbRow[] = await qr.query(
      `SELECT ranked.* FROM (
         SELECT cu.utility_id AS u_id, c.*,
                ROW_NUMBER() OVER (PARTITION BY cu.utility_id ORDER BY c.supply_start_date DESC, c.id DESC) AS rn
         FROM contract_utilities cu
         JOIN contracts c ON c.id = cu.contract_id AND c.deleted = 0
         WHERE c.supply_expiry_date IS NULL OR c.supply_expiry_date >= CURDATE()
       ) ranked WHERE ranked.rn = 1`,
    );
    const contractByUtility = new Map(currentContracts.map((c) => [Number(c.u_id), c]));

    const lookup = async (sql: string) =>
      new Map(((await qr.query(sql)) as DbRow[]).map((r) => [lower(r.k), Number(r.id)]));
    const supplierByCode = await lookup(
      'SELECT supplier_id AS k, id FROM suppliers WHERE deleted = 0',
    );
    const chapterByCode = await lookup(
      'SELECT chapter_code AS k, id FROM budget_chapters WHERE deleted = 0',
    );
    const agreementByName = await lookup(
      'SELECT name AS k, id FROM consip_agreement WHERE deleted = 0',
    );
    const assetByName = await lookup('SELECT asset_name AS k, id FROM assets WHERE deleted = 0');
    const utilizerByName = await lookup('SELECT name AS k, id FROM utilizer WHERE deleted = 0');

    // --- 1. CIG ---------------------------------------------------------
    for (const row of utenze) {
      const cig = str(row['CIG DERIVATO']);
      if (!cig) continue;
      const code = str(row['ID_utenza']);
      const utility = utilityByCode.get(code.toLowerCase());
      if (!utility) {
        issues.push(`CIG ${code}: utenza non presente nel DB`);
        continue;
      }
      const contract = contractByUtility.get(Number(utility.id));
      if (!contract) {
        issues.push(`CIG ${code}: nessun contratto corrente, CIG ${cig} da inserire a mano`);
        continue;
      }
      if (isEmpty(contract.cig_contract)) {
        await setField(
          qr,
          'contracts',
          Number(contract.id),
          'cig_contract',
          `CIG ${code} (contratto ${contract.id})`,
          contract.cig_contract,
          cig,
          fillGuard('cig_contract'),
        );
      } else if (lower(contract.cig_contract) !== cig.toLowerCase()) {
        issues.push(
          `CIG ${code}: contratto ${contract.id} ha già CIG ${str(contract.cig_contract)}, Access ${cig} — non modificato`,
        );
      }
    }

    // --- 2. Utenze multilinea ------------------------------------------
    for (const row of utenze.filter(hasMultilineField)) {
      const code = str(row['ID_utenza']);
      const label = `Utenza ${code}`;
      const utility = utilityByCode.get(code.toLowerCase());
      if (!utility) {
        issues.push(`${label}: non presente nel DB`);
        continue;
      }
      const uid = Number(utility.id);

      for (const [column, accessCol] of [
        ['notes', 'NOTE UTENZE'],
        ['additional_notes', 'NOTE AGGIUNTIVE UTENZE'],
        ['supplier_address', 'indirizzo indicato dal Fornitore'],
        ['specifications', 'specifiche'],
      ] as const) {
        const fix = truncatedTextFix(utility[column] as string, row[accessCol]);
        if (fix.conflict)
          issues.push(`${label} | ${column}: valore DB diverso da Access, non modificato`);
        if (fix.value !== null) {
          await setField(
            qr,
            'utilities',
            uid,
            column,
            label,
            utility[column],
            fix.value,
            '`' + column + '` <=> ?',
            [utility[column] ?? null],
          );
        }
      }

      for (const [column, accessCol] of [
        ['latitude', 'latitudine'],
        ['longitude', 'longitudine'],
      ] as const) {
        const value = normalizeCoordinate(row[accessCol]);
        if (value && isEmpty(utility[column])) {
          await setField(
            qr,
            'utilities',
            uid,
            column,
            label,
            utility[column],
            value,
            fillGuard(column),
          );
        }
      }

      const kw = parseItalianDecimal(row['potenza kw energia elettrica']);
      if (kw !== null && utility.power_kw_electric === null) {
        await setField(
          qr,
          'utilities',
          uid,
          'power_kw_electric',
          label,
          null,
          kw,
          nullGuard('power_kw_electric'),
        );
      }

      const chapterCode = lower(row['capitolo spesa']);
      if (chapterCode && utility.budget_chapter_code_fk === null) {
        const chapterId = chapterByCode.get(chapterCode);
        if (chapterId) {
          await setField(
            qr,
            'utilities',
            uid,
            'budget_chapter_code_fk',
            label,
            null,
            chapterId,
            nullGuard('budget_chapter_code_fk'),
          );
        } else {
          issues.push(`${label}: capitolo "${row['capitolo spesa']}" non trovato nel DB`);
        }
      }

      const contract = contractByUtility.get(uid);
      if (!contract) {
        issues.push(`${label}: nessun contratto corrente, dati contrattuali Access non applicati`);
        continue;
      }
      const cid = Number(contract.id);
      const clabel = `${label} (contratto ${cid})`;

      const supplierCode = lower(row['fornitore']);
      if (supplierCode && contract.supplier_id_fk === null) {
        const supplierId = supplierByCode.get(supplierCode);
        if (supplierId)
          await setField(
            qr,
            'contracts',
            cid,
            'supplier_id_fk',
            clabel,
            null,
            supplierId,
            nullGuard('supplier_id_fk'),
          );
        else issues.push(`${clabel}: fornitore "${row['fornitore']}" non trovato nel DB`);
      }

      const agreementName = lower(row['mercato di provenienza']);
      if (agreementName && contract.consip_agreement_id === null) {
        const agreementId = agreementByName.get(agreementName);
        if (agreementId)
          await setField(
            qr,
            'contracts',
            cid,
            'consip_agreement_id',
            clabel,
            null,
            agreementId,
            nullGuard('consip_agreement_id'),
          );
        else
          issues.push(
            `${clabel}: convenzione "${row['mercato di provenienza']}" non trovata nel DB`,
          );
      }

      const order = str(row['ordine consip']);
      if (order && isEmpty(contract.consip_order)) {
        await setField(
          qr,
          'contracts',
          cid,
          'consip_order',
          clabel,
          contract.consip_order,
          order,
          fillGuard('consip_order'),
        );
      }

      for (const [column, accessCol] of [
        ['supply_start_date', 'decorrenza fornitura'],
        ['supply_expiry_date', 'scadenza affidamento FORNITURA'],
        ['management_expiry_date', 'scadenza affidamento GESTIONE'],
        ['takeover_termination_date', 'data voltura o cessazione contatore'],
      ] as const) {
        const raw = str(row[accessCol]);
        if (!raw) continue;
        const value = parseItalianDate(raw);
        if (!value) {
          issues.push(`${clabel} | ${column}: "${raw}" non è una data, da inserire a mano`);
        } else if (contract[column] === null) {
          await setField(qr, 'contracts', cid, column, clabel, null, value, nullGuard(column));
        } else if (dateStr(contract[column]) !== value) {
          issues.push(
            `${clabel} | ${column}: DB ${dateStr(contract[column])}, Access ${value} — non modificato`,
          );
        }
      }
    }

    // --- 3. Scadenze concessioni utilizzatori --------------------------
    const grants: DbRow[] = await qr.query(
      'SELECT id, asset_id_fk, utilizer_id_fk, expire_date FROM utilizer_grant WHERE deleted = 0',
    );
    const grantByPair = new Map(grants.map((g) => [`${g.asset_id_fk}|${g.utilizer_id_fk}`, g]));
    for (const row of utilizzatori) {
      const raw = str(row['SCADENZA']);
      if (!raw) continue;
      const label = `Concessione "${str(row['utilizzatore'])}" su "${str(row['id_fabbricato'])}"`;
      const assetId = assetByName.get(lower(row['id_fabbricato']));
      const utilizerId = utilizerByName.get(lower(row['utilizzatore']));
      const grant = assetId && utilizerId ? grantByPair.get(`${assetId}|${utilizerId}`) : undefined;
      if (!grant) {
        issues.push(`${label}: concessione non trovata nel DB`);
        continue;
      }
      const value = parseItalianDate(raw);
      if (!value) {
        issues.push(`${label}: scadenza "${raw}" non è una data, da sistemare a mano`);
      } else if (grant.expire_date === null) {
        await setField(
          qr,
          'utilizer_grant',
          Number(grant.id),
          'expire_date',
          label,
          null,
          value,
          nullGuard('expire_date'),
        );
      } else if (dateStr(grant.expire_date) !== value) {
        issues.push(`${label}: DB ${dateStr(grant.expire_date)}, Access ${value} — non modificato`);
      }
    }

    if (APPLY) await qr.commitTransaction();
  } catch (error) {
    if (APPLY) await qr.rollbackTransaction();
    throw error;
  } finally {
    await qr.release();
    await dataSource.destroy();
  }

  const report = [
    `MODALITÀ: ${APPLY ? 'APPLY (scritto su DB)' : 'PROVA (nessuna scrittura)'}`,
    `\n== Modifiche (${changes.length}) ==`,
    ...changes,
    `\n== Da verificare a mano (${issues.length}) ==`,
    ...issues,
  ].join('\n');
  fs.writeFileSync(REPORT_PATH, report);
  console.log(
    `${APPLY ? 'APPLY' : 'PROVA'}: ${changes.length} modifiche, ${issues.length} segnalazioni → ${REPORT_PATH}`,
  );
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
