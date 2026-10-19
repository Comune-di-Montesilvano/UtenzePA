// Guida operatori: unica fonte in public/guida/guida.md, servita così com'è
// da /guida/guida.md (la legge anche CruscottoPA come guida GitHub) e resa
// dalla pagina /guida. Le ancore sono gli slug dei titoli: scripts/check-guida.mjs
// verifica che quelle citate qui esistano nella guida (gira con `pnpm run build`).

export const GUIDA_URL = '/guida/guida.md';

export function guidaSlug(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[^\p{L}\p{N} _-]/gu, '')
    .replace(/ /g, '-');
}

// Sezione della guida aperta dal bottone "?" dell'intestazione, per pagina
// (primo segmento dell'URL). Le pagine senza voce aprono la guida dall'inizio.
export const GUIDA_PER_PAGINA: Record<string, string> = {
  'building': 'trovare-un-elemento-negli-elenchi',
  'utilities': 'attivazioni-cessazioni-e-volture-di-unutenza',
  'plants': 'trovare-un-elemento-negli-elenchi',
  'complexes': 'gestire-i-complessi',
  'acts': 'registrare-un-atto',
  'asset-function': 'catasto-e-dati-di-patrimonio',
  'invoices': 'registrare-una-fattura',
  'budget-chapter': 'controllare-la-spesa-di-un-capitolo',
  'contracts': 'contratti-di-fornitura',
  'utilizer-grant': 'a-carico-di-gli-stati',
  'third-parties': 'trovare-un-elemento-negli-elenchi',
  'map': 'consultare-la-mappa',
  'system-users': 'ruoli',
  'backup-import': 'fare-un-backup-solo-amministratori',
  'invoice-import': 'importare-le-fatture-dalla-pec-solo-amministratori',
};
