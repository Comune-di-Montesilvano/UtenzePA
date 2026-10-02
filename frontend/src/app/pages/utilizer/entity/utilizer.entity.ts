import {plainToInstance} from 'class-transformer';
import {AbstractEntity} from '../../../core/entities/abstract.entity';
import {IUtilizer} from './utilizer.interface';

export class Utilizer extends AbstractEntity implements IUtilizer {
  name!: string;
  description?: string;
  // Codice fiscale / P. IVA: null per il ruolo Lettore (oscurato dal backend).
  tax_code?: string | null;
  contacts?: string | null;

  static create(data?: Partial<Utilizer>): Utilizer {
    return plainToInstance(Utilizer, {
      name: null,
      description: null,
      deleted: false,
      ...data,
    });
  }
}
