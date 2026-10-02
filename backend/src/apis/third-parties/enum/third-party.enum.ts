export enum ThirdPartyType {
  NATURAL = 'NATURAL', // persona fisica
  LEGAL = 'LEGAL', // soggetto giuridico (società, ente, associazione, ditta)
}

// Ruoli calcolati dai collegamenti, mai salvati. UNLINKED vale solo come filtro.
export enum PartyRole {
  SUPPLIER = 'supplier',
  LESSOR = 'lessor',
  TENANT = 'tenant',
  UNLINKED = 'unlinked',
}
