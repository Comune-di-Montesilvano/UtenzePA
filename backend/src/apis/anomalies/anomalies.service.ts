import { Injectable } from '@nestjs/common';
import { ASSET_REQUIRED_TYPES } from '@apis/plants/plant.calc';
import { DataSource } from 'typeorm';
import { partyNameSql } from '@apis/third-parties/third-party.name';
import { CostStatus, costStatusSql } from '@apis/utility/cost-status';
import { chaptersYearSummary, currentYear } from '@apis/spending/chapter-year';

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
  plants_without_asset: AnomalyList<PlantAnomaly>;
  real_estate_contracts_without_parties: AnomalyList<{ id: number; subject: string | null }>;
  third_parties_without_identifier: AnomalyList<{ id: number; name: string; type: string }>;
  active_utilities_without_arera_category: AnomalyList<UtilityAnomaly>;
  active_gas_utilities_without_use_category: AnomalyList<UtilityAnomaly>;
  utilities_to_transfer: AnomalyList<UtilityAnomaly>;
  utilities_to_recover: AnomalyList<UtilityAnomaly>;
  assets_without_classification: AnomalyList<{ id: number; asset_name: string; missing: string }>;
  invoices_on_ceased_utilities: AnomalyList<{
    invoice_id: number;
    number: string;
    invoice_date: string;
    utility_id: number;
    utility_code: string;
  }>;
  utilities_with_uncommitted_chapter: AnomalyList<UtilityAnomaly & { chapter: string }>;
  active_utilities_without_chapter: AnomalyList<UtilityAnomaly>;
  chapters_over_budget: AnomalyList<ChapterAnomaly & { adjusted_budget: number; committed: number; invoiced: number }>;
  chapters_without_budget: AnomalyList<ChapterAnomaly>;
  invoice_lines_without_utility: AnomalyList<{
    invoice_id: number;
    number: string;
    supply_code: string | null;
    amount: number;
  }>;
}

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

// Anomalie dei dati contrattuali mostrate in dashboard. Regola di fondo: un
// contratto senza CIG (e non esplicitamente escluso) è di fatto inesistente.
@Injectable()
export class AnomaliesService {
  constructor(private readonly dataSource: DataSource) {}

  async getAnomalies(): Promise<Anomalies> {
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

    // Contratto immobiliare con voltura attivo, utenza non ancora volturata:
    // paga il Comune finché il terzo non volta. Le più vecchie prima.
    const toTransfer: (UtilityAnomaly & { since?: string | null })[] = await this.dataSource.query(
      `SELECT ${utilityColumns}, x.since,
              CONCAT(x.parties, IFNULL(CONCAT(' · dal ', DATE_FORMAT(x.since, '%d/%m/%Y')), '')) AS contracts
       FROM utilities u JOIN utility_types t ON t.id = u.utility_type_id_fk
       JOIN (SELECT ua.utility_id,
                    GROUP_CONCAT(DISTINCT ${partyNameSql('tp')} ORDER BY tp.id SEPARATOR ', ') AS parties,
                    MIN(g.start_date) AS since
               FROM utility_assets ua
               JOIN assets sa ON sa.id = ua.asset_id AND sa.deleted = 0
               JOIN utilizer_grant_assets uga ON uga.asset_id = ua.asset_id
               JOIN utilizer_grant g ON g.id = uga.utilizer_grant_id AND g.deleted = 0
                 AND g.status = 'ACTIVE' AND g.direction = 'ACTIVE' AND g.utilities_to_be_taken_over = 1
               JOIN utilizer_grant_parties gp ON gp.utilizer_grant_id = g.id
               JOIN third_parties tp ON tp.id = gp.third_party_id AND tp.deleted = 0
              GROUP BY ua.utility_id) x ON x.utility_id = u.id
       WHERE u.deleted = 0 AND u.supply_active = 1
         AND ${costStatusSql(CostStatus.TO_TRANSFER, 'u')}
       ORDER BY x.since IS NULL, x.since, u.utility_id`,
    );

    // Volturata a chi non ha più un contratto attivo sull'immobile.
    const toRecover: UtilityAnomaly[] = await this.dataSource.query(
      `SELECT ${utilityColumns}, ${partyNameSql('vt')} AS contracts
       FROM utilities u JOIN utility_types t ON t.id = u.utility_type_id_fk
       LEFT JOIN third_parties vt ON vt.id = u.transferred_to_third_party_id
       WHERE u.deleted = 0 AND u.supply_active = 1
         AND ${costStatusSql(CostStatus.TO_RECOVER, 'u')}
       ORDER BY u.utility_id`,
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

    const onCeased: Record<string, unknown>[] = await this.dataSource.query(
      `SELECT DISTINCT i.id AS invoice_id, i.invoice_id AS number,
              DATE_FORMAT(i.invoice_date, '%Y-%m-%d') AS invoice_date,
              u.id AS utility_id, u.utility_id AS utility_code
       FROM invoice_lines il
       JOIN invoices i ON i.id = il.invoice_id_fk AND i.deleted = 0
       JOIN utilities u ON u.id = il.utility_id_fk AND u.deleted = 0
       WHERE u.supply_active = 0 AND i.invoice_date >= CURDATE() - INTERVAL 12 MONTH
       ORDER BY invoice_date DESC, invoice_id`,
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
    const summary = await chaptersYearSummary((sql, params) => this.dataSource.query(sql, params), year);
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

    return {
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
      invoices_on_ceased_utilities: list(
        onCeased.map((r) => ({
          invoice_id: Number(r.invoice_id),
          number: String(r.number),
          invoice_date: String(r.invoice_date),
          utility_id: Number(r.utility_id),
          utility_code: String(r.utility_code),
        })),
      ),
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
      utilities_to_transfer: list(toTransfer.map(({ since: _since, ...u }) => u)),
      utilities_to_recover: list(toRecover),
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
      plants_without_position: list(
        plantsWithoutPosition.map((p) => ({
          id: Number(p.id),
          code: p.code,
          name: p.name,
          type: p.type,
        })),
      ),
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
