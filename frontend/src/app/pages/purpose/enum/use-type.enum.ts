export enum UseType {
  GENERIC = 'GENERIC',
  SPECIFIC = 'SPECIFIC',
}

export const UseTypeDescription: Record<UseType, string> = {
  [UseType.GENERIC]: 'Uso Generico',
  [UseType.SPECIFIC]: 'Uso Specifico',
};

export const UseTypeOptions = Object.values(UseType).map(value => ({
  label: UseTypeDescription[value],
  value: value
}));
