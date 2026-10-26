// Numero fattura confrontabile tra contabilità, PEC e inserimento a mano:
// solo lettere e cifre, in maiuscolo, senza zeri iniziali.
export const normalizeInvoiceNumber = (n: string): string =>
  n
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .replace(/^0+/, '');
