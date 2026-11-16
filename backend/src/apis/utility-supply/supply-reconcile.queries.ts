import { EntityManager, IsNull, Not, ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import { SystemUser } from '@apis/system-users/entity/system-user.entity';
import { ContractDirection } from '@apis/utilizer-grant/enum/real-estate-contract.enum';
import { UtilizerGrant } from '@apis/utilizer-grant/entity/utilizer-grant.entity';
import { GrantUtilityDecision } from './entity/grant-utility-decision.entity';
import { UtilitySupplyEvent } from './entity/utility-supply-event.entity';

// Letture della riconciliazione dello storico con i contratti immobiliari.

// Utenze non cancellate coperte da immobili non cancellati (ua = utility_assets,
// uga = utilizer_grant_assets).
function covering(m: EntityManager): SelectQueryBuilder<ObjectLiteral> {
  return m
    .createQueryBuilder()
    .from('utility_assets', 'ua')
    .innerJoin('assets', 'a', 'a.id = ua.asset_id AND a.deleted = 0')
    .innerJoin('utilizer_grant_assets', 'uga', 'uga.asset_id = ua.asset_id')
    .innerJoin('utilities', 'u', 'u.id = ua.utility_id AND u.deleted = 0');
}

// Utenze coperte dal contratto tramite i suoi immobili, in ordine di id.
export async function coveredUtilityIds(m: EntityManager, grantId: number): Promise<number[]> {
  const rows: { utility_id: number }[] = await covering(m)
    .select('DISTINCT ua.utility_id', 'utility_id')
    .where('uga.utilizer_grant_id = :grantId', { grantId })
    .orderBy('ua.utility_id')
    .getRawMany();
  return rows.map((r) => Number(r.utility_id));
}

// Contratti che coprono l'utenza tramite un immobile (contratto non filtrato).
export async function coveringGrantIds(m: EntityManager, utilityId: number): Promise<number[]> {
  const rows: { id: number }[] = await covering(m)
    .select('uga.utilizer_grant_id', 'id')
    .where('ua.utility_id = :utilityId', { utilityId })
    .getRawMany();
  return rows.map((r) => Number(r.id));
}

// Utenze non cancellate legate al contratto da una decisione o da righe di storico.
export async function linkedUtilityIds(m: EntityManager, grantId: number): Promise<number[]> {
  const decisions = await m.getRepository(GrantUtilityDecision).find({
    select: { utility_id_fk: true },
    where: { utilizer_grant_id_fk: grantId, utility: { deleted: false } },
  });
  const events = await m.getRepository(UtilitySupplyEvent).find({
    select: { utility_id_fk: true },
    where: { utilizer_grant_id_fk: grantId, deleted: false, utility: { deleted: false } },
  });
  return [...decisions.map((d) => d.utility_id_fk), ...events.map((e) => e.utility_id_fk)];
}

// Contratti legati all'utenza da una decisione o da righe di storico non cancellate.
export async function linkedGrantIds(m: EntityManager, utilityId: number): Promise<number[]> {
  const decisions = await m.getRepository(GrantUtilityDecision).find({
    select: { utilizer_grant_id_fk: true },
    where: { utility_id_fk: utilityId },
  });
  const events = await m.getRepository(UtilitySupplyEvent).find({
    select: { utilizer_grant_id_fk: true },
    where: { utility_id_fk: utilityId, deleted: false, utilizer_grant_id_fk: Not(IsNull()) },
  });
  return [
    ...decisions.map((d) => d.utilizer_grant_id_fk),
    ...events.map((e) => e.utilizer_grant_id_fk as number),
  ];
}

// Contratti per id, anche cancellati o passivi, in ordine di id.
export function grantsByIds(m: EntityManager, ids: number[]): Promise<UtilizerGrant[]> {
  if (!ids.length) return Promise.resolve([]);
  return m
    .getRepository(UtilizerGrant)
    .createQueryBuilder('g')
    .where('g.id IN (:...ids)', { ids })
    .orderBy('g.id')
    .getMany();
}

// Contratto concesso dal Comune (attivo) non cancellato.
export function activeDirectionGrant(
  m: EntityManager,
  grantId: number,
): Promise<UtilizerGrant | null> {
  return m
    .getRepository(UtilizerGrant)
    .createQueryBuilder('g')
    .where('g.id = :grantId AND g.deleted = 0 AND g.direction = :active', {
      grantId,
      active: ContractDirection.ACTIVE,
    })
    .getOne();
}

// Parti non cancellate dei contratti.
export function liveParties(
  m: EntityManager,
  grantIds: number[],
): Promise<{ utilizer_grant_id: number; third_party_id: number }[]> {
  return m
    .createQueryBuilder()
    .select('gp.utilizer_grant_id', 'utilizer_grant_id')
    .addSelect('gp.third_party_id', 'third_party_id')
    .from('utilizer_grant_parties', 'gp')
    .innerJoin('third_parties', 'tp', 'tp.id = gp.third_party_id AND tp.deleted = 0')
    .where('gp.utilizer_grant_id IN (:...grantIds)', { grantIds })
    .getRawMany();
}

// Primo utente (l'utente di sistema dove esiste); null senza utenti.
export async function firstUserId(m: EntityManager): Promise<number | null> {
  const row: { id: number | null } | undefined = await m
    .getRepository(SystemUser)
    .createQueryBuilder('su')
    .select('MIN(su.id)', 'id')
    .getRawOne();
  return row?.id === null || row?.id === undefined ? null : Number(row.id);
}
