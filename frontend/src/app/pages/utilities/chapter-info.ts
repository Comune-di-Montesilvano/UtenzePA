import {DERIVATION_REASON_LABEL, DerivationReason} from '../../core/services/anomalies.service';
import {formatMonths} from '../budget-chapters/stats-months';

// GET /utilities/:id/chapter-info: da dove viene il capitolo dell'utenza.
export interface ChapterInfo {
  source: 'DERIVED' | 'MANUAL';
  reason: DerivationReason | null;
  destination: {id: number; name: string} | null;
  via: {kind: 'asset' | 'plant'; id: number; label: string} | null;
  chapter_label: string | null;
  paid_elsewhere: PaidElsewhere[];
}

export interface PaidElsewhere {
  chapter_label: string;
  amount: number;
  months: string[];
}

const VIA_LABEL = {asset: 'immobile', plant: 'impianto'} as const;

export function chapterOriginText(info: ChapterInfo): string {
  if (info.source === 'DERIVED') {
    const via = info.via ? ` (${VIA_LABEL[info.via.kind]} ${info.via.label})` : '';
    return `Dalla destinazione «${info.destination?.name ?? '?'}»${via}`;
  }
  const reason = info.reason ? DERIVATION_REASON_LABEL[info.reason] : 'scelto a mano';
  const dest = info.destination ? ` (${info.destination.name})` : '';
  return `A mano: ${reason}${dest}`;
}

export function paidElsewhereText(p: PaidElsewhere): string {
  const amount = p.amount.toLocaleString('it-IT', {style: 'currency', currency: 'EUR'});
  return `Pagata anche su ${p.chapter_label}: ${formatMonths(p.months)} (${amount})`;
}
