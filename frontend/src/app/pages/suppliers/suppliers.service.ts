import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { AbstractService } from '../../core/services/abstract.service';
import { Supplier } from './entity/supplier.entity';

@Injectable({
  providedIn: 'root'
})
export class SuppliersService extends AbstractService<Supplier> {
  protected override readonly BASE_URL = environment.apiUrl + '/suppliers';
  protected override readonly entityClass = Supplier;
}
