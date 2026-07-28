import { Transform } from 'class-transformer';
import { IsDate } from 'class-validator';

export function DatePlusHours(hours: number = 6) {
  return function (target: any, key: string) {
    Transform(({ value }) => {
      if (!value) return undefined;
      const date = new Date(value);
      if (isNaN(date.getTime())) return undefined;
      date.setHours(date.getHours() + hours);
      return date;
    })(target, key);

    IsDate()(target, key);
  };
}
