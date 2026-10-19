import { Injectable } from '@nestjs/common';
import { ASSET_REQUIRED_TYPES, missingInspections } from '@apis/plants/plant.calc';
import { GroundingClass, PlantStatus, PlantType } from '@apis/plants/enum/plant.enum';
import { todayIso } from '@apis/utilizer-grant/real-estate-contract.calc';
import { DataSource } from 'typeorm';
import { partyNameSql } from '@apis/third-parties/third-party.name';
import { CostStatus, costStatusSql } from '@apis/utility/cost-status';
import { chaptersYearSummary, currentYear } from '@apis/spending/chapter-year';
import { dbDay, romeDay } from '@apis/utility-supply/supply-reconcile.service';
import { SupplyEventLike } from '@apis/utility-supply/supply-state';
import { outOfPeriod } from '@apis/utility-supply/out-of-period';
import { SupplyEventType } from '@apis/utility-supply/enum/supply-event-type.enum';

// Contratto valido oggi: stessa definizione di "contratto corrente" usata in
// UtilitiesService (scadenza assente o non ancora passata).
// Contratto valido oggi: non chiuso e con scadenza assente o non ancora passata
// (stessa definizione di "contratto corrente" in UtilitiesService).
const CURRENT =
  '(c.closed = 0 AND (c.supply_expiry_date IS NULL OR c.supply_expiry_date >= CURDATE()))';
const HAS_CIG = "TRIM(IFNULL(c.cig_contract, '')) <> ''";

export interface AnomalyList<T> {
  count: number;
  items: T[];
}

export interface ContractAnomaly {
  id: number;
  supplier: string | null;
  agreement: string | null;
  supply_expiry_date: string | null;
  utilities: number;
}

export interface UtilityAnomaly {
  id: number;
  utility_id: string;
  type: string | null;
  contracts?: string | null;
}

export interface Anomalies {
  contracts_without_cig: AnomalyList<ContractAnomaly>;
  active_utilities_without_contract: AnomalyList<UtilityAnomaly>;
  active_utilities_without_cig_contract: AnomalyList<UtilityAnomaly>;
  utilities_with_overlapping_contracts: AnomalyList<UtilityAnomaly>;
  duplicate_cigs: AnomalyList<{ cig: string; contracts: number[] }>;
  real_estate_contracts_without_assets: AnomalyList<RealEstateContractAnomaly>;
  plants_without_position: AnomalyList<PlantAnomaly>;
  active_utilities_without_position: AnomalyList<UtilityAnomaly>;
  plants_without_asset: AnomalyList<PlantAnomaly>;
  plants_fire_equipment_overdue: AnomalyList<PlantAnomaly>;
  plants_missing_inspections: AnomalyList<PlantAnomaly & { missing: string }>;
  utilities_with_reactive_penalty: AnomalyList<UtilityAnomaly>;
  real_estate_contracts_without_parties: AnomalyList<{ id: number; subject: string | null }>;
  third_parties_without_identifier: AnomalyList<{ id: number; name: string; type: string }>;
  active_utilities_without_arera_category: AnomalyList<UtilityAnomaly>;
  active_gas_utilities_without_use_category: AnomalyList<UtilityAnomaly>;
  utilities_to_transfer: AnomalyList<PendingUtilityAnomaly>;
  utilities_to_recover: AnomalyList<PendingUtilityAnomaly>;
  assets_without_classification: AnomalyList<{ id: number; asset_name: string; missing: string }>;
  rented_assets_without_passive_contract: AnomalyList<{ id: number; asset_name: string }>;
  invoices_outside_supply_periods: AnomalyList<{
    invoice_id: number;
    number: string;
    invoice_date: string;
    utility_id: number;
    utility_code: string;
    // 'gg/mm/aaaa–gg/mm/aaaa'; null = riga senza periodo (conta la data fattura).
    period: string | null;
  }>;
  utilities_with_uncommitted_chapter: AnomalyList<UtilityAnomaly & { chapter: string }>;
  active_utilities_without_chapter: AnomalyList<UtilityAnomaly>;
  chapters_over_budget: AnomalyList<
    ChapterAnomaly & { adjusted_budget: number; committed: number; invoiced: number }
  >;
  chapters_without_budget: AnomalyList<ChapterAnomaly>;
  invoice_lines_without_utility: AnomalyList<{
    invoice_id: number;
    number: string;
    supply_code: string | null;
    amount: number;
  }>;
  assets_without_cadastre: AnomalyList<{ id: number; asset_name: string }>;
  assets_without_mef_id: AnomalyList<{ id: number; asset_name: string }>;
  units_without_subordinate: AnomalyList<{ id: number; asset_name: string }>;
  functions_without_mef_type: AnomalyList<{ id: number; name: string }>;
  utilities_to_decide: AnomalyList<PendingUtilityAnomaly>;
  pending_activations: AnomalyList<PendingUtilityAnomaly>;
  pending_cessations: AnomalyList<PendingUtilityAnomaly>;
}

// Pratica in sospeso: giorni dalla data evento (giorno di Roma).
export type PendingUtilityAnomaly = UtilityAnomaly & { pending_days: number };

export interface ChapterAnomaly {
  id: number;
  chapter: string;
  description: string | null;
}

export interface PlantAnomaly {
  id: number;
  code: string;
  name: string;
  type: string;
}

export interface RealEstateContractAnomaly {
  id: number;
  counterparty: string | null;
  subject: string | null;
}

const list = <T>(items: T[]): AnomalyList<T> => ({ count: items.length, items });

const daysSince = (since: string | null, today: string): number =>
  since
    ? Math.max(
        0,
        Math.round(
          (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${since}T00:00:00Z`)) / 86_400_000,
        ),
      )
    : 0;

const itDate = (day: string): string =>
  `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}`;

// Anomalie dei dati contrattuali mostrate in dashboard. Regola di fondo: un
// contratto senza CIG (e non esplicitamente escluso) è di fatto inesistente.
@Injectable()
export class AnomaliesService {
  constructor(private readonly dataSource: DataSource) {}

  // Sostituibile nei test.
  now: () => Date = () => new Date();

  async getAnomalies(): Promise<Anomalies> {
    const today = romeDay(this.now());
    const contractsWithoutCig: Record<string, unknown>[] = await this.dataSource.query(
      `SELECT c.id, ${partyNameSql('s')} AS supplier, ca.name AS agreement,
              DATE_FORMAT(c.supply_expiry_date, '%Y-%m-%d') AS supply_expiry_date,
              (SELECT COUNT(*) FROM contract_utilities cu WHERE cu.contract_id = c.id) AS utilities
       FROM contracts c
       LEFT JOIN third_parties s ON s.id = c.supplier_id_fk
       LEFT JOIN consip_agreement ca ON ca.id = c.consip_agreement_id
       WHERE c.deleted = 0 AND c.closed = 0 AND c.contract_kind = 'STANDARD' AND NOT ${HAS_CIG}
       ORDER BY supplier, c.id`,
    );

    const utilityColumns = `u.id, u.utility_id, t.name AS type`;
    const currentContractsList = `(SELECT GROUP_CONCAT(CONCAT('#', c.id, ' ', IFNULL(${partyNameSql('s')}, '?')) ORDER BY c.id SEPARATOR ', ')
        FROM contract_utilities cu JOIN contracts c ON c.id = cu.contract_id AND c.deleted = 0
        LEFT JOIN third_parties s ON s.id = c.supplier_id_fk
        WHERE cu.utility_id = u.id AND ${CURRENT}) AS contracts`;
    const activeUtilities = `FROM utilities u JOIN utility_types t ON t.id = u.utility_type_id_fk
       WHERE u.deleted = 0 AND u.supply_active = 1`;
    const currentContractOf = (extra = '') =>
      `SELECT 1 FROM contract_utilities cu JOIN contracts c ON c.id = cu.contract_id AND c.deleted = 0
       WHERE cu.utility_id = u.id AND ${CURRENT} ${extra}`;

    const withoutContract: UtilityAnomaly[] = await this.dataSource.query(
      `SELECT ${utilityColumns} ${activeUtilities}
       AND NOT EXISTS (${currentContractOf()}) ORDER BY t.name, u.utility_id`,
    );

    const withoutCigContract: UtilityAnomaly[] = await this.dataSource.query(
      `SELECT ${utilityColumns}, ${currentContractsList} ${activeUtilities}
       AND EXISTS (${currentContractOf()})
       AND NOT EXISTS (${currentContractOf(`AND (${HAS_CIG} OR c.contract_kind <> 'STANDARD')`)})
       ORDER BY t.name, u.utility_id`,
    );

    // Due contratti validi oggi con periodi sovrapposti sulla stessa utenza
    // (un subentro senza sovrapposizione, es. vecchio fino al 31/10 e nuovo
    // dal 01/11, non è un'anomalia).
    const overlapping: UtilityAnomaly[] = await this.dataSource.query(
      `SELECT ${utilityColumns}, ${currentContractsList} ${activeUtilities}
       AND EXISTS (
         SELECT 1 FROM contract_utilities cu1
         JOIN contracts c1 ON c1.id = cu1.contract_id AND c1.deleted = 0 AND c1.closed = 0
         JOIN contract_utilities cu2 ON cu2.utility_id = cu1.utility_id AND cu2.contract_id > cu1.contract_id
         JOIN contracts c2 ON c2.id = cu2.contract_id AND c2.deleted = 0 AND c2.closed = 0
         WHERE cu1.utility_id = u.id
           AND (c1.supply_expiry_date IS NULL OR c1.supply_expiry_date >= CURDATE())
           AND (c2.supply_expiry_date IS NULL OR c2.supply_expiry_date >= CURDATE())
           AND IFNULL(c1.supply_start_date, '1900-01-01') <= IFNULL(c2.supply_expiry_date, '9999-12-31')
           AND IFNULL(c2.supply_start_date, '1900-01-01') <= IFNULL(c1.supply_expiry_date, '9999-12-31'))
       ORDER BY t.name, u.utility_id`,
    );

    const duplicateCigs: { cig: string; contracts: string }[] = await this.dataSource.query(
      `SELECT MIN(TRIM(c.cig_contract)) AS cig, GROUP_CONCAT(c.id ORDER BY c.id) AS contracts
       FROM contracts c WHERE c.deleted = 0 AND c.closed = 0 AND ${HAS_CIG}
       GROUP BY LOWER(TRIM(c.cig_contract)) HAVING COUNT(*) > 1`,
    );

    // Contratti immobiliari senza immobili attivi collegati (es. import non abbinato).
    const contractsWithoutAssets: {
      id: unknown;
      counterparty: string | null;
      subject: string | null;
    }[] = await this.dataSource.query(
      `SELECT g.id,
              (SELECT GROUP_CONCAT(${partyNameSql('tp')} ORDER BY tp.id SEPARATOR ', ')
                 FROM utilizer_grant_parties gp JOIN third_parties tp ON tp.id = gp.third_party_id AND tp.deleted = 0
                WHERE gp.utilizer_grant_id = g.id) AS counterparty,
              g.subject
         FROM utilizer_grant g
         WHERE g.deleted = 0
           AND NOT EXISTS (SELECT 1 FROM utilizer_grant_assets a JOIN assets s ON s.id = a.asset_id AND s.deleted = 0
                           WHERE a.utilizer_grant_id = g.id)
         ORDER BY counterparty, g.id`,
    );

    // Impianti senza alcuna posizione: né coordinate proprie, né geocodifica,
    // né un immobile contenitore localizzato (stessa priorità di resolvePlantPosition).
    const isSetSql = (col: string) => `IFNULL(TRIM(${col}), '') <> ''`;
    const plantsWithoutPosition: { id: unknown; code: string; name: string; type: string }[] =
      await this.dataSource.query(
        `SELECT p.id, p.code, p.name, p.type
           FROM plants p
           WHERE p.deleted = 0
             AND NOT (${isSetSql('p.latitude')} AND ${isSetSql('p.longitude')})
             AND NOT (${isSetSql('p.geocoded_latitude')} AND ${isSetSql('p.geocoded_longitude')})
             AND NOT EXISTS (
               SELECT 1 FROM plant_assets pa JOIN assets a ON a.id = pa.asset_id AND a.deleted = 0
               WHERE pa.plant_id = p.id AND (
                    (${isSetSql('a.latitude')} AND ${isSetSql('a.longitude')})
                 OR (${isSetSql('a.geocoded_latitude')} AND ${isSetSql('a.geocoded_longitude')})))
           ORDER BY p.type, p.code`,
      );

    // Ascensori, antincendio e termici stanno sempre dentro un edificio.
    const requiredTypes = ASSET_REQUIRED_TYPES.map((t) => `'${t}'`).join(', ');
    const plantsWithoutAsset: { id: unknown; code: string; name: string; type: string }[] =
      await this.dataSource.query(
        `SELECT p.id, p.code, p.name, p.type FROM plants p
           WHERE p.deleted = 0 AND p.type IN (${requiredTypes})
             AND NOT EXISTS (SELECT 1 FROM plant_assets pa JOIN assets a ON a.id = pa.asset_id AND a.deleted = 0
                             WHERE pa.plant_id = p.id)
           ORDER BY p.type, p.code`,
      );

    const contractsWithoutParties: { id: unknown; subject: string | null }[] =
      await this.dataSource.query(
        `SELECT g.id, g.subject FROM utilizer_grant g
          WHERE g.deleted = 0
            AND NOT EXISTS (SELECT 1 FROM utilizer_grant_parties gp JOIN third_parties tp ON tp.id = gp.third_party_id AND tp.deleted = 0
                            WHERE gp.utilizer_grant_id = g.id)
          ORDER BY g.id`,
      );

    // Identificativo obbligatorio: P.IVA per i giuridici, CF per le persone.
    const partiesWithoutIdentifier: { id: unknown; name: string; type: string }[] =
      await this.dataSource.query(
        `SELECT tp.id, ${partyNameSql('tp')} AS name, tp.type FROM third_parties tp
          WHERE tp.deleted = 0
            AND ((tp.type = 'LEGAL' AND IFNULL(TRIM(tp.vat_number), '') = '')
              OR (tp.type = 'NATURAL' AND IFNULL(TRIM(tp.tax_code), '') = ''))
          ORDER BY name`,
      );

    // Tipologia contrattuale ARERA da assegnare (Internet non ne ha).
    const withoutAreraCategory: UtilityAnomaly[] = await this.dataSource.query(
      `SELECT ${utilityColumns} ${activeUtilities}
       AND t.hard_type <> 'INTERNET' AND u.arera_category IS NULL
       ORDER BY t.name, u.utility_id`,
    );

    // Categoria d'uso del gas (C1–C5, T1, T2) da assegnare.
    const gasWithoutUseCategory: UtilityAnomaly[] = await this.dataSource.query(
      `SELECT ${utilityColumns} ${activeUtilities}
       AND t.hard_type = 'GAS' AND u.gas_use_category IS NULL
       ORDER BY u.utility_id`,
    );

    // «A carico di» dalla colonna di stato (SupplyReconcileService), giorni
    // di attesa da pending_since. Contratti = parti dei contratti immobiliari
    // attivi sugli immobili dell'utenza (possono mancare). Le più vecchie prima.
    const grantPartiesJoin = `LEFT JOIN (SELECT ua.utility_id,
                    GROUP_CONCAT(DISTINCT ${partyNameSql('tp')} ORDER BY tp.id SEPARATOR ', ') AS parties
               FROM utility_assets ua
               JOIN assets sa ON sa.id = ua.asset_id AND sa.deleted = 0
               JOIN utilizer_grant_assets uga ON uga.asset_id = ua.asset_id
               JOIN utilizer_grant g ON g.id = uga.utilizer_grant_id AND g.deleted = 0
                 AND g.status = 'ACTIVE' AND g.direction = 'ACTIVE'
               JOIN utilizer_grant_parties gp ON gp.utilizer_grant_id = g.id
               JOIN third_parties tp ON tp.id = gp.third_party_id AND tp.deleted = 0
              GROUP BY ua.utility_id) x ON x.utility_id = u.id`;
    const pendingColumns = `${utilityColumns}, DATE_FORMAT(u.pending_since, '%Y-%m-%d') AS pending_since`;
    const pendingOrder = 'ORDER BY u.pending_since IS NULL, u.pending_since, u.utility_id';
    const byCostStatus = (status: CostStatus, contractsSql: string, join: string) =>
      this.dataSource.query(
        `SELECT ${pendingColumns}, ${contractsSql} AS contracts
         FROM utilities u JOIN utility_types t ON t.id = u.utility_type_id_fk
         ${join}
         WHERE u.deleted = 0 AND u.supply_active = 1
           AND ${costStatusSql(status, 'u')}
         ${pendingOrder}`,
      ) as Promise<Record<string, unknown>[]>;
    const toTransfer = await byCostStatus(CostStatus.TO_TRANSFER, 'x.parties', grantPartiesJoin);
    // Da reintestare: conta a chi è volturata oggi.
    const toRecover = await byCostStatus(
      CostStatus.TO_RECOVER,
      partyNameSql('vt'),
      'LEFT JOIN third_parties vt ON vt.id = u.transferred_to_third_party_id',
    );

    // Natura e funzione sono l'unica classificazione dell'immobile.
    const assetsWithoutClassification: { id: unknown; asset_name: string; missing: string }[] =
      await this.dataSource.query(
        `SELECT a.id, a.asset_name,
                CASE WHEN a.nature_id IS NULL AND a.function_id IS NULL THEN 'natura e funzione'
                     WHEN a.nature_id IS NULL THEN 'natura' ELSE 'funzione' END AS missing
           FROM assets a
          WHERE a.deleted = 0 AND (a.nature_id IS NULL OR a.function_id IS NULL)
          ORDER BY a.asset_name`,
      );

    // Immobile attivo non di proprietà: il Comune lo usa a un titolo, quindi
    // serve un contratto immobiliare passivo attivo che lo copra.
    const rentedWithoutPassive: { id: unknown; asset_name: string }[] = await this.dataSource.query(
      `SELECT a.id, a.asset_name FROM assets a
        WHERE a.deleted = 0 AND a.ownership = 0 AND a.status = 'Attivo'
          AND NOT EXISTS (SELECT 1 FROM utilizer_grant_assets uga
                          JOIN utilizer_grant g ON g.id = uga.utilizer_grant_id AND g.deleted = 0
                           AND g.status = 'ACTIVE' AND g.direction = 'PASSIVE'
                          WHERE uga.asset_id = a.id)
        ORDER BY a.asset_name`,
    );

    // Solo contratti che hanno almeno un impegno censito: finché gli impegni
    // sono vuoti segnalerebbe tutte le utenze.
    const uncommitted: Record<string, unknown>[] = await this.dataSource.query(
      `SELECT ${utilityColumns}, ${currentContractsList},
              CONCAT(b.chapter_code, '/', b.article) AS chapter
       FROM utilities u JOIN utility_types t ON t.id = u.utility_type_id_fk
       JOIN budget_chapters b ON b.id = u.budget_chapter_code_fk
       WHERE u.deleted = 0 AND u.supply_active = 1
       AND EXISTS (
         SELECT 1 FROM contract_utilities cu JOIN contracts c ON c.id = cu.contract_id AND c.deleted = 0
         WHERE cu.utility_id = u.id AND c.closed = 0
           AND EXISTS (SELECT 1 FROM budget_commitments any_c WHERE any_c.contract_id_fk = c.id AND any_c.deleted = 0)
           AND NOT EXISTS (SELECT 1 FROM budget_commitments bc
                           WHERE bc.contract_id_fk = c.id AND bc.deleted = 0
                             AND bc.budget_chapter_id_fk = u.budget_chapter_code_fk))
       ORDER BY t.name, u.utility_id`,
    );

    // Capitolo facoltativo sull'utenza: senza capitolo è da sistemare, salvo
    // che la fornitura sia di un contratto a titolo gratuito in corso.
    const withoutChapter: Record<string, unknown>[] = await this.dataSource.query(
      `SELECT ${utilityColumns}, ${currentContractsList} ${activeUtilities}
       AND u.budget_chapter_code_fk IS NULL
       AND NOT EXISTS (${currentContractOf("AND c.contract_kind = 'FREE'")})
       ORDER BY t.name, u.utility_id`,
    );

    const withoutUtility: Record<string, unknown>[] = await this.dataSource.query(
      `SELECT i.id AS invoice_id, i.invoice_id AS number, il.supply_code, il.amount
       FROM invoice_lines il JOIN invoices i ON i.id = il.invoice_id_fk AND i.deleted = 0
       WHERE il.utility_id_fk IS NULL
       ORDER BY i.invoice_date DESC, i.id`,
    );

    // Capitoli sull'esercizio in corso (scheda capitolo, roadmap voce 20).
    const year = currentYear();
    const summary = await chaptersYearSummary(
      (sql, params) => this.dataSource.query(sql, params),
      year,
    );
    const over = summary.filter((r) => r.over_budget);
    const overLabels: Record<string, unknown>[] = over.length
      ? await this.dataSource.query(
          'SELECT id, chapter_code, article, description FROM budget_chapters WHERE deleted = 0 AND id IN (?)',
          [over.map((r) => r.budget_chapter_id)],
        )
      : [];
    const labelOf = new Map(overLabels.map((b) => [Number(b.id), b] as const));
    const withoutBudget: Record<string, unknown>[] = await this.dataSource.query(
      `SELECT b.id, b.chapter_code, b.article, b.description FROM budget_chapters b
       WHERE b.deleted = 0
         AND (EXISTS (SELECT 1 FROM utilities u WHERE u.budget_chapter_code_fk = b.id AND u.deleted = 0 AND u.supply_active = 1)
              OR EXISTS (SELECT 1 FROM budget_commitments c WHERE c.budget_chapter_id_fk = b.id AND c.deleted = 0 AND c.fiscal_year = ?))
         AND NOT EXISTS (SELECT 1 FROM budget_chapter_spending s
                         WHERE s.budget_chapter_id_fk = b.id AND s.deleted = 0 AND s.year = ? AND s.adjusted_budget IS NOT NULL)
       ORDER BY b.chapter_code, b.article`,
      [year, year],
    );
    const chapterLabel = (b: Record<string, unknown>): ChapterAnomaly => ({
      id: Number(b.id),
      chapter: `${b.chapter_code}/${b.article}`,
      description: (b.description as string) ?? null,
    });

    // Utenze attive senza posizione: né coordinate proprie, né un immobile
    // localizzato, né un impianto localizzato (proprio o del suo immobile);
    // stessa priorità della mappa.
    const hasPositionSql = (t: string) =>
      `((${isSetSql(`${t}.latitude`)} AND ${isSetSql(`${t}.longitude`)})
        OR (${isSetSql(`${t}.geocoded_latitude`)} AND ${isSetSql(`${t}.geocoded_longitude`)}))`;
    const utilitiesWithoutPosition: UtilityAnomaly[] = await this.dataSource.query(
      `SELECT ${utilityColumns} ${activeUtilities}
       AND NOT (${isSetSql('u.latitude')} AND ${isSetSql('u.longitude')})
       AND NOT EXISTS (SELECT 1 FROM utility_assets ua JOIN assets a ON a.id = ua.asset_id AND a.deleted = 0
                       WHERE ua.utility_id = u.id AND ${hasPositionSql('a')})
       AND NOT EXISTS (
         SELECT 1 FROM utility_plants up JOIN plants p ON p.id = up.plant_id AND p.deleted = 0
         WHERE up.utility_id = u.id AND (${hasPositionSql('p')}
           OR EXISTS (SELECT 1 FROM plant_assets pa JOIN assets pa_a ON pa_a.id = pa.asset_id AND pa_a.deleted = 0
                      WHERE pa.plant_id = p.id AND ${hasPositionSql('pa_a')})))
       ORDER BY t.name, u.utility_id`,
    );

    // Catasto e censimento MEF (alias b: "FROM assets a" è già usato sopra).
    const withoutCadastre: { id: unknown; asset_name: string }[] = await this.dataSource.query(
      `/* assets_without_cadastre */ SELECT b.id, b.asset_name FROM assets b
        WHERE b.deleted = 0 AND b.ownership = 1
          AND NOT EXISTS (SELECT 1 FROM asset_cadastral_units cu WHERE cu.asset_id = b.id)
        ORDER BY b.asset_name`,
    );
    // Dipende dal nome della tipologia: rinominare «Fabbricato» azzera la segnalazione.
    const withoutMefId: { id: unknown; asset_name: string }[] = await this.dataSource.query(
      `/* assets_without_mef_id */ SELECT b.id, b.asset_name FROM assets b
         JOIN asset_natures n ON n.id = b.nature_id AND n.name = 'Fabbricato' AND n.deleted = 0
        WHERE b.deleted = 0 AND b.ownership = 1 AND b.mef_id IS NULL
        ORDER BY b.asset_name`,
    );
    // Immobili indistinguibili al catasto: stessi via, civico, foglio e
    // particella di un altro immobile, ma senza subalterno.
    const withoutSubordinate: { id: unknown; asset_name: string }[] = await this.dataSource.query(
      `/* units_without_subordinate */ SELECT DISTINCT b.id, b.asset_name FROM assets b
         JOIN asset_cadastral_units u ON u.asset_id = b.id
        WHERE b.deleted = 0 AND (u.subordinate IS NULL OR TRIM(u.subordinate) = '')
          AND EXISTS (SELECT 1 FROM assets o JOIN asset_cadastral_units ou ON ou.asset_id = o.id
                      WHERE o.deleted = 0 AND o.id <> b.id
                        AND ou.sheet = u.sheet AND ou.parcel = u.parcel
                        AND COALESCE(o.address, '') = COALESCE(b.address, '')
                        AND COALESCE(o.toponym, '') = COALESCE(b.toponym, '')
                        AND COALESCE(o.civic_number, '') = COALESCE(b.civic_number, ''))
        ORDER BY b.asset_name`,
    );
    const functionsWithoutMefType: { id: unknown; name: string }[] = await this.dataSource.query(
      `/* functions_without_mef_type */ SELECT f.id, f.name FROM asset_functions f
        WHERE f.deleted = 0 AND f.mef_building_type IS NULL
          AND EXISTS (SELECT 1 FROM assets b WHERE b.function_id = f.id AND b.deleted = 0 AND b.ownership = 1)
        ORDER BY f.name`,
    );
    // Gemello SQL di fireEquipmentDeadlines (plants/plant.calc.ts): scadenza
    // valida fino a fine mese, controllo semestrale = ultimo controllo + 6 mesi.
    // Oggi passato da Node (stesso todayIso della scheda impianto), non CURDATE().
    const fireOverdue: { id: unknown; code: string; name: string; type: string }[] =
      await this.dataSource.query(
        `/* plants_fire_equipment_overdue */ SELECT DISTINCT p.id, p.code, p.name, p.type FROM plants p
           CROSS JOIN (SELECT CAST(? AS DATE) AS today) t
           JOIN plant_fire_equipment e ON e.plant_id = p.id AND e.deleted = 0
                AND e.equipment_type = 'EXTINGUISHER'
          WHERE p.deleted = 0 AND p.type = 'FIRE_PROTECTION'
            AND (LAST_DAY(e.revision_due_on) < t.today
              OR LAST_DAY(e.test_due_on) < t.today
              OR LAST_DAY(DATE_ADD(e.last_check_on, INTERVAL 6 MONTH)) < t.today)
          ORDER BY p.code`,
        [todayIso()],
      );
    // Penali per energia reattiva (basso cos φ) in un periodo terminato negli
    // ultimi 365 giorni: impianto da rifasare. Oggi passato da Node.
    const reactivePenalty: UtilityAnomaly[] = await this.dataSource.query(
      `/* utilities_with_reactive_penalty */ SELECT DISTINCT ${utilityColumns}
         FROM utilities u JOIN utility_types t ON t.id = u.utility_type_id_fk
         CROSS JOIN (SELECT CAST(? AS DATE) AS today) d
         JOIN utility_consumptions uc ON uc.utility_id_fk = u.id AND uc.deleted = 0
              AND uc.kind = 'PERIOD' AND uc.reactive_penalty = 1
              AND uc.period_end > DATE_SUB(d.today, INTERVAL 365 DAY)
        WHERE u.deleted = 0
        ORDER BY t.name, u.utility_id`,
      [todayIso()],
    );
    // Verifiche obbligatorie per legge (plant.calc missingInspections): si
    // leggono i dati che le determinano e i nomi delle verifiche con data, il
    // confronto è in Node come nella scheda impianto.
    const requiredCandidates: {
      id: unknown;
      code: string;
      name: string;
      type: PlantType;
      status: PlantStatus;
      grounding_class: GroundingClass | null;
      lightning_protection: unknown;
      power_kw: string | number | null;
      dated_kinds: string | null;
    }[] = await this.dataSource.query(
      `/* plants_missing_inspections */ SELECT p.id, p.code, p.name, p.type, p.status,
              e.grounding_class, e.lightning_protection, t.power_kw,
              (SELECT GROUP_CONCAT(i.kind SEPARATOR '\n') FROM plant_inspections i
                WHERE i.plant_id = p.id AND i.deleted = 0
                  AND (i.last_date IS NOT NULL OR i.next_date IS NOT NULL)) AS dated_kinds
         FROM plants p
         LEFT JOIN plant_electrical e ON e.plant_id = p.id
         LEFT JOIN plant_thermal t ON t.plant_id = p.id
        WHERE p.deleted = 0 AND p.type IN ('ELEVATOR', 'ELECTRICAL_SYSTEM', 'THERMAL')
        ORDER BY p.code`,
    );
    const missingRequired = requiredCandidates
      .map((p) => ({
        p,
        missing: missingInspections(
          {
            type: p.type,
            status: p.status,
            electrical: { grounding_class: p.grounding_class, lightning_protection: !!Number(p.lightning_protection) },
            thermal: { power_kw: p.power_kw },
          },
          (p.dated_kinds ?? '').split('\n').filter(Boolean).map((kind) => ({ kind, last_date: 'x' })),
        ),
      }))
      .filter((x) => x.missing.length > 0);
    // Storico utenze (roadmap voce 22): query nuove in fondo (spec posizionale).
    const toDecide = await byCostStatus(CostStatus.TO_DECIDE, 'x.parties', grantPartiesJoin);

    // Attivazioni e cessazioni manuali in sospeso; data evento = richiesta,
    // altrimenti giorno di inserimento (Roma). Una per utenza, la più vecchia.
    const pendingSupply: Record<string, unknown>[] = await this.dataSource.query(
      `SELECT u.id AS utility_pk, u.utility_id, t.name AS type, e.type AS event_type,
              e.requested_on, e.create_date
         FROM utility_supply_events e
         JOIN utilities u ON u.id = e.utility_id_fk AND u.deleted = 0
         JOIN utility_types t ON t.id = u.utility_type_id_fk
        WHERE e.deleted = 0 AND e.cancelled_on IS NULL AND e.effective_on IS NULL
          AND e.date_unknown = 0 AND e.utilizer_grant_id_fk IS NULL
          AND e.type IN ('ACTIVATION', 'CESSATION')
        ORDER BY t.name, u.utility_id`,
    );
    const pendingOf = (type: SupplyEventType): PendingUtilityAnomaly[] => {
      const oldest = new Map<number, { item: UtilityAnomaly; since: string }>();
      for (const r of pendingSupply) {
        if (r.event_type !== type) continue;
        const since =
          dbDay(r.requested_on) ?? romeDay((r.create_date as Date | string) ?? this.now());
        const id = Number(r.utility_pk);
        const seen = oldest.get(id);
        if (seen && seen.since <= since) continue;
        oldest.set(id, {
          item: { id, utility_id: String(r.utility_id), type: (r.type as string) ?? null },
          since,
        });
      }
      return [...oldest.values()]
        .sort((p, q) => (p.since < q.since ? -1 : p.since > q.since ? 1 : 0))
        .map(({ item, since }) => ({ ...item, pending_days: daysSince(since, today) }));
    };

    // Fatture fuori dai periodi di attività: righe degli ultimi 12 mesi con
    // utenza, poi lo storico di quelle utenze; il confronto è in Node.
    const invoiceLines: Record<string, unknown>[] = await this.dataSource.query(
      `SELECT i.id AS invoice_id, i.invoice_id AS number, i.invoice_date,
              u.id AS utility_id, u.utility_id AS utility_code, il.period_start, il.period_end
         FROM invoice_lines il
         JOIN invoices i ON i.id = il.invoice_id_fk AND i.deleted = 0
         JOIN utilities u ON u.id = il.utility_id_fk AND u.deleted = 0
        WHERE COALESCE(il.period_end, i.invoice_date) >= CAST(? AS DATE) - INTERVAL 12 MONTH`,
      [today],
    );
    const lineUtilityIds = [...new Set(invoiceLines.map((r) => Number(r.utility_id)))];
    const eventRows: Record<string, unknown>[] = lineUtilityIds.length
      ? await this.dataSource.query(
          `SELECT id, utility_id_fk, type, third_party_id_fk, requested_on, effective_on, date_unknown,
                  cancelled_on, deleted, utilizer_grant_id_fk, create_date
             FROM utility_supply_events
            WHERE deleted = 0 AND utility_id_fk IN (?)`,
          [lineUtilityIds],
        )
      : [];
    const eventsByUtility = new Map<number, SupplyEventLike[]>();
    for (const r of eventRows) {
      const id = Number(r.utility_id_fk);
      const bucket = eventsByUtility.get(id) ?? [];
      bucket.push({
        id: Number(r.id),
        type: r.type as SupplyEventType,
        third_party_id_fk: r.third_party_id_fk == null ? null : Number(r.third_party_id_fk),
        requested_on: dbDay(r.requested_on),
        effective_on: dbDay(r.effective_on),
        date_unknown: !!Number(r.date_unknown),
        cancelled_on: dbDay(r.cancelled_on),
        deleted: !!Number(r.deleted),
        utilizer_grant_id_fk:
          r.utilizer_grant_id_fk == null ? null : Number(r.utilizer_grant_id_fk),
        create_date: romeDay((r.create_date as Date | string) ?? this.now()),
      });
      eventsByUtility.set(id, bucket);
    }
    const outside = new Map<
      string,
      Anomalies['invoices_outside_supply_periods']['items'][number]
    >();
    for (const r of invoiceLines) {
      const invoiceDate = dbDay(r.invoice_date) as string;
      const start = dbDay(r.period_start);
      const end = dbDay(r.period_end);
      const utilityId = Number(r.utility_id);
      const line = { period_start: start, period_end: end, invoice_date: invoiceDate };
      if (!outOfPeriod(line, eventsByUtility.get(utilityId) ?? [])) continue;
      const from = start ?? end;
      const period = from ? `${itDate(from)}–${itDate(end ?? from)}` : null;
      const item = {
        invoice_id: Number(r.invoice_id),
        number: String(r.number),
        invoice_date: invoiceDate,
        utility_id: utilityId,
        utility_code: String(r.utility_code),
        period,
      };
      outside.set(`${item.invoice_id}|${utilityId}|${period}`, item);
    }
    const invoicesOutside = [...outside.values()].sort(
      (p, q) =>
        (p.invoice_date < q.invoice_date ? 1 : p.invoice_date > q.invoice_date ? -1 : 0) ||
        p.invoice_id - q.invoice_id,
    );
    const pendingItems = (rows: Record<string, unknown>[]): PendingUtilityAnomaly[] =>
      rows.map((r) => ({
        id: Number(r.id),
        utility_id: String(r.utility_id),
        type: (r.type as string) ?? null,
        contracts: (r.contracts as string) ?? null,
        pending_days: daysSince(dbDay(r.pending_since), today),
      }));

    const assetItems = (rows: { id: unknown; asset_name: string }[]) =>
      list(rows.map((a) => ({ id: Number(a.id), asset_name: a.asset_name })));

    return {
      assets_without_cadastre: assetItems(withoutCadastre),
      assets_without_mef_id: assetItems(withoutMefId),
      units_without_subordinate: assetItems(withoutSubordinate),
      functions_without_mef_type: list(
        functionsWithoutMefType.map((f) => ({ id: Number(f.id), name: f.name })),
      ),
      chapters_over_budget: list(
        over
          .filter((r) => labelOf.has(r.budget_chapter_id))
          .map((r) => ({
            ...chapterLabel(labelOf.get(r.budget_chapter_id)),
            adjusted_budget: r.adjusted_budget as number,
            committed: r.committed,
            invoiced: r.invoiced,
          })),
      ),
      chapters_without_budget: list(withoutBudget.map(chapterLabel)),
      invoices_outside_supply_periods: list(invoicesOutside),
      utilities_with_uncommitted_chapter: list(
        uncommitted.map((r) => ({
          id: Number(r.id),
          utility_id: String(r.utility_id),
          type: (r.type as string) ?? null,
          contracts: (r.contracts as string) ?? null,
          chapter: String(r.chapter),
        })),
      ),
      active_utilities_without_chapter: list(
        withoutChapter.map((r) => ({
          id: Number(r.id),
          utility_id: String(r.utility_id),
          type: (r.type as string) ?? null,
          contracts: (r.contracts as string) ?? null,
        })),
      ),
      invoice_lines_without_utility: list(
        withoutUtility.map((r) => ({
          invoice_id: Number(r.invoice_id),
          number: String(r.number),
          supply_code: (r.supply_code as string) ?? null,
          amount: Number(r.amount),
        })),
      ),
      assets_without_classification: list(
        assetsWithoutClassification.map((a) => ({
          id: Number(a.id),
          asset_name: a.asset_name,
          missing: a.missing,
        })),
      ),
      rented_assets_without_passive_contract: list(
        rentedWithoutPassive.map((a) => ({ id: Number(a.id), asset_name: a.asset_name })),
      ),
      utilities_to_transfer: list(pendingItems(toTransfer)),
      utilities_to_recover: list(pendingItems(toRecover)),
      utilities_to_decide: list(pendingItems(toDecide)),
      pending_activations: list(pendingOf(SupplyEventType.ACTIVATION)),
      pending_cessations: list(pendingOf(SupplyEventType.CESSATION)),
      real_estate_contracts_without_parties: list(
        contractsWithoutParties.map((c) => ({ id: Number(c.id), subject: c.subject ?? null })),
      ),
      third_parties_without_identifier: list(
        partiesWithoutIdentifier.map((p) => ({ id: Number(p.id), name: p.name, type: p.type })),
      ),
      plants_without_asset: list(
        plantsWithoutAsset.map((p) => ({
          id: Number(p.id),
          code: p.code,
          name: p.name,
          type: p.type,
        })),
      ),
      utilities_with_reactive_penalty: list(
        reactivePenalty.map((u) => ({ id: Number(u.id), utility_id: u.utility_id, type: u.type })),
      ),
      plants_fire_equipment_overdue: list(
        fireOverdue.map((p) => ({ id: Number(p.id), code: p.code, name: p.name, type: p.type })),
      ),
      plants_missing_inspections: list(
        missingRequired.map(({ p, missing }) => ({
          id: Number(p.id),
          code: p.code,
          name: p.name,
          type: p.type,
          missing: missing.map((m) => m.kind).join(', '),
        })),
      ),
      plants_without_position: list(
        plantsWithoutPosition.map((p) => ({
          id: Number(p.id),
          code: p.code,
          name: p.name,
          type: p.type,
        })),
      ),
      active_utilities_without_position: list(utilitiesWithoutPosition),
      real_estate_contracts_without_assets: list(
        contractsWithoutAssets.map((c) => ({
          id: Number(c.id),
          counterparty: c.counterparty ?? null,
          subject: c.subject ?? null,
        })),
      ),
      contracts_without_cig: list(
        contractsWithoutCig.map((c) => ({
          id: Number(c.id),
          supplier: (c.supplier as string) ?? null,
          agreement: (c.agreement as string) ?? null,
          supply_expiry_date: (c.supply_expiry_date as string) ?? null,
          utilities: Number(c.utilities),
        })),
      ),
      active_utilities_without_contract: list(withoutContract),
      active_utilities_without_arera_category: list(withoutAreraCategory),
      active_gas_utilities_without_use_category: list(gasWithoutUseCategory),
      active_utilities_without_cig_contract: list(withoutCigContract),
      utilities_with_overlapping_contracts: list(overlapping),
      duplicate_cigs: list(
        duplicateCigs.map((d) => ({
          cig: d.cig,
          contracts: String(d.contracts).split(',').map(Number),
        })),
      ),
    };
  }
}
