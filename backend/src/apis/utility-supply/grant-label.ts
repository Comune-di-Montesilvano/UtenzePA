// Etichetta di un contratto immobiliare nelle schermate sull'utenza.
export function grantLabel(grant: {
  id: number;
  subject?: string | null;
  concession_act?: string | null;
}): string {
  return grant.subject ?? grant.concession_act ?? `#${grant.id}`;
}
