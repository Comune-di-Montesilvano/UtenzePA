import {Injectable} from '@angular/core';
import {Observable} from 'rxjs';
import {environment} from '../../../environments/environment';
import {AbstractService} from '../../core/services/abstract.service';
import {Invoice} from './entity/invoice.entity';

@Injectable({
              providedIn: 'root',
            })
export class InvoicesService extends AbstractService<Invoice> {
  protected override readonly BASE_URL = environment.apiUrl + '/invoices';
  protected override readonly entityClass = Invoice;

  getMonthlyCosts(): Observable<number> {
    return this.http.get<number>(`${this.BASE_URL}/monthly-costs`, {
      headers: this.getAuthHeaders(),
    });
  }

  // XML o PDF riletti dalla PEC dello SDI (import fatture).
  sdiDocument(id: number, type: 'xml' | 'pdf'): Observable<Blob> {
    return this.http.get(`${this.BASE_URL}/${id}/sdi-document`, {
      headers: this.getAuthHeaders(),
      params: {type},
      responseType: 'blob',
    });
  }
}
