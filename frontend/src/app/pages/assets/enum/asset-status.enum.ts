export enum AssetStatus {
  ATTIVO = 'Attivo',
  DISMESSO = 'Dismesso',
  DA_VERIFICARE = 'Da verificare',
}

export const ASSET_STATUS_OPTIONS = Object.values(AssetStatus).map(v => ({label: v, value: v}));
