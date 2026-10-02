import { ThirdPartyType } from './enum/third-party.enum';
import { PartyFields } from './third-party.name';

const VAT = /^\d{11}$/;
const CF_PERSON = /^[A-Z0-9]{16}$/;
// Il CF di un soggetto giuridico è spesso numerico a 11 cifre (es. ACA).
const CF_LEGAL = /^(\d{11}|[A-Z0-9]{16})$/;

const IDENTITY_FIELDS = ['type', 'company_name', 'last_name', 'first_name', 'vat_number', 'tax_code'];
const CODE_FIELDS = ['vat_number', 'tax_code'];
const NAME_FIELDS = ['company_name', 'last_name', 'first_name'];

// P.IVA/CF maiuscoli senza spazi, nomi ripuliti, stringhe vuote a null.
// Tocca solo i campi presenti nell'oggetto.
export function normalizeParty<T extends PartyFields>(p: T): T {
  const out = { ...p } as Record<string, unknown>;
  for (const f of CODE_FIELDS) {
    if (!(f in out)) continue;
    const v = out[f] === null || out[f] === undefined ? '' : String(out[f]);
    out[f] = v.replace(/\s+/g, '').toUpperCase() || null;
  }
  for (const f of NAME_FIELDS) {
    if (!(f in out)) continue;
    const v = out[f] === null || out[f] === undefined ? '' : String(out[f]).trim();
    out[f] = v || null;
  }
  return out as T;
}

// La validazione scatta solo se il payload tocca l'identità: un ripristino
// ({deleted:false}) di un soggetto storico incompleto deve riuscire.
export function touchesIdentity(dto: object): boolean {
  return IDENTITY_FIELDS.some((f) => f in dto);
}

export function validateThirdParty(p: PartyFields): string | null {
  if (p.type !== ThirdPartyType.LEGAL && p.type !== ThirdPartyType.NATURAL) {
    return 'Indicare se il soggetto è una persona fisica o giuridica.';
  }
  if (p.vat_number && !VAT.test(p.vat_number)) return 'Partita IVA non valida: servono 11 cifre.';
  if (p.type === ThirdPartyType.LEGAL) {
    if (!p.company_name) return 'Denominazione obbligatoria.';
    if (!p.vat_number) return 'Partita IVA obbligatoria per i soggetti giuridici.';
    if (p.tax_code && !CF_LEGAL.test(p.tax_code)) return 'Codice fiscale non valido.';
    return null;
  }
  if (!p.last_name || !p.first_name) return 'Cognome e nome obbligatori.';
  if (!p.tax_code) return 'Codice fiscale obbligatorio per le persone fisiche.';
  if (!CF_PERSON.test(p.tax_code)) return 'Codice fiscale non valido: servono 16 caratteri.';
  return null;
}
