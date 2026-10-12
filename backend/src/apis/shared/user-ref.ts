// Autore/ultimo modificatore nelle risposte: solo nome e cognome. L'entità
// SystemUser completa esporrebbe email e OTP a tutti i ruoli (anche Lettore).
export type UserRef = { firstName: string; lastName: string } | null;

export function userRef(u: { firstName?: string; lastName?: string } | null | undefined): UserRef {
  return u ? { firstName: u.firstName ?? '', lastName: u.lastName ?? '' } : null;
}
