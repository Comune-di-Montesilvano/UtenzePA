import { EntityManager } from 'typeorm';
import { NOT_DRAFT_SQL } from '@apis/contracts/contract-draft';
import { Invoice } from '@apis/invoices/entity/invoice.entity';
import { ThirdParty } from '@apis/third-parties/entity/third-party.entity';

// Letture del matcher: anagrafiche e fatture dal punto di vista della fattura SDI.

export interface UtilityRow {
  id: number;
  budget_chapter_code_fk: number | null;
  meter_number?: string | null;
}

export interface ContractRow {
  id: number;
  cig_contract: string | null;
}

const UTILITY_FIELDS = [
  'u.id AS id',
  'u.budget_chapter_code_fk AS budget_chapter_code_fk',
  'u.meter_number AS meter_number',
];

// Utenza dal POD/PDR o dal codice cliente. Il codice cliente è del fornitore: vale
// solo sulle utenze con un suo contratto. A parità vince il POD.
export async function utilityByCode(
  m: EntityManager,
  normalized: string,
  code: string,
  supplierId: number,
): Promise<UtilityRow | null> {
  const row: UtilityRow | undefined = await m
    .createQueryBuilder()
    .select(UTILITY_FIELDS)
    .from('utilities', 'u')
    .where('u.deleted = 0')
    .andWhere(
      '(u.utility_id = :normalized OR (u.utility_code = :code AND EXISTS (SELECT 1 FROM contract_utilities cu ' +
        'JOIN contracts c ON c.id = cu.contract_id WHERE cu.utility_id = u.id AND c.supplier_id_fk = :supplierId AND c.deleted = 0)))',
      { normalized, code, supplierId },
    )
    .orderBy('u.utility_id = :normalized', 'DESC')
    .addOrderBy('u.id')
    .limit(1)
    .getRawOne();
  return row ?? null;
}

// Utenze dei contratti del fornitore con questo ordine o CIG (al massimo due: ne
// serve una sola). Un ordine in bozza non riceve fatture, nemmeno per CIG.
export function utilitiesOfContractRef(
  m: EntityManager,
  supplierId: number,
  ref: string,
): Promise<UtilityRow[]> {
  return m
    .createQueryBuilder()
    .select(UTILITY_FIELDS)
    .distinct(true)
    .from('contracts', 'c')
    .innerJoin('contract_utilities', 'cu', 'cu.contract_id = c.id')
    .innerJoin('utilities', 'u', 'u.id = cu.utility_id AND u.deleted = 0')
    .where(`c.deleted = 0 AND ${NOT_DRAFT_SQL('c')} AND c.supplier_id_fk = :supplierId`, {
      supplierId,
    })
    .andWhere('(c.consip_order = :ref OR c.cig_contract = :ref)', { ref })
    .limit(2)
    .getRawMany();
}

// Contratto del fornitore sull'utenza in vigore quel giorno, il più recente.
export async function contractOfUtility(
  m: EntityManager,
  utilityId: number,
  supplierId: number,
  day: string,
): Promise<ContractRow | null> {
  const row: ContractRow | undefined = await m
    .createQueryBuilder()
    .select(['c.id AS id', 'c.cig_contract AS cig_contract'])
    .from('contracts', 'c')
    .innerJoin('contract_utilities', 'cu', 'cu.contract_id = c.id')
    .where('cu.utility_id = :utilityId AND c.supplier_id_fk = :supplierId', {
      utilityId,
      supplierId,
    })
    .andWhere(`c.deleted = 0 AND ${NOT_DRAFT_SQL('c')}`)
    .andWhere('(c.supply_start_date IS NULL OR c.supply_start_date <= :day)', { day })
    .andWhere('(c.supply_expiry_date IS NULL OR c.supply_expiry_date >= :day)')
    .orderBy('c.supply_start_date', 'DESC')
    .addOrderBy('c.id', 'DESC')
    .limit(1)
    .getRawOne();
  return row ?? null;
}

// Contratto della fattura dal CIG o dal riferimento ordine, per le righe senza utenza
// (canoni di contratto, sedi senza codice): al massimo due, vale se ne indica uno.
export function headerContracts(
  m: EntityManager,
  supplierId: number,
  cig: string | null,
  ref: string | null,
): Promise<ContractRow[]> {
  return m
    .createQueryBuilder()
    .select(['c.id AS id', 'c.cig_contract AS cig_contract'])
    .from('contracts', 'c')
    .where(`c.deleted = 0 AND ${NOT_DRAFT_SQL('c')} AND c.supplier_id_fk = :supplierId`, {
      supplierId,
    })
    .andWhere('(TRIM(c.cig_contract) IN (:cig, :ref) OR TRIM(c.consip_order) = :ref)', { cig, ref })
    .limit(2)
    .getRawMany();
}

// Esiste almeno un'annualità d'impegno del contratto nell'esercizio? L'impegno lo
// assegna poi il ricalcolo (CommitmentReconcileService); qui solo la segnalazione.
export async function hasCommitment(
  m: EntityManager,
  contractId: number,
  year: number,
): Promise<boolean> {
  const row = await m
    .createQueryBuilder()
    .select('bc.id', 'id')
    .from('budget_commitments', 'bc')
    .innerJoin('budget_commitment_contracts', 'bcc', 'bcc.commitment_id = bc.id')
    .innerJoin('budget_commitment_years', 'bcy', 'bcy.commitment_id = bc.id')
    .where('bc.deleted = 0 AND bcc.contract_id = :contractId AND bcy.fiscal_year = :year', {
      contractId,
      year,
    })
    .limit(1)
    .getRawOne();
  return !!row;
}

export function supplierNames(
  m: EntityManager,
  supplierId: number,
): Promise<Pick<ThirdParty, 'company_name' | 'last_name' | 'first_name'> | null> {
  return m.getRepository(ThirdParty).findOne({
    select: { company_name: true, last_name: true, first_name: true },
    where: { id: supplierId },
  });
}

// Fattura non cancellata del fornitore con questo numero e data.
export async function invoiceByNumber(
  m: EntityManager,
  supplierId: number,
  number: string,
  date: string,
): Promise<{ id: number } | null> {
  const row: { id: number } | undefined = await m
    .getRepository(Invoice)
    .createQueryBuilder('i')
    .select('i.id', 'id')
    .where('i.deleted = 0 AND i.supplier_id_fk = :supplierId', { supplierId })
    .andWhere('i.invoice_id = :number AND i.invoice_date = :date', { number, date })
    .orderBy('i.id')
    .limit(1)
    .getRawOne();
  return row ?? null;
}

// Fatture non cancellate del fornitore di quel giorno (numero scritto diversamente:
// create dalla contabilità o a mano).
export function invoicesOfDay(
  m: EntityManager,
  supplierId: number,
  date: string,
): Promise<{ id: number; invoice_id: string }[]> {
  return m
    .getRepository(Invoice)
    .createQueryBuilder('i')
    .select(['i.id AS id', 'i.invoice_id AS invoice_id'])
    .where('i.deleted = 0 AND i.supplier_id_fk = :supplierId AND i.invoice_date = :date', {
      supplierId,
      date,
    })
    .orderBy('i.id')
    .getRawMany();
}

// Fatture non cancellate del fornitore con questo IdentificativoSdI (con un lotto SDI
// più fatture hanno lo stesso identificativo).
export function invoicesBySdi(
  m: EntityManager,
  supplierId: number,
  sdiIdentifier: string,
): Promise<{ id: number; invoice_id: string }[]> {
  return m.getRepository(Invoice).find({
    select: { id: true, invoice_id: true },
    where: { deleted: false, supplier_id_fk: supplierId, sdi_identifier: sdiIdentifier },
    order: { id: 'ASC' },
  });
}
