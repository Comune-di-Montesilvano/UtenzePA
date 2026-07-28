import {AbstractEntity} from '../../../core/entities/abstract.entity';
import {ISupplier} from './supplier.interface';
import {plainToInstance} from 'class-transformer';

export class Supplier extends AbstractEntity implements ISupplier {
  supplier_id!: string;
  vat_number?: string;
  tax_code?: string;
  company_name!: string;
  address?: string;
  city?: string;
  postal_code?: string;
  email?: string;
  pec?: string;

  static create(data?: Partial<Supplier>): Supplier {
    return plainToInstance(Supplier, data || {});
  }
}
