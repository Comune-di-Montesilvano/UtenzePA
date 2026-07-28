
import { Transform } from 'class-transformer';

export function TransformDecimal(): PropertyDecorator {
  return Transform(({ value }) => {
    if (typeof value === 'string') {
      let normalizedValue = value.replace(/\./g, ''); 
      normalizedValue = normalizedValue.replace(',', '.'); 
      
      return Number(normalizedValue);
    }
    return value;
  });
}