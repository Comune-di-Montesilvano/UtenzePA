import { Transform } from 'class-transformer';

// Campo di testo facoltativo: un input non compilato manda '' (o solo spazi),
// che si salva come null ("non indicato"), mai come stringa vuota.
export function EmptyToNull(): PropertyDecorator {
  return Transform(({ value }) => (typeof value === 'string' && value.trim() === '' ? null : value));
}

// Numero facoltativo: '' = null (non noto); null resta null (mai Number(null) = 0).
export function NullableNumber(): PropertyDecorator {
  return Transform(({ value }) => (value === '' ? null : value === null || value === undefined ? value : Number(value)));
}
