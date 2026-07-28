export enum SupplyType {
  ELECTRICITY = 'ELECTRICITY',
  THERMAL_MANAGEMENT = 'THERMAL_MANAGEMENT',
  GAS_SUPPLY_ONLY = 'GAS_SUPPLY_ONLY',
  WATER = 'WATER',
  SPRAR_UTILITIES = 'SPRAR_UTILITIES',
}

export const SupplyTypeDescription: Record<SupplyType, string> = {
  [SupplyType.ELECTRICITY]: 'Energia elettrica',
  [SupplyType.THERMAL_MANAGEMENT]: 'Gestione termica',
  [SupplyType.GAS_SUPPLY_ONLY]: 'Gas solo fornitura',
  [SupplyType.WATER]: 'Acqua',
  [SupplyType.SPRAR_UTILITIES]: 'Utenze Sprar',
};

export const SupplyTypeOptions = Object.values(SupplyType).map(value => ({
  label: SupplyTypeDescription[value],
  value: value
}));
