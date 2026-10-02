import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

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
      `SELECT c.id, s.supplier_id AS supplier, ca.name AS agreement,
              DATE_FORMAT(c.supply_expiry_date, '%Y-%m-%d') AS supply_expiry_date,
              (SELECT COUNT(*) FROM contract_utilities cu WHERE cu.contract_id = c.id) AS utilities
       FROM contracts c
       LEFT JOIN suppliers s ON s.id = c.supplier_id_fk
       LEFT JOIN consip_agreement ca ON ca.id = c.consip_agreement_id
       WHERE c.deleted = 0 AND c.closed = 0 AND c.cig_exempt = 0 AND NOT ${HAS_CIG}
       ORDER BY s.supplier_id, c.id`,
    );

    const utilityColumns = `u.id, u.utility_id, t.name AS type`;
    const currentContractsList = `(SELECT GROUP_CONCAT(CONCAT('#', c.id, ' ', IFNULL(s.supplier_id, '?')) ORDER BY c.id SEPARATOR ', ')
        FROM contract_utilities cu JOIN contracts c ON c.id = cu.contract_id AND c.deleted = 0
        LEFT JOIN suppliers s ON s.id = c.supplier_id_fk
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
       AND NOT EXISTS (${currentContractOf(`AND (${HAS_CIG} OR c.cig_exempt = 1)`)})
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
      `SELECT g.id, u.name AS counterparty, g.subject
         FROM utilizer_grant g LEFT JOIN utilizer u ON u.id = g.utilizer_id_fk
         WHERE g.deleted = 0
           AND NOT EXISTS (SELECT 1 FROM utilizer_grant_assets a JOIN assets s ON s.id = a.asset_id AND s.deleted = 0
                           WHERE a.utilizer_grant_id = g.id)
         ORDER BY u.name, g.id`,
    );

    // Impianti senza alcuna posizione: né coordinate proprie, né geocodifica,
    // né un immobile contenitore localizzato (stessa priorità di resolvePlantPosition).
    const isSetSql = (col: string) => `IFNULL(TRIM(${col}), '') <> ''`;
    const plantsWithoutPosition: { id: unknown; code: string; name: string; type: string }[] =
      await this.dataSource.query(
        `SELECT p.id, p.code, p.name, p.type
           FROM plants p LEFT JOIN assets a ON a.id = p.asset_id_fk AND a.deleted = 0
           WHERE p.deleted = 0
             AND NOT (${isSetSql('p.latitude')} AND ${isSetSql('p.longitude')})
             AND NOT (${isSetSql('p.geocoded_latitude')} AND ${isSetSql('p.geocoded_longitude')})
             AND NOT (a.id IS NOT NULL AND (
                   (${isSetSql('a.latitude')} AND ${isSetSql('a.longitude')})
                OR (${isSetSql('a.geocoded_latitude')} AND ${isSetSql('a.geocoded_longitude')})))
           ORDER BY p.type, p.code`,
      );

    return {
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
