import {Transform} from 'class-transformer';

// Unità catastale di un immobile (tabella asset_cadastral_units).
export class CadastralUnit {
  id?: number;
  section?: string | null;
  sheet!: string;
  parcel!: string;
  subordinate?: string | null;
  category?: string | null;
  @Transform(({ value }) => (value !== null && value !== undefined && value !== '' ? Number(value) : value))
  cadastral_income?: number | null;
}

// Testo breve per elenchi e anteprime: "F. 16 P. 200 sub. 3". withSection =
// impostazione dell'ente (branding cadastral_sections).
export const cadastralUnitLabel = (u: CadastralUnit, withSection = true): string =>
  [withSection && u.section ? `Sez. ${u.section}` : null, `F. ${u.sheet}`, `P. ${u.parcel}`, u.subordinate ? `sub. ${u.subordinate}` : null]
    .filter(Boolean)
    .join(' ');
