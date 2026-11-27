import { EntityManager, SelectQueryBuilder } from 'typeorm';
import { NOT_DRAFT_SQL } from '@apis/contracts/contract-draft';
import { CommitmentShareSource } from '@apis/invoices/entity/commitment-share-source.enum';
import { NOT_REJECTED_SQL } from '@apis/invoices/sdi-status';
import { ASSET_REQUIRED_TYPES } from '@apis/plants/plant.calc';
import { partyNameSql } from '@apis/third-parties/third-party.name';
import { CostStatus, costStatusSql, inChargeSql } from '@apis/utility/cost-status';

// Letture delle anomalie (AnomaliesService) con il QueryBuilder; le due con una
// CTE sono in anomalies.sql.ts. Valori grezzi del driver (decimal come stringhe).

type Row = Record<string, unknown>;
type Qb = SelectQueryBuilder<Row>;

// Contratto valido oggi: non chiuso, non in bozza (contract-draft.ts) e con
// scadenza assente o non ancora passata (stessa definizione di "contratto
// corrente" in UtilitiesService).
const CURRENT = `(c.closed = 0 AND ${NOT_DRAFT_SQL('c')} AND (c.supply_expiry_date IS NULL OR c.supply_expiry_date >= CURDATE()))`;
const HAS_CIG = "TRIM(IFNULL(c.cig_contract, '')) <> ''";
const isSetSql = (col: string) => `IFNULL(TRIM(${col}), '') <> ''`;
// Coordinate proprie o geocodificate.
const hasPositionSql = (t: string) =>
  `((${isSetSql(`${t}.latitude`)} AND ${isSetSql(`${t}.longitude`)})
    OR (${isSetSql(`${t}.geocoded_latitude`)} AND ${isSetSql(`${t}.geocoded_longitude`)}))`;

const qb = (m: EntityManager): Qb => m.createQueryBuilder() as unknown as Qb;

export function contractsWithoutCig(m: EntityManager): Promise<Row[]> {
  return qb(m)
    .from('contracts', 'c')
    .leftJoin('third_parties', 's', 's.id = c.supplier_id_fk')
    .leftJoin('consip_agreement', 'ca', 'ca.id = c.consip_agreement_id')
    .select(['c.id AS id', `${partyNameSql('s')} AS supplier`, 'ca.name AS agreement'])
    .addSelect("DATE_FORMAT(c.supply_expiry_date, '%Y-%m-%d')", 'supply_expiry_date')
    .addSelect(
      (sub) =>
        sub.select('COUNT(*)').from('contract_utilities', 'cu').where('cu.contract_id = c.id'),
      'utilities',
    )
    .where(
      `c.deleted = 0 AND c.closed = 0 AND ${NOT_DRAFT_SQL('c')} AND c.contract_kind = 'STANDARD' AND NOT ${HAS_CIG}`,
    )
    .orderBy('supplier')
    .addOrderBy('c.id')
    .getRawMany();
}

// Utenze in carico al Comune: attive e non volturate (decisione utente
// 2026-10-19). Non vale per byCostStatus, che elenca proprio le volture.
function utilitiesInCharge(m: EntityManager): Qb {
  return qb(m)
    .from('utilities', 'u')
    .innerJoin('utility_types', 't', 't.id = u.utility_type_id_fk')
    .select(['u.id AS id', 'u.utility_id AS utility_id', 't.name AS type'])
    .where(`u.deleted = 0 AND ${inChargeSql('u')}`);
}

// Utenze in carico al Comune (id e codice), per le anomalie calcolate fuori da SQL.
export function utilitiesInChargeList(m: EntityManager): Promise<Row[]> {
  return utilitiesInCharge(m).getRawMany();
}

// Elenco «#id fornitore» dei contratti validi oggi dell'utenza.
function withCurrentContracts(q: Qb): Qb {
  return q.addSelect(
    (sub) =>
      sub
        .select(
          `GROUP_CONCAT(CONCAT('#', c.id, ' ', IFNULL(${partyNameSql('s')}, '?')) ORDER BY c.id SEPARATOR ', ')`,
        )
        .from('contract_utilities', 'cu')
        .innerJoin('contracts', 'c', 'c.id = cu.contract_id AND c.deleted = 0')
        .leftJoin('third_parties', 's', 's.id = c.supplier_id_fk')
        .where(`cu.utility_id = u.id AND ${CURRENT}`),
    'contracts',
  );
}

// EXISTS: l'utenza ha un contratto valido oggi (con la condizione in più).
function currentContractOf(q: Qb, extra = ''): string {
  return q
    .subQuery()
    .select('1')
    .from('contract_utilities', 'cu')
    .innerJoin('contracts', 'c', 'c.id = cu.contract_id AND c.deleted = 0')
    .where(`cu.utility_id = u.id AND ${CURRENT} ${extra}`)
    .getQuery();
}

const byUtility = (q: Qb): Promise<Row[]> =>
  q.orderBy('t.name').addOrderBy('u.utility_id').getRawMany();

export function utilitiesWithoutContract(m: EntityManager): Promise<Row[]> {
  const q = utilitiesInCharge(m);
  return byUtility(q.andWhere(`NOT EXISTS ${currentContractOf(q)}`));
}

export function utilitiesWithoutCigContract(m: EntityManager): Promise<Row[]> {
  const q = withCurrentContracts(utilitiesInCharge(m));
  return byUtility(
    q
      .andWhere(`EXISTS ${currentContractOf(q)}`)
      .andWhere(
        `NOT EXISTS ${currentContractOf(q, `AND (${HAS_CIG} OR c.contract_kind <> 'STANDARD')`)}`,
      ),
  );
}

// Due contratti validi oggi con periodi sovrapposti sulla stessa utenza
// (un subentro senza sovrapposizione, es. vecchio fino al 31/10 e nuovo
// dal 01/11, non è un'anomalia).
export function utilitiesWithOverlappingContracts(m: EntityManager): Promise<Row[]> {
  const q = withCurrentContracts(utilitiesInCharge(m));
  const open = (c: string) => `${c}.deleted = 0 AND ${c}.closed = 0 AND ${NOT_DRAFT_SQL(c)}`;
  const overlap = q
    .subQuery()
    .select('1')
    .from('contract_utilities', 'cu1')
    .innerJoin('contracts', 'c1', `c1.id = cu1.contract_id AND ${open('c1')}`)
    .innerJoin(
      'contract_utilities',
      'cu2',
      'cu2.utility_id = cu1.utility_id AND cu2.contract_id > cu1.contract_id',
    )
    .innerJoin('contracts', 'c2', `c2.id = cu2.contract_id AND ${open('c2')}`)
    .where('cu1.utility_id = u.id')
    .andWhere('(c1.supply_expiry_date IS NULL OR c1.supply_expiry_date >= CURDATE())')
    .andWhere('(c2.supply_expiry_date IS NULL OR c2.supply_expiry_date >= CURDATE())')
    .andWhere(
      "IFNULL(c1.supply_start_date, '1900-01-01') <= IFNULL(c2.supply_expiry_date, '9999-12-31')",
    )
    .andWhere(
      "IFNULL(c2.supply_start_date, '1900-01-01') <= IFNULL(c1.supply_expiry_date, '9999-12-31')",
    )
    .getQuery();
  return byUtility(q.andWhere(`EXISTS ${overlap}`));
}

export function duplicateCigs(m: EntityManager): Promise<{ cig: string; contracts: string }[]> {
  return qb(m)
    .from('contracts', 'c')
    .select(['MIN(TRIM(c.cig_contract)) AS cig', 'GROUP_CONCAT(c.id ORDER BY c.id) AS contracts'])
    .where(`c.deleted = 0 AND c.closed = 0 AND ${NOT_DRAFT_SQL('c')} AND ${HAS_CIG}`)
    .groupBy('LOWER(TRIM(c.cig_contract))')
    .having('COUNT(*) > 1')
    .getRawMany();
}

// Contratti immobiliari senza immobili attivi collegati (es. import non abbinato).
export function grantsWithoutAssets(m: EntityManager): Promise<Row[]> {
  const q = qb(m).from('utilizer_grant', 'g');
  const assets = q
    .subQuery()
    .select('1')
    .from('utilizer_grant_assets', 'a')
    .innerJoin('assets', 's', 's.id = a.asset_id AND s.deleted = 0')
    .where('a.utilizer_grant_id = g.id')
    .getQuery();
  return q
    .select('g.id', 'id')
    .addSelect(
      (sub) =>
        sub
          .select(`GROUP_CONCAT(${partyNameSql('tp')} ORDER BY tp.id SEPARATOR ', ')`)
          .from('utilizer_grant_parties', 'gp')
          .innerJoin('third_parties', 'tp', 'tp.id = gp.third_party_id AND tp.deleted = 0')
          .where('gp.utilizer_grant_id = g.id'),
      'counterparty',
    )
    .addSelect('g.subject', 'subject')
    .where(`g.deleted = 0 AND NOT EXISTS ${assets}`)
    .orderBy('counterparty')
    .addOrderBy('g.id')
    .getRawMany();
}

// Impianti senza alcuna posizione: né coordinate proprie, né geocodifica,
// né un immobile contenitore localizzato (stessa priorità di resolvePlantPosition).
export function plantsWithoutPosition(m: EntityManager): Promise<Row[]> {
  const q = qb(m).from('plants', 'p');
  const locatedAsset = q
    .subQuery()
    .select('1')
    .from('plant_assets', 'pa')
    .innerJoin('assets', 'a', 'a.id = pa.asset_id AND a.deleted = 0')
    .where(`pa.plant_id = p.id AND ${hasPositionSql('a')}`)
    .getQuery();
  return q
    .select(['p.id AS id', 'p.code AS code', 'p.name AS name', 'p.type AS type'])
    .where(`p.deleted = 0 AND NOT ${hasPositionSql('p')} AND NOT EXISTS ${locatedAsset}`)
    .orderBy('p.type')
    .addOrderBy('p.code')
    .getRawMany();
}

// Ascensori, antincendio e termici stanno sempre dentro un edificio.
export function plantsWithoutAsset(m: EntityManager): Promise<Row[]> {
  const q = qb(m).from('plants', 'p');
  const inAsset = q
    .subQuery()
    .select('1')
    .from('plant_assets', 'pa')
    .innerJoin('assets', 'a', 'a.id = pa.asset_id AND a.deleted = 0')
    .where('pa.plant_id = p.id')
    .getQuery();
  return q
    .select(['p.id AS id', 'p.code AS code', 'p.name AS name', 'p.type AS type'])
    .where('p.deleted = 0 AND p.type IN (:...types)', { types: ASSET_REQUIRED_TYPES })
    .andWhere(`NOT EXISTS ${inAsset}`)
    .orderBy('p.type')
    .addOrderBy('p.code')
    .getRawMany();
}

export function grantsWithoutParties(m: EntityManager): Promise<Row[]> {
  const q = qb(m).from('utilizer_grant', 'g');
  const parties = q
    .subQuery()
    .select('1')
    .from('utilizer_grant_parties', 'gp')
    .innerJoin('third_parties', 'tp', 'tp.id = gp.third_party_id AND tp.deleted = 0')
    .where('gp.utilizer_grant_id = g.id')
    .getQuery();
  return q
    .select(['g.id AS id', 'g.subject AS subject'])
    .where(`g.deleted = 0 AND NOT EXISTS ${parties}`)
    .orderBy('g.id')
    .getRawMany();
}

// Identificativo obbligatorio: P.IVA per i giuridici, CF per le persone.
export function partiesWithoutIdentifier(m: EntityManager): Promise<Row[]> {
  return qb(m)
    .from('third_parties', 'tp')
    .select(['tp.id AS id', `${partyNameSql('tp')} AS name`, 'tp.type AS type'])
    .where('tp.deleted = 0')
    .andWhere(
      `((tp.type = 'LEGAL' AND IFNULL(TRIM(tp.vat_number), '') = '')
        OR (tp.type = 'NATURAL' AND IFNULL(TRIM(tp.tax_code), '') = ''))`,
    )
    .orderBy('name')
    .getRawMany();
}

// Tipologia contrattuale ARERA da assegnare (Internet non ne ha).
export function utilitiesWithoutAreraCategory(m: EntityManager): Promise<Row[]> {
  return byUtility(
    utilitiesInCharge(m).andWhere("t.hard_type <> 'INTERNET' AND u.arera_category IS NULL"),
  );
}

// Categoria d'uso del gas (C1–C5, T1, T2) da assegnare.
export function gasWithoutUseCategory(m: EntityManager): Promise<Row[]> {
  return utilitiesInCharge(m)
    .andWhere("t.hard_type = 'GAS' AND u.gas_use_category IS NULL")
    .orderBy('u.utility_id')
    .getRawMany();
}

// «A carico di» dalla colonna di stato (SupplyReconcileService), giorni di
// attesa da pending_since, le più vecchie prima. Da volturare e da decidere:
// contratti = parti dei contratti immobiliari in corso sugli immobili
// dell'utenza (possono mancare); in corso come isGrantActive: stato ACTIVE e
// fine effettiva non passata (con il rinnovo tacito non passa mai). Da
// reintestare: a chi è volturata oggi.
export function utilitiesByCostStatus(
  m: EntityManager,
  status: CostStatus,
  today: string,
): Promise<Row[]> {
  const q = qb(m)
    .from('utilities', 'u')
    .innerJoin('utility_types', 't', 't.id = u.utility_type_id_fk')
    .select(['u.id AS id', 'u.utility_id AS utility_id', 't.name AS type'])
    .addSelect("DATE_FORMAT(u.pending_since, '%Y-%m-%d')", 'pending_since');
  if (status === CostStatus.TO_RECOVER) {
    q.leftJoin('third_parties', 'vt', 'vt.id = u.transferred_to_third_party_id').addSelect(
      partyNameSql('vt'),
      'contracts',
    );
  } else {
    q.leftJoin(
      (sub) =>
        sub
          .select('ua.utility_id', 'utility_id')
          .addSelect(
            `GROUP_CONCAT(DISTINCT ${partyNameSql('tp')} ORDER BY tp.id SEPARATOR ', ')`,
            'parties',
          )
          .from('utility_assets', 'ua')
          .innerJoin('assets', 'sa', 'sa.id = ua.asset_id AND sa.deleted = 0')
          .innerJoin('utilizer_grant_assets', 'uga', 'uga.asset_id = ua.asset_id')
          .innerJoin(
            'utilizer_grant',
            'g',
            `g.id = uga.utilizer_grant_id AND g.deleted = 0
             AND g.status = 'ACTIVE' AND g.direction = 'ACTIVE'
             AND (g.end_date IS NULL OR g.end_date >= :today
               OR (g.tacit_renewal = 1 AND IFNULL(g.renewal_months, 0) > 0))`,
          )
          .innerJoin('utilizer_grant_parties', 'gp', 'gp.utilizer_grant_id = g.id')
          .innerJoin('third_parties', 'tp', 'tp.id = gp.third_party_id AND tp.deleted = 0')
          .groupBy('ua.utility_id'),
      'x',
      'x.utility_id = u.id',
    )
      .addSelect('x.parties', 'contracts')
      .setParameter('today', today);
  }
  return q
    .where(`u.deleted = 0 AND u.supply_active = 1 AND ${costStatusSql(status, 'u')}`)
    .orderBy('u.pending_since IS NULL')
    .addOrderBy('u.pending_since')
    .addOrderBy('u.utility_id')
    .getRawMany();
}

// Natura e funzione sono l'unica classificazione dell'immobile.
export function assetsWithoutClassification(m: EntityManager): Promise<Row[]> {
  return qb(m)
    .from('assets', 'a')
    .select(['a.id AS id', 'a.asset_name AS asset_name'])
    .addSelect(
      `CASE WHEN a.nature_id IS NULL AND a.function_id IS NULL THEN 'natura e funzione'
            WHEN a.nature_id IS NULL THEN 'natura' ELSE 'funzione' END`,
      'missing',
    )
    .where('a.deleted = 0 AND (a.nature_id IS NULL OR a.function_id IS NULL)')
    .orderBy('a.asset_name')
    .getRawMany();
}

// Immobile attivo non di proprietà: il Comune lo usa a un titolo, quindi
// serve un contratto immobiliare passivo attivo che lo copra.
export function rentedWithoutPassive(m: EntityManager): Promise<Row[]> {
  const q = qb(m).from('assets', 'a');
  const passive = q
    .subQuery()
    .select('1')
    .from('utilizer_grant_assets', 'uga')
    .innerJoin(
      'utilizer_grant',
      'g',
      "g.id = uga.utilizer_grant_id AND g.deleted = 0 AND g.status = 'ACTIVE' AND g.direction = 'PASSIVE'",
    )
    .where('uga.asset_id = a.id')
    .getQuery();
  return q
    .select(['a.id AS id', 'a.asset_name AS asset_name'])
    .where(`a.deleted = 0 AND a.ownership = 0 AND a.status = 'Attivo' AND NOT EXISTS ${passive}`)
    .orderBy('a.asset_name')
    .getRawMany();
}

// Utenze su contratti aperti con impegni censiti, nessuno sul capitolo
// dell'utenza (solo contratti con almeno un impegno: finché gli impegni sono
// vuoti segnalerebbe tutte le utenze).
export function utilitiesWithUncommittedChapter(m: EntityManager): Promise<Row[]> {
  const q = withCurrentContracts(utilitiesInCharge(m))
    .innerJoin('budget_chapters', 'b', 'b.id = u.budget_chapter_code_fk')
    .addSelect("CONCAT(b.chapter_code, '/', b.article)", 'chapter');
  const anyCommitment = q
    .subQuery()
    .select('1')
    .from('budget_commitment_contracts', 'x')
    .innerJoin('budget_commitments', 'any_c', 'any_c.id = x.commitment_id AND any_c.deleted = 0')
    .where('x.contract_id = c.id')
    .getQuery();
  const sameChapter = q
    .subQuery()
    .select('1')
    .from('budget_commitment_contracts', 'y')
    .innerJoin('budget_commitments', 'bc', 'bc.id = y.commitment_id AND bc.deleted = 0')
    .where('y.contract_id = c.id AND bc.budget_chapter_id_fk = u.budget_chapter_code_fk')
    .getQuery();
  const uncommitted = q
    .subQuery()
    .select('1')
    .from('contract_utilities', 'cu')
    .innerJoin('contracts', 'c', 'c.id = cu.contract_id AND c.deleted = 0')
    .where(`cu.utility_id = u.id AND c.closed = 0 AND ${NOT_DRAFT_SQL('c')}`)
    .andWhere(`EXISTS ${anyCommitment} AND NOT EXISTS ${sameChapter}`)
    .getQuery();
  return byUtility(q.andWhere(`EXISTS ${uncommitted}`));
}

// Capitolo facoltativo sull'utenza: senza capitolo è da sistemare, salvo
// che la fornitura sia di un contratto a titolo gratuito in corso.
export function utilitiesWithoutChapter(m: EntityManager): Promise<Row[]> {
  const q = withCurrentContracts(utilitiesInCharge(m));
  return byUtility(
    q
      .andWhere('u.budget_chapter_code_fk IS NULL')
      .andWhere(`NOT EXISTS ${currentContractOf(q, "AND c.contract_kind = 'FREE'")}`),
  );
}

// Righe senza utenza né contratto in testata: quelle di una fattura con contratto
// (canoni, servizi del contratto) sono del contratto e non sono un'anomalia.
export function linesWithoutUtility(m: EntityManager): Promise<Row[]> {
  return qb(m)
    .from('invoice_lines', 'il')
    .innerJoin(
      'invoices',
      'i',
      `i.id = il.invoice_id_fk AND i.deleted = 0 AND ${NOT_REJECTED_SQL('i')}`,
    )
    .select([
      'i.id AS invoice_id',
      'i.invoice_id AS number',
      'il.supply_code AS supply_code',
      'il.amount AS amount',
    ])
    .where('il.utility_id_fk IS NULL AND i.contratto_id_fk IS NULL')
    .orderBy('i.invoice_date', 'DESC')
    .addOrderBy('i.id')
    .getRawMany();
}

export function chapterLabels(m: EntityManager, ids: number[]): Promise<Row[]> {
  return qb(m)
    .from('budget_chapters', 'b')
    .select([
      'b.id AS id',
      'b.chapter_code AS chapter_code',
      'b.article AS article',
      'b.description AS description',
    ])
    .where('b.deleted = 0 AND b.id IN (:...ids)', { ids })
    .getRawMany();
}

// Capitoli in uso (utenze in carico o impegni dell'esercizio) senza assestato.
export function chaptersWithoutBudget(m: EntityManager, year: number): Promise<Row[]> {
  const q = qb(m).from('budget_chapters', 'b');
  const utilities = q
    .subQuery()
    .select('1')
    .from('utilities', 'u')
    .where(`u.budget_chapter_code_fk = b.id AND u.deleted = 0 AND ${inChargeSql('u')}`)
    .getQuery();
  const commitments = q
    .subQuery()
    .select('1')
    .from('budget_commitments', 'c')
    .innerJoin('budget_commitment_years', 'cy', 'cy.commitment_id = c.id')
    .where('c.budget_chapter_id_fk = b.id AND c.deleted = 0 AND cy.fiscal_year = :year')
    .getQuery();
  const budget = q
    .subQuery()
    .select('1')
    .from('budget_chapter_spending', 's')
    .where('s.budget_chapter_id_fk = b.id AND s.deleted = 0 AND s.year = :year')
    .andWhere('s.adjusted_budget IS NOT NULL')
    .getQuery();
  return q
    .select([
      'b.id AS id',
      'b.chapter_code AS chapter_code',
      'b.article AS article',
      'b.description AS description',
    ])
    .where('b.deleted = 0')
    .andWhere(`(EXISTS ${utilities} OR EXISTS ${commitments})`)
    .andWhere(`NOT EXISTS ${budget}`)
    .setParameter('year', year)
    .orderBy('b.chapter_code')
    .addOrderBy('b.article')
    .getRawMany();
}

// Utenze attive senza posizione: né coordinate proprie, né un immobile
// localizzato, né un impianto localizzato (proprio o del suo immobile);
// stessa priorità della mappa.
export function utilitiesWithoutPosition(m: EntityManager): Promise<Row[]> {
  const q = utilitiesInCharge(m);
  const asset = q
    .subQuery()
    .select('1')
    .from('utility_assets', 'ua')
    .innerJoin('assets', 'a', 'a.id = ua.asset_id AND a.deleted = 0')
    .where(`ua.utility_id = u.id AND ${hasPositionSql('a')}`)
    .getQuery();
  const plantAsset = q
    .subQuery()
    .select('1')
    .from('plant_assets', 'pa')
    .innerJoin('assets', 'pa_a', 'pa_a.id = pa.asset_id AND pa_a.deleted = 0')
    .where(`pa.plant_id = p.id AND ${hasPositionSql('pa_a')}`)
    .getQuery();
  const plant = q
    .subQuery()
    .select('1')
    .from('utility_plants', 'up')
    .innerJoin('plants', 'p', 'p.id = up.plant_id AND p.deleted = 0')
    .where(`up.utility_id = u.id AND (${hasPositionSql('p')} OR EXISTS ${plantAsset})`)
    .getQuery();
  return byUtility(
    q
      .andWhere(`NOT (${isSetSql('u.latitude')} AND ${isSetSql('u.longitude')})`)
      .andWhere(`NOT EXISTS ${asset}`)
      .andWhere(`NOT EXISTS ${plant}`),
  );
}

// Catasto e censimento MEF: immobili di proprietà.
export function assetsWithoutCadastre(m: EntityManager): Promise<Row[]> {
  const q = qb(m).from('assets', 'b');
  const units = q
    .subQuery()
    .select('1')
    .from('asset_cadastral_units', 'cu')
    .where('cu.asset_id = b.id')
    .getQuery();
  return q
    .select(['b.id AS id', 'b.asset_name AS asset_name'])
    .where(`b.deleted = 0 AND b.ownership = 1 AND NOT EXISTS ${units}`)
    .orderBy('b.asset_name')
    .getRawMany();
}

// Dipende dal nome della tipologia: rinominare «Fabbricato» azzera la segnalazione.
export function assetsWithoutMefId(m: EntityManager): Promise<Row[]> {
  return qb(m)
    .from('assets', 'b')
    .innerJoin(
      'asset_natures',
      'n',
      "n.id = b.nature_id AND n.name = 'Fabbricato' AND n.deleted = 0",
    )
    .select(['b.id AS id', 'b.asset_name AS asset_name'])
    .where('b.deleted = 0 AND b.ownership = 1 AND b.mef_id IS NULL')
    .orderBy('b.asset_name')
    .getRawMany();
}

// Immobili indistinguibili al catasto: stessi via, civico, foglio e
// particella di un altro immobile, ma senza subalterno.
export function unitsWithoutSubordinate(m: EntityManager): Promise<Row[]> {
  const q = qb(m).from('assets', 'b').innerJoin('asset_cadastral_units', 'u', 'u.asset_id = b.id');
  const twin = q
    .subQuery()
    .select('1')
    .from('assets', 'o')
    .innerJoin('asset_cadastral_units', 'ou', 'ou.asset_id = o.id')
    .where('o.deleted = 0 AND o.id <> b.id')
    .andWhere('ou.sheet = u.sheet AND ou.parcel = u.parcel')
    .andWhere("COALESCE(o.address, '') = COALESCE(b.address, '')")
    .andWhere("COALESCE(o.toponym, '') = COALESCE(b.toponym, '')")
    .andWhere("COALESCE(o.civic_number, '') = COALESCE(b.civic_number, '')")
    .getQuery();
  return q
    .select(['b.id AS id', 'b.asset_name AS asset_name'])
    .distinct(true)
    .where("b.deleted = 0 AND (u.subordinate IS NULL OR TRIM(u.subordinate) = '')")
    .andWhere(`EXISTS ${twin}`)
    .orderBy('b.asset_name')
    .getRawMany();
}

export function functionsWithoutMefType(m: EntityManager): Promise<Row[]> {
  const q = qb(m).from('asset_functions', 'f');
  const owned = q
    .subQuery()
    .select('1')
    .from('assets', 'b')
    .where('b.function_id = f.id AND b.deleted = 0 AND b.ownership = 1')
    .getQuery();
  return q
    .select(['f.id AS id', 'f.name AS name'])
    .where(`f.deleted = 0 AND f.mef_building_type IS NULL AND EXISTS ${owned}`)
    .orderBy('f.name')
    .getRawMany();
}

// Gemello SQL di fireEquipmentDeadlines (plants/plant.calc.ts): scadenza
// valida fino a fine mese, controllo semestrale = ultimo controllo + 6 mesi.
// Oggi passato da Node (stesso todayIso della scheda impianto), non CURDATE().
export function fireEquipmentOverdue(m: EntityManager, today: string): Promise<Row[]> {
  return qb(m)
    .from('plants', 'p')
    .innerJoin(
      'plant_fire_equipment',
      'e',
      "e.plant_id = p.id AND e.deleted = 0 AND e.equipment_type = 'EXTINGUISHER'",
    )
    .select(['p.id AS id', 'p.code AS code', 'p.name AS name', 'p.type AS type'])
    .distinct(true)
    .where("p.deleted = 0 AND p.type = 'FIRE_PROTECTION'")
    .andWhere(
      `(LAST_DAY(e.revision_due_on) < CAST(:today AS DATE)
        OR LAST_DAY(e.test_due_on) < CAST(:today AS DATE)
        OR LAST_DAY(DATE_ADD(e.last_check_on, INTERVAL 6 MONTH)) < CAST(:today AS DATE))`,
      { today },
    )
    .orderBy('p.code')
    .getRawMany();
}

// Penali per energia reattiva (basso cos φ) in un periodo terminato negli
// ultimi 365 giorni: impianto da rifasare. Oggi passato da Node.
export function reactivePenalty(m: EntityManager, today: string): Promise<Row[]> {
  return byUtility(
    qb(m)
      .from('utilities', 'u')
      .innerJoin('utility_types', 't', 't.id = u.utility_type_id_fk')
      .innerJoin(
        'utility_consumptions',
        'uc',
        `uc.utility_id_fk = u.id AND uc.deleted = 0 AND uc.kind = 'PERIOD' AND uc.reactive_penalty = 1
         AND uc.period_end > DATE_SUB(CAST(:today AS DATE), INTERVAL 365 DAY)`,
        { today },
      )
      .select(['u.id AS id', 'u.utility_id AS utility_id', 't.name AS type'])
      .distinct(true)
      .where('u.deleted = 0'),
  );
}

// Dati che determinano le verifiche di legge (plant.calc missingInspections)
// e i tipi delle verifiche con una data (separati da a capo).
export function inspectionCandidates(m: EntityManager): Promise<Row[]> {
  return qb(m)
    .from('plants', 'p')
    .leftJoin('plant_electrical', 'e', 'e.plant_id = p.id')
    .leftJoin('plant_thermal', 't', 't.plant_id = p.id')
    .select([
      'p.id AS id',
      'p.code AS code',
      'p.name AS name',
      'p.type AS type',
      'p.status AS status',
      'e.grounding_class AS grounding_class',
      'e.lightning_protection AS lightning_protection',
      't.power_kw AS power_kw',
    ])
    .addSelect(
      (sub) =>
        sub
          .select("GROUP_CONCAT(i.kind SEPARATOR '\\n')")
          .from('plant_inspections', 'i')
          .where('i.plant_id = p.id AND i.deleted = 0')
          .andWhere('(i.last_date IS NOT NULL OR i.next_date IS NOT NULL)'),
      'dated_kinds',
    )
    .where("p.deleted = 0 AND p.type IN ('ELEVATOR', 'ELECTRICAL_SYSTEM', 'THERMAL')")
    .orderBy('p.code')
    .getRawMany();
}

// Attivazioni e cessazioni manuali in sospeso.
export function pendingSupplyEvents(m: EntityManager): Promise<Row[]> {
  return qb(m)
    .from('utility_supply_events', 'e')
    .innerJoin('utilities', 'u', 'u.id = e.utility_id_fk AND u.deleted = 0')
    .innerJoin('utility_types', 't', 't.id = u.utility_type_id_fk')
    .select([
      'u.id AS utility_pk',
      'u.utility_id AS utility_id',
      't.name AS type',
      'e.type AS event_type',
      'e.requested_on AS requested_on',
      'e.create_date AS create_date',
    ])
    .where('e.deleted = 0 AND e.cancelled_on IS NULL AND e.effective_on IS NULL')
    .andWhere('e.date_unknown = 0 AND e.utilizer_grant_id_fk IS NULL')
    .andWhere("e.type IN ('ACTIVATION', 'CESSATION')")
    .orderBy('t.name')
    .addOrderBy('u.utility_id')
    .getRawMany();
}

// Righe con utenza di fatture valide degli ultimi 12 mesi.
export function recentUtilityLines(m: EntityManager, today: string): Promise<Row[]> {
  return qb(m)
    .from('invoice_lines', 'il')
    .innerJoin(
      'invoices',
      'i',
      `i.id = il.invoice_id_fk AND i.deleted = 0 AND ${NOT_REJECTED_SQL('i')}`,
    )
    .innerJoin('utilities', 'u', 'u.id = il.utility_id_fk AND u.deleted = 0')
    .select([
      'i.id AS invoice_id',
      'i.invoice_id AS number',
      'i.invoice_date AS invoice_date',
      'u.id AS utility_id',
      'u.utility_id AS utility_code',
      'il.period_start AS period_start',
      'il.period_end AS period_end',
    ])
    .where('COALESCE(il.period_end, i.invoice_date) >= CAST(:today AS DATE) - INTERVAL 12 MONTH', {
      today,
    })
    .getRawMany();
}

// Storico (non cancellato) delle utenze.
export function supplyEvents(m: EntityManager, utilityIds: number[]): Promise<Row[]> {
  return qb(m)
    .from('utility_supply_events', 'e')
    .select([
      'e.id AS id',
      'e.utility_id_fk AS utility_id_fk',
      'e.type AS type',
      'e.third_party_id_fk AS third_party_id_fk',
      'e.requested_on AS requested_on',
      'e.effective_on AS effective_on',
      'e.date_unknown AS date_unknown',
      'e.cancelled_on AS cancelled_on',
      'e.deleted AS deleted',
      'e.utilizer_grant_id_fk AS utilizer_grant_id_fk',
      'e.create_date AS create_date',
    ])
    .where('e.deleted = 0 AND e.utility_id_fk IN (:...utilityIds)', { utilityIds })
    .getRawMany();
}

export function invoiceImportState(m: EntityManager): Promise<Row | undefined> {
  return qb(m)
    .from('invoice_import_state', 's')
    .select([
      's.enabled AS enabled',
      's.last_run_at AS last_run_at',
      's.last_success_at AS last_success_at',
      's.last_error AS last_error',
    ])
    .where('s.id = 1')
    .getRawOne();
}

export function pendingSdiMessages(m: EntityManager): Promise<Row[]> {
  return qb(m)
    .from('sdi_messages', 'm')
    .leftJoin('third_parties', 'tp', 'tp.id = m.supplier_id_fk')
    .select([
      'm.id AS id',
      `${partyNameSql('tp')} AS supplier`,
      'm.document_number AS document_number',
      'm.document_date AS document_date',
    ])
    .where("m.status = 'PENDING'")
    .orderBy('m.document_date', 'DESC')
    .addOrderBy('m.id', 'DESC')
    .getRawMany();
}

export function outcomeDiscarded(m: EntityManager): Promise<Row[]> {
  return qb(m)
    .from('invoices', 'i')
    .select(['i.id AS invoice_id', 'i.invoice_id AS number'])
    .where('i.deleted = 0 AND i.sdi_outcome_discarded = 1')
    .orderBy('i.invoice_date', 'DESC')
    .addOrderBy('i.id', 'DESC')
    .getRawMany();
}

// Segnalazioni dell'import aperte, ricontrollate al momento: spariscono
// quando la causa è sistemata.
export function importIssues(m: EntityManager): Promise<Row[]> {
  const q = qb(m)
    .from('invoice_import_issues', 'ii')
    .leftJoin('utilities', 'uu', 'uu.id = ii.utility_id_fk')
    .innerJoin('sdi_messages', 'm', 'm.id = ii.sdi_message_id_fk')
    .leftJoin('invoices', 'i', 'i.id = ii.invoice_id_fk')
    .leftJoin('third_parties', 'tp', 'tp.id = m.supplier_id_fk');
  const lineWithoutUtility = q
    .subQuery()
    .select('1')
    .from('invoice_lines', 'l')
    .where('l.invoice_id_fk = ii.invoice_id_fk AND l.utility_id_fk IS NULL')
    .getQuery();
  const shares = q
    .subQuery()
    .select('1')
    .from('invoice_commitment_shares', 'fs')
    .where('fs.invoice_id_fk = ii.invoice_id_fk')
    .getQuery();
  const normalized = (col: string) => `UPPER(TRIM(LEADING '0' FROM REPLACE(${col}, ' ', '')))`;
  const otherMeter = q
    .subQuery()
    .select('1')
    .from('utilities', 'u')
    .where("u.id = ii.utility_id_fk AND COALESCE(u.meter_number, '') <> ''")
    .andWhere(`${normalized('u.meter_number')} <> ${normalized('ii.value')}`)
    .getQuery();
  return q
    .select([
      'ii.id AS id',
      'ii.sdi_message_id_fk AS message_id',
      'ii.invoice_id_fk AS invoice_id',
      'i.invoice_id AS number',
      'ii.type AS type',
      'ii.detail AS detail',
      'ii.utility_id_fk AS utility_id',
      'uu.utility_id AS utility_code',
    ])
    .where("m.status <> 'IGNORED' AND ii.muted = 0")
    .andWhere(
      `(ii.invoice_id_fk IS NULL
        OR (i.deleted = 0 AND i.import_locked = 0 AND COALESCE(i.sdi_status, '') <> 'REJECTED'))`,
    )
    .andWhere(`(ii.type <> 'UNKNOWN_UTILITY' OR EXISTS ${lineWithoutUtility})`)
    .andWhere(
      `(ii.type <> 'MISSING_COMMITMENT' OR (ii.invoice_id_fk IS NOT NULL AND NOT EXISTS ${shares}))`,
    )
    .andWhere("(ii.type <> 'SUPPLIER_NAME_MISMATCH' OR tp.update_date <= ii.create_date)")
    .andWhere("(ii.type <> 'BATCH_NOT_SUPPORTED' OR m.status = 'PENDING')")
    .andWhere(
      `(ii.type <> 'METER_MISMATCH' OR (m.status IN ('PENDING', 'LINKED') AND EXISTS ${otherMeter}))`,
    )
    .orderBy('ii.type')
    .addOrderBy('ii.id', 'DESC')
    .getRawMany();
}

// Annualità dell'esercizio e successive: speso dalle quote di fatture valide.
export function commitmentsCheck(m: EntityManager, year: number): Promise<Row[]> {
  return qb(m)
    .from('budget_commitment_years', 'bcy')
    .innerJoin('budget_commitments', 'bc', 'bc.id = bcy.commitment_id')
    .innerJoin('budget_chapters', 'b', 'b.id = bc.budget_chapter_id_fk')
    .select([
      'bc.id AS id',
      'bc.commitment_year AS commitment_year',
      'bc.commitment_num AS commitment_num',
      'bc.commitment_sub AS commitment_sub',
      'bcy.fiscal_year AS fiscal_year',
      'bcy.amount AS amount',
      "CONCAT(b.chapter_code, '/', b.article) AS chapter",
    ])
    .addSelect(
      (sub) =>
        sub
          .select('COUNT(*)')
          .from('budget_commitment_contracts', 'x')
          .where('x.commitment_id = bc.id'),
      'contracts',
    )
    .addSelect(
      (sub) =>
        sub
          .select('COALESCE(SUM(s.amount), 0)')
          .from('invoice_commitment_shares', 's')
          .innerJoin(
            'invoices',
            'i',
            `i.id = s.invoice_id_fk AND i.deleted = 0 AND ${NOT_REJECTED_SQL('i')}`,
          )
          .where('s.commitment_id_fk = bc.id AND s.fiscal_year = bcy.fiscal_year'),
      'spent',
    )
    .where('bc.deleted = 0 AND bcy.fiscal_year >= :year', { year })
    .orderBy('bcy.fiscal_year')
    .addOrderBy('b.chapter_code')
    .addOrderBy('b.article')
    .addOrderBy('bc.commitment_year')
    .addOrderBy('bc.commitment_num')
    .addOrderBy('bc.commitment_sub')
    .getRawMany();
}

// Quote a mano che non sommano al totale (senza totale: somma delle righe).
export function sharesMismatch(m: EntityManager): Promise<Row[]> {
  return qb(m)
    .from(
      (sub) =>
        sub
          .select('s.invoice_id_fk', 'id')
          .addSelect('SUM(s.amount)', 'shares')
          .addSelect(
            `COALESCE(MAX(si.total_amount),
               (SELECT SUM(l.amount) FROM invoice_lines l WHERE l.invoice_id_fk = s.invoice_id_fk), 0)`,
            'total',
          )
          .from('invoice_commitment_shares', 's')
          .innerJoin('invoices', 'si', 'si.id = s.invoice_id_fk')
          .where('s.source = :manual', { manual: CommitmentShareSource.MANUAL })
          .groupBy('s.invoice_id_fk'),
      't',
    )
    .innerJoin('invoices', 'i', `i.id = t.id AND i.deleted = 0 AND ${NOT_REJECTED_SQL('i')}`)
    .select(['i.id AS id', 'i.invoice_id AS number', 't.total AS total', 't.shares AS shares'])
    .where('ABS(t.shares - t.total) > 0.01')
    .orderBy('i.invoice_date', 'DESC')
    .addOrderBy('i.id', 'DESC')
    .getRawMany();
}

// Fatture con contratto che il ricalcolo lascia senza quota (importo diverso da 0),
// con periodo complessivo delle righe ed esercizi con annualità del contratto:
// la competenza si calcola in TS con la stessa regola del ricalcolo.
export function invoicesWithoutCommitment(m: EntityManager): Promise<Row[]> {
  const q = qb(m).from('invoices', 'i');
  const lines = (select: string) =>
    q
      .subQuery()
      .select(select)
      .from('invoice_lines', 'l')
      .where('l.invoice_id_fk = i.id')
      .getQuery();
  const amount = `COALESCE(i.total_amount, ${lines('SUM(l.amount)')}, 0)`;
  const shares = q
    .subQuery()
    .select('1')
    .from('invoice_commitment_shares', 's')
    .where('s.invoice_id_fk = i.id')
    .getQuery();
  return q
    .select([
      'i.id AS id',
      'i.invoice_id AS number',
      'i.invoice_date AS date',
      'i.contratto_id_fk AS contract_id',
    ])
    .addSelect(amount, 'amount')
    .addSelect(lines('MIN(l.period_start)'), 'period_start')
    .addSelect(lines('MAX(l.period_end)'), 'period_end')
    .addSelect(
      (sub) =>
        sub
          .select('GROUP_CONCAT(DISTINCT bcy.fiscal_year)')
          .from('budget_commitment_contracts', 'x')
          .innerJoin('budget_commitments', 'bc', 'bc.id = x.commitment_id AND bc.deleted = 0')
          .innerJoin('budget_commitment_years', 'bcy', 'bcy.commitment_id = bc.id')
          .where('x.contract_id = i.contratto_id_fk'),
      'years',
    )
    .where(`i.deleted = 0 AND ${NOT_REJECTED_SQL('i')} AND i.contratto_id_fk IS NOT NULL`)
    .andWhere(`NOT EXISTS ${shares}`)
    .andWhere(`${amount} <> 0`)
    .orderBy('i.invoice_date', 'DESC')
    .addOrderBy('i.id', 'DESC')
    .getRawMany();
}

export function accountingCommitmentsWithoutContract(m: EntityManager): Promise<Row[]> {
  const q = qb(m).from('budget_commitments', 'bc');
  const contracts = q
    .subQuery()
    .select('1')
    .from('budget_commitment_contracts', 'x')
    .where('x.commitment_id = bc.id')
    .getQuery();
  return q
    .select([
      'bc.id AS id',
      'bc.commitment_year AS commitment_year',
      'bc.commitment_num AS commitment_num',
      'bc.commitment_sub AS commitment_sub',
    ])
    .where(`bc.deleted = 0 AND bc.source = 'ACCOUNTING' AND NOT EXISTS ${contracts}`)
    .orderBy('bc.commitment_year', 'DESC')
    .addOrderBy('bc.commitment_num')
    .addOrderBy('bc.commitment_sub')
    .getRawMany();
}

export function accountingImportState(m: EntityManager): Promise<Row | undefined> {
  return qb(m)
    .from('accounting_import_state', 's')
    .select(['s.enabled AS enabled', 's.last_success_at AS last_success_at'])
    .where('s.id = 1')
    .getRawOne();
}

export function draftsOverdue(m: EntityManager): Promise<Row[]> {
  return qb(m)
    .from('contracts', 'c')
    .select(['c.id AS id', 'c.cig_contract AS cig_contract'])
    .addSelect("DATE_FORMAT(c.supply_start_date, '%Y-%m-%d')", 'supply_start_date')
    .where('c.deleted = 0 AND c.closed = 0 AND c.draft = 1 AND c.supply_start_date < CURDATE()')
    .orderBy('c.supply_start_date')
    .addOrderBy('c.id')
    .getRawMany();
}

// Fabbisogno delle convenzioni: solo dalla cache (consip_agreement_forecasts),
// mai un ricalcolo qui. Esercizio in corso, convenzioni con un ordine non chiuso.
function openAgreement(q: Qb): string {
  return q
    .subQuery()
    .select('1')
    .from('contracts', 'c')
    .where('c.consip_agreement_id = a.id AND c.deleted = 0 AND c.closed = 0')
    .getQuery();
}

export function agreementsShort(m: EntityManager): Promise<Row[]> {
  const q = qb(m)
    .from('consip_agreement_forecasts', 'f')
    .innerJoin('consip_agreement', 'a', 'a.id = f.consip_agreement_id_fk AND a.deleted = 0')
    .leftJoin('budget_chapters', 'b', 'b.id = f.budget_chapter_id_fk');
  const ofAgreement = q
    .subQuery()
    .select('1')
    .from('budget_commitment_contracts', 'bcc')
    .innerJoin('contracts', 'oc', 'oc.id = bcc.contract_id AND oc.deleted = 0')
    .where('bcc.commitment_id = bcm.id AND oc.consip_agreement_id = f.consip_agreement_id_fk')
    .getQuery();
  return q
    .select([
      'f.consip_agreement_id_fk AS id',
      'a.name AS name',
      'f.budget_chapter_id_fk AS chapter_id',
      'b.chapter_code AS chapter_code',
      'b.article AS article',
      'b.description AS description',
      'f.shortfall AS shortfall',
    ])
    .addSelect(
      (sub) =>
        sub
          .select('GROUP_CONCAT(DISTINCT bcm.id)')
          .from('budget_commitments', 'bcm')
          .innerJoin(
            'budget_commitment_years',
            'bcy',
            'bcy.commitment_id = bcm.id AND bcy.fiscal_year = f.fiscal_year',
          )
          .where('bcm.deleted = 0 AND bcm.budget_chapter_id_fk <=> f.budget_chapter_id_fk')
          .andWhere(`EXISTS ${ofAgreement}`),
      'commitment_ids',
    )
    .where('f.fiscal_year = YEAR(CURDATE()) AND f.shortfall > 0')
    .andWhere(`EXISTS ${openAgreement(q)}`)
    .orderBy('a.name')
    .addOrderBy('f.consip_agreement_id_fk')
    .addOrderBy('b.chapter_code')
    .addOrderBy('b.article')
    .getRawMany();
}

// Capitoli il cui ammanco supera il disponibile (assestato − impegnato) dell'esercizio.
export function chaptersVariationNeeded(m: EntityManager): Promise<Row[]> {
  return qb(m)
    .from((sub) => {
      sub
        .select('f.budget_chapter_id_fk', 'chapter_id')
        .addSelect('SUM(f.shortfall)', 'missing')
        .from('consip_agreement_forecasts', 'f')
        .innerJoin('consip_agreement', 'a', 'a.id = f.consip_agreement_id_fk AND a.deleted = 0')
        .where('f.fiscal_year = YEAR(CURDATE()) AND f.shortfall > 0')
        .andWhere('f.budget_chapter_id_fk IS NOT NULL');
      return sub.andWhere(`EXISTS ${openAgreement(sub)}`).groupBy('f.budget_chapter_id_fk');
    }, 'x')
    .innerJoin('budget_chapters', 'b', 'b.id = x.chapter_id AND b.deleted = 0')
    .innerJoin(
      'budget_chapter_spending',
      's',
      `s.budget_chapter_id_fk = b.id AND s.deleted = 0
       AND s.year = YEAR(CURDATE()) AND s.adjusted_budget IS NOT NULL`,
    )
    .leftJoin(
      (sub) =>
        sub
          .select('bcm.budget_chapter_id_fk', 'chapter_id')
          .addSelect('SUM(bcy.amount)', 'committed')
          .from('budget_commitment_years', 'bcy')
          .innerJoin('budget_commitments', 'bcm', 'bcm.id = bcy.commitment_id')
          .where('bcm.deleted = 0 AND bcy.fiscal_year = YEAR(CURDATE())')
          .groupBy('bcm.budget_chapter_id_fk'),
      'k',
      'k.chapter_id = b.id',
    )
    .select([
      'b.id AS id',
      'b.chapter_code AS chapter_code',
      'b.article AS article',
      'b.description AS description',
      'x.missing AS missing',
      's.adjusted_budget - COALESCE(k.committed, 0) AS available',
    ])
    .where('x.missing > s.adjusted_budget - COALESCE(k.committed, 0)')
    .orderBy('b.chapter_code')
    .addOrderBy('b.article')
    .getRawMany();
}
