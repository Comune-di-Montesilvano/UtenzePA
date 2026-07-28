import { Transform } from 'class-transformer';

export function NormalizeDate() {
  return Transform(({ value }) => {
    if (!value || typeof value !== 'string') {
      return null;
    }

    const dateToParse = value.slice(0, 10);
    const d = new Date(dateToParse);

    if (isNaN(d.getTime())) {
      return null;
    }

    d.setDate(d.getDate() + 1);

    return d.toISOString().slice(0, 10);
  });
}
