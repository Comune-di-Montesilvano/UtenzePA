// Sottoinsieme curato di Material Icons (font già caricato in index.html,
// standard icone del progetto — vedi CLAUDE.md) per gli aggregati immobili,
// non tutte le ~2500 icone del set. Stesso pattern di HardTypeIcon in
// hard-type.enum.ts, ma qui il nome ligature è direttamente il valore
// salvato (niente enum separato: il campo è libero lato DB, questa lista è
// solo il set proposto nella UI).
export const ASSET_AGGREGATOR_ICON_FALLBACK = 'apartment';

export const AssetAggregatorIconOptions: { value: string; label: string }[] = [
  {value: 'apartment', label: 'Condominio'},
  {value: 'location_city', label: 'Palazzo/città'},
  {value: 'domain', label: 'Edificio'},
  {value: 'home_work', label: 'Casa/ufficio'},
  {value: 'business', label: 'Uffici'},
  {value: 'villa', label: 'Villa'},
  {value: 'store', label: 'Negozio'},
  {value: 'school', label: 'Scuola'},
  {value: 'account_balance', label: 'Edificio istituzionale'},
  {value: 'local_hospital', label: 'Struttura sanitaria'},
  {value: 'stadium', label: 'Impianto sportivo'},
  {value: 'museum', label: 'Museo/cultura'},
  {value: 'factory', label: 'Impianto industriale'},
  {value: 'warehouse', label: 'Magazzino'},
  {value: 'park', label: 'Parco'},
  {value: 'electrical_services', label: 'Cabina/impianto elettrico'},
  {value: 'theater_comedy', label: 'Teatro'},
  {value: 'groups', label: 'Attività sociali'},
  {value: 'volunteer_activism', label: 'Attività sociali (alt.)'},
  {value: 'sports_soccer', label: 'Campo sportivo'},
  {value: 'directions_bike', label: 'Impianti di terzi (generico)'},
];

// Nota: il font "Material Icons" classico (unico caricato nel progetto, vedi
// index.html) NON include un'icona "cimitero"/"church" — quelle esistono solo
// nel set più recente "Material Symbols" (font diverso, non caricato qui).
// Chi compila il campo può comunque digitare liberamente un nome ligature
// valido del set classico (fonts.google.com/icons, filtro "Material Icons");
// un nome non presente in quel set risulta semplicemente vuoto sul marker.
