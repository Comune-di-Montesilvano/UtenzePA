import {SupplyType} from '../enum/supply-type.enum';

export interface IBudgetChapter {
  id: number;
  chapter_code: string;
  article?: '0' | '1';
  name?: string;
  code?: string;
  pdc?: string;
  supply_type: SupplyType;
  description?: string;
}
