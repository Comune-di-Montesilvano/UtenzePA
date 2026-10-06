// Tipologia del contratto di fornitura (alternative tra loro):
// - STANDARD: CIG obbligatorio;
// - CIG_EXEMPT: escluso da CIG (es. servizio idrico in house);
// - FREE: a titolo gratuito, nessun costo per il Comune (es. linee in
//   convenzione gratuita): niente CIG, e le sue utenze non hanno bisogno
//   del capitolo di spesa.
export enum ContractKind {
  STANDARD = 'STANDARD',
  CIG_EXEMPT = 'CIG_EXEMPT',
  FREE = 'FREE',
}

export const CONTRACT_KINDS = Object.values(ContractKind);
