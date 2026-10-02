import {
  ContractDirection,
  ContractKind,
} from '@apis/utilizer-grant/enum/real-estate-contract.enum';
import { PartyRole } from './enum/third-party.enum';

export interface RoleIndex {
  // Soggetti con almeno un contratto di fornitura o una convenzione CONSIP non eliminati.
  suppliers: Set<number>;
  // Partecipazioni a contratti immobiliari non eliminati.
  grants: { party_id: number; direction: ContractDirection; kind: ContractKind }[];
}

// Ordine fisso: fornitore, locatore, conduttore. Con `kind` contano solo i
// contratti immobiliari di quel tipo (il ruolo fornitore resta).
export function partyRoles(id: number, index: RoleIndex, kind?: ContractKind): PartyRole[] {
  const grants = index.grants.filter((g) => g.party_id === id && (!kind || g.kind === kind));
  const roles: PartyRole[] = [];
  if (index.suppliers.has(id)) roles.push(PartyRole.SUPPLIER);
  if (grants.some((g) => g.direction === ContractDirection.PASSIVE)) roles.push(PartyRole.LESSOR);
  if (grants.some((g) => g.direction === ContractDirection.ACTIVE)) roles.push(PartyRole.TENANT);
  return roles;
}

// Chip in OR; nessuna chip = tutti.
export function matchesRoles(roles: PartyRole[], wanted: PartyRole[]): boolean {
  if (wanted.length === 0) return true;
  return wanted.some((w) => (w === PartyRole.UNLINKED ? roles.length === 0 : roles.includes(w)));
}
