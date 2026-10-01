export enum ConsumptionKind {
  READING = 'READING',
  PERIOD = 'PERIOD',
}

// Origine della rilevazione: oggi solo MANUAL, gli altri valori sono
// predisposti per l'import futuro da fatture/tracciati/API.
export enum ConsumptionSource {
  MANUAL = 'MANUAL',
  INVOICE = 'INVOICE',
  IMPORT = 'IMPORT',
  API = 'API',
}
