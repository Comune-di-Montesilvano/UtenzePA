// Tipo di cambiamento nello storico di un'utenza (roadmap voce 22).
export enum SupplyEventType {
  ACTIVATION = 'ACTIVATION',
  CESSATION = 'CESSATION',
  // Voltura a un soggetto terzo.
  TRANSFER = 'TRANSFER',
  // Reintestazione al Comune.
  RETURN = 'RETURN',
}

// Decisione per utenza su un contratto immobiliare: segue il contratto o
// resta al Comune. Nessuna decisione (null) = da decidere.
export enum GrantUtilityDecisionValue {
  FOLLOWS = 'FOLLOWS',
  STAYS = 'STAYS',
}
