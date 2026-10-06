import {ContractKind} from '../../pages/contracts/contract-kind';
import {AssetStatus} from '../../pages/assets/enum/asset-status.enum';
import {
  INSPECTION_LABEL,
  InspectionStatus,
  PLANT_STATUS_LABEL,
  PlantStatus,
  POSITION_LABEL,
  PositionQuality,
} from '../../pages/plants/plant.model';
import {ContractStatus, DisplayStatus, STATUS_LABEL} from '../../pages/utilizer-grant/real-estate-contract.model';
import {todayIso, toIsoDate} from './date.helper';

// Badge di stato delle schede entità: tono semantico + testo. Funzioni pure,
// riusabili in header, tabelle collegamenti e anteprime.
export type Tone = 'ok' | 'warn' | 'danger' | 'off' | 'info';

export interface StatusInfo {
  tone: Tone;
  label: string;
  icon?: string;
  tooltip?: string;
}

const isoOf = (v: Date | string): string => (typeof v === 'string' ? v.slice(0, 10) : toIsoDate(v));

export function assetStatus(status: string | null | undefined): StatusInfo {
  switch (status) {
    case AssetStatus.ATTIVO: return {tone: 'ok', label: 'Attivo', icon: 'check_circle'};
    case AssetStatus.DA_VERIFICARE: return {tone: 'warn', label: 'Da verificare', icon: 'help'};
    case AssetStatus.DISMESSO: return {tone: 'off', label: 'Dismesso', icon: 'block'};
    default: return {tone: 'off', label: 'Stato non indicato', icon: 'help_outline'};
  }
}

// Immobile senza tipologia o funzione (stesso criterio dell'anomalia in dashboard).
export function unclassifiedStatus(natureId: number | null | undefined, functionId: number | null | undefined): StatusInfo | null {
  if (natureId != null && functionId != null) return null;
  return {
    tone: 'warn',
    label: 'Da classificare',
    icon: 'help_outline',
    tooltip: 'Mancano tipologia o funzione: sparisce dopo averle salvate',
  };
}

export function utilityStatus(active: boolean | null | undefined): StatusInfo {
  if (active === true) return {tone: 'ok', label: 'Attiva', icon: 'power'};
  if (active === false) return {tone: 'off', label: 'Non attiva', icon: 'power_off'};
  return {tone: 'warn', label: 'Fornitura non indicata', icon: 'help_outline'};
}

export function utilityFlags(meterRemoved: boolean | null | undefined, meterVerified: boolean | null | undefined): StatusInfo[] {
  const flags: StatusInfo[] = [];
  if (meterRemoved) flags.push({tone: 'off', label: 'Contatore rimosso', icon: 'remove_circle_outline'});
  if (meterVerified === false) flags.push({tone: 'warn', label: 'Contatore non verificato', icon: 'report'});
  return flags;
}

// "Manutenzione a carico di" (stato calcolato dal backend, maintenance-status.ts).
export function maintenanceStatus(info: {status: string} | null | undefined): StatusInfo {
  switch (info?.status) {
    case 'SUPPLIER': return {tone: 'info', label: 'Fornitore', icon: 'local_shipping'};
    case 'COUNTERPARTY': return {tone: 'info', label: 'Controparte', icon: 'handshake'};
    default: return {tone: 'ok', label: 'Comune', icon: 'account_balance'};
  }
}

// "A carico di" (stato calcolato dal backend, cost-status.ts).
export function costStatus(info: {status: string} | null | undefined): StatusInfo {
  switch (info?.status) {
    case 'TO_TRANSFER': return {tone: 'warn', label: 'Da volturare', icon: 'pending_actions'};
    case 'TRANSFERRED': return {tone: 'info', label: 'Volturata', icon: 'swap_horiz'};
    case 'TO_RECOVER': return {tone: 'danger', label: 'Da riprendere', icon: 'assignment_return'};
    default: return {tone: 'ok', label: 'Comune', icon: 'account_balance'};
  }
}

export function plantStatus(status: PlantStatus | null | undefined): StatusInfo {
  switch (status) {
    case 'ACTIVE': return {tone: 'ok', label: PLANT_STATUS_LABEL.ACTIVE, icon: 'check_circle'};
    case 'TO_VERIFY': return {tone: 'warn', label: PLANT_STATUS_LABEL.TO_VERIFY, icon: 'help'};
    case 'DECOMMISSIONED': return {tone: 'off', label: PLANT_STATUS_LABEL.DECOMMISSIONED, icon: 'block'};
    default: return {tone: 'off', label: 'Stato non indicato', icon: 'help_outline'};
  }
}

export function positionStatusInfo(q: PositionQuality): StatusInfo {
  switch (q) {
    case 'PRECISE': return {tone: 'ok', label: POSITION_LABEL.PRECISE, icon: 'my_location'};
    case 'FROM_ASSET': return {tone: 'ok', label: POSITION_LABEL.FROM_ASSET, icon: 'apartment'};
    case 'ESTIMATED': return {tone: 'warn', label: POSITION_LABEL.ESTIMATED, icon: 'location_searching'};
    default: return {tone: 'danger', label: POSITION_LABEL.MISSING, icon: 'location_off'};
  }
}

export function inspectionStatusInfo(s: InspectionStatus | null | undefined): StatusInfo | null {
  switch (s) {
    case 'OVERDUE': return {tone: 'danger', label: INSPECTION_LABEL.OVERDUE, icon: 'event_busy'};
    case 'DUE_SOON': return {tone: 'warn', label: INSPECTION_LABEL.DUE_SOON, icon: 'event'};
    case 'OK': return {tone: 'ok', label: INSPECTION_LABEL.OK, icon: 'event_available'};
    default: return null;
  }
}

// Stesso criterio di Contract.isCurrent: chiuso = mai corrente; senza
// scadenza = in corso; scadenza uguale a oggi = ancora in corso.
export function supplyContractStatus(
  c: {closed?: boolean | null; supply_start_date?: Date | string | null; supply_expiry_date?: Date | string | null},
  today = todayIso(),
): StatusInfo {
  if (c.closed) return {tone: 'off', label: 'Chiuso', icon: 'lock'};
  if (c.supply_expiry_date && isoOf(c.supply_expiry_date) < today) {
    return {tone: 'danger', label: 'Scaduto', icon: 'event_busy'};
  }
  // Decorrenza futura: come la barra di validità, non ancora il contratto corrente.
  if (c.supply_start_date && isoOf(c.supply_start_date) > today) {
    return {tone: 'info', label: 'Non ancora iniziato', icon: 'schedule'};
  }
  return {tone: 'ok', label: 'In corso', icon: 'check_circle'};
}

// Stessa regola del validatore cigRequiredUnlessExempt del dialog.
export function supplyContractFlags(c: {cig_contract?: string | null; contract_kind?: ContractKind | null; closed?: boolean | null}): StatusInfo[] {
  if (c.contract_kind === ContractKind.FREE) return [{tone: 'info', label: 'A titolo gratuito', icon: 'volunteer_activism'}];
  if (c.contract_kind === ContractKind.CIG_EXEMPT) return [{tone: 'info', label: 'Escluso da CIG', icon: 'info'}];
  if (!(c.cig_contract ?? '').trim() && !c.closed) {
    return [{tone: 'danger', label: 'Senza CIG', icon: 'report', tooltip: 'Senza CIG il contratto è considerato inesistente'}];
  }
  return [];
}

export function grantStatus(s: DisplayStatus | null | undefined): StatusInfo {
  switch (s) {
    case 'ACTIVE': return {tone: 'ok', label: STATUS_LABEL.ACTIVE, icon: 'check_circle'};
    case 'EXPIRING': return {tone: 'warn', label: STATUS_LABEL.EXPIRING, icon: 'schedule'};
    case 'EXPIRED': return {tone: 'danger', label: STATUS_LABEL.EXPIRED, icon: 'event_busy'};
    case 'DISPUTED': return {tone: 'danger', label: STATUS_LABEL.DISPUTED, icon: 'gavel'};
    case 'RETURNED': return {tone: 'off', label: STATUS_LABEL.RETURNED, icon: 'undo'};
    case 'TERMINATED': return {tone: 'off', label: STATUS_LABEL.TERMINATED, icon: 'block'};
    default: return {tone: 'off', label: 'Stato non calcolato', icon: 'help_outline'};
  }
}

// Avviso quando lo stato calcolato dalle date diverge da quello dichiarato
// (dichiarato Attivo e calcolato In scadenza è normale, non si segnala).
export function grantFlags(declared: ContractStatus | null | undefined, computed: DisplayStatus | null | undefined): StatusInfo[] {
  if (!declared || !computed || declared === computed) return [];
  if (declared === 'ACTIVE' && computed === 'EXPIRING') return [];
  return [{
    tone: 'warn',
    label: `Stato dichiarato: ${STATUS_LABEL[declared]}`,
    icon: 'sync_problem',
    tooltip: 'Lo stato calcolato dalle date è diverso da quello dichiarato',
  }];
}

// Ruoli dei soggetti terzi (calcolati dal backend dai collegamenti).
const PARTY_ROLE_BADGE: Record<string, StatusInfo> = {
  supplier: {tone: 'info', label: 'Fornitore', icon: 'local_shipping'},
  lessor: {tone: 'info', label: 'Locatore', icon: 'key'},
  tenant: {tone: 'info', label: 'Conduttore', icon: 'home'},
};

export function partyRoleBadges(roles: string[] | null | undefined): StatusInfo[] {
  return (roles ?? []).map(r => PARTY_ROLE_BADGE[r]).filter((b): b is StatusInfo => !!b);
}
