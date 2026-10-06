// Tipologia del contratto di fornitura (gemello di apis/contracts/enum/contract-kind.enum.ts).
export enum ContractKind {
  STANDARD = 'STANDARD',
  CIG_EXEMPT = 'CIG_EXEMPT',
  FREE = 'FREE',
}

export const CONTRACT_KIND_LABEL: Record<ContractKind, string> = {
  [ContractKind.STANDARD]: 'Ordinario',
  [ContractKind.CIG_EXEMPT]: 'Escluso da CIG (es. in house)',
  [ContractKind.FREE]: 'A titolo gratuito (nessun costo per il Comune)',
};

export const CONTRACT_KIND_OPTIONS = Object.values(ContractKind).map(value => ({label: CONTRACT_KIND_LABEL[value], value}));

// CIG obbligatorio solo per i contratti ordinari (assente = ordinario).
export const isCigRequired = (kind: ContractKind | null | undefined): boolean =>
  (kind ?? ContractKind.STANDARD) === ContractKind.STANDARD;

// Etichetta breve al posto del CIG mancante (elenchi, dashboard).
const NO_CIG_LABEL: Partial<Record<ContractKind, string>> = {
  [ContractKind.CIG_EXEMPT]: 'Escluso da CIG',
  [ContractKind.FREE]: 'A titolo gratuito',
};

export const noCigLabel = (kind: ContractKind | null | undefined): string | null =>
  (kind && NO_CIG_LABEL[kind]) || null;
