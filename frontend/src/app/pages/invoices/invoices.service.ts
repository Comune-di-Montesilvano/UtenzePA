import {Injectable} from '@angular/core';
import {HttpParams} from '@angular/common/http';
import {map, Observable} from 'rxjs';
import {plainToInstance} from 'class-transformer';
import {environment} from '../../../environments/environment';
import {AbstractService} from '../../core/services/abstract.service';
import {Invoice} from './entity/invoice.entity';
import type {InvoicePayment} from './payment-status';

@Injectable({
              providedIn: 'root',
            })
export class InvoicesService extends AbstractService<Invoice> {
  protected override readonly BASE_URL = environment.apiUrl + '/invoices';
  protected override readonly entityClass = Invoice;

  // Elenco leggero (senza righe né quote, con totali e capitoli calcolati dal
  // server): per aprire la scheda serve getById.
  list(filters?: Record<string, unknown>): Observable<Invoice[]> {
    let params = new HttpParams();
    Object.entries(filters ?? {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') params = params.set(key, value as string);
    });
    return this.http.get<unknown[]>(`${this.BASE_URL}/list`, {headers: this.getAuthHeaders(), params}).pipe(
      map(data => plainToInstance(Invoice, data))
    );
  }

  // Liquidazioni e mandati dalla contabilità.
  payments(id: number): Observable<InvoicePayment[]> {
    return this.http.get<InvoicePayment[]>(`${this.BASE_URL}/${id}/payments`, {headers: this.getAuthHeaders()});
  }

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
