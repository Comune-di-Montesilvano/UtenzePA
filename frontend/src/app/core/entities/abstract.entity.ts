import {Exclude, Transform, Type} from 'class-transformer';

export abstract class AbstractEntity {
  @Exclude({toPlainOnly: true})
  id!: number;

  @Type(() => Date)
  @Exclude({toPlainOnly: true})
  @Transform(({ value, type }) => {
    if (type === 0 && value instanceof Date) {
      return value.toISOString();
    }
    return value;
  }, { toPlainOnly: true })
  create_date!: Date;

  @Type(() => Date)
  @Exclude({toPlainOnly: true})
  @Transform(({ value, type }) => {
    if (type === 0 && value instanceof Date) {
      return value.toISOString();
    }
    return value;
  }, { toPlainOnly: true })
  update_date!: Date;

  @Exclude({toPlainOnly: true})
  created_by_user_id!: number;
  @Exclude({toPlainOnly: true})
  updated_by_user_id!: number;

  @Exclude({toPlainOnly: true})
  deleted!: boolean;
}

