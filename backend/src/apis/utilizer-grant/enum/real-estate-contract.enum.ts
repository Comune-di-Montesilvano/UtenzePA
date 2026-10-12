export enum ContractDirection {
  ACTIVE = 'ACTIVE', // il Comune incassa
  PASSIVE = 'PASSIVE', // il Comune paga
}

export enum ContractKind {
  LEASE = 'LEASE',
  CONCESSION = 'CONCESSION',
  LOAN_FOR_USE = 'LOAN_FOR_USE',
  HOUSING_ASSIGNMENT = 'HOUSING_ASSIGNMENT',
  LAND_OCCUPATION = 'LAND_OCCUPATION',
}

// Regime IVA del canone (il canone è sempre netto). null = da indicare.
// Gemello frontend: VAT_REGIME_LABEL/VAT_RATE in real-estate-contract.model.ts.
export enum VatRegime {
  OUT_OF_SCOPE = 'OUT_OF_SCOPE', // fuori campo IVA (es. locatore privato)
  EXEMPT = 'EXEMPT', // esente, art. 10 DPR 633/72
  VAT_10 = 'VAT_10',
  VAT_22 = 'VAT_22',
}

export enum RentPeriod {
  MONTHLY = 'MONTHLY',
  BIMONTHLY = 'BIMONTHLY',
  QUARTERLY = 'QUARTERLY',
  SEMIANNUAL = 'SEMIANNUAL',
  ANNUAL = 'ANNUAL',
  ONE_OFF = 'ONE_OFF',
}

// Stato dichiarato dall'utente.
export enum ContractStatus {
  ACTIVE = 'ACTIVE',
  RETURNED = 'RETURNED',
  TERMINATED = 'TERMINATED',
  DISPUTED = 'DISPUTED',
}

// Stato mostrato: dichiarato + derivato dalle date.
export enum DisplayStatus {
  ACTIVE = 'ACTIVE',
  EXPIRING = 'EXPIRING',
  EXPIRED = 'EXPIRED',
  RETURNED = 'RETURNED',
  TERMINATED = 'TERMINATED',
  DISPUTED = 'DISPUTED',
}
