import {AssetStatus} from '../../pages/assets/enum/asset-status.enum';
import {
  INSPECTION_LABEL,
  InspectionStatus,
  PLANT_STATUS_LABEL,
  PlantStatus,
  POSITION_LABEL,
  PositionQuality,
  todayIso,
} from '../../pages/plants/plant.model';
import {ContractStatus, DisplayStatus, STATUS_LABEL} from '../../pages/utilizer-grant/real-estate-contract.model';
import {toIsoDate} from '../../pages/utilities/consumptions/consumption.model';

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

export function legacyTypeStatus(code: string | null): StatusInfo | null {
  if (!code) return null;
  return {
    tone: 'warn',
    label: `Tipo precedente: ${code}`,
    icon: 'history',
    tooltip: 'Classificazione precedente: sparisce dopo aver salvato tipologia e funzione',
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
  c: {closed?: boolean | null; supply_expiry_date?: Date | string | null},
  today = todayIso(),
): StatusInfo {
  if (c.closed) return {tone: 'off', label: 'Chiuso', icon: 'lock'};
  if (c.supply_expiry_date && isoOf(c.supply_expiry_date) < today) {
    return {tone: 'danger', label: 'Scaduto', icon: 'event_busy'};
  }
  return {tone: 'ok', label: 'In corso', icon: 'check_circle'};
}

// Stessa regola del validatore cigRequiredUnlessExempt del dialog.
export function supplyContractFlags(c: {cig_contract?: string | null; cig_exempt?: boolean | null; closed?: boolean | null}): StatusInfo[] {
  if (c.cig_exempt) return [{tone: 'info', label: 'Escluso da CIG', icon: 'info'}];
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
