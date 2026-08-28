import { Transform } from 'class-transformer';

export function TransformCsvToArray(): PropertyDecorator {
  return Transform(({ value }) => {
    if (value === null || value === undefined || value === '') {
      return [];
    }

    if (Array.isArray(value)) {
      return value.map((item) => Number(item));
    }

    if (typeof value === 'string') {
      return value
        .split(',')
        .map((item) => Number(item.trim()))
        .filter((num) => !isNaN(num));
    }

    if (typeof value === 'number') {
      return [value];
    }

    return value;
  });
}
