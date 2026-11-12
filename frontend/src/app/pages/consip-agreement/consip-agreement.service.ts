import {Injectable} from '@angular/core';
import {map, Observable} from 'rxjs';
import {plainToInstance} from 'class-transformer';
import {environment} from '../../../environments/environment';
import {ConsipAgreement} from './entity/consip-agreement.entity';
import {AbstractService} from '../../core/services/abstract.service';
import {Commitment} from '../commitments/commitment.model';
import type {AgreementForecast} from './agreement-forecast.model';

export interface AgreementCommitments {
  items: Commitment[];
  totals: {amount: number; spent: number; remaining: number};
}

@Injectable({
              providedIn: 'root'
            })
export class ConsipAgreementService extends AbstractService<ConsipAgreement> {
  protected override readonly BASE_URL = environment.apiUrl + '/consip-agreement';
  protected override readonly entityClass = ConsipAgreement;

  // Impegni dei contratti della convenzione, con i totali.
  commitments(id: number): Observable<AgreementCommitments> {
    return this.http.get<{items: unknown[]; totals: AgreementCommitments['totals']}>(
      `${this.BASE_URL}/${id}/commitments`, {headers: this.getAuthHeaders()},
    ).pipe(map(r => ({items: plainToInstance(Commitment, r.items), totals: r.totals})));
  }

  // Fabbisogno per capitolo ed esercizio: il backend lo ricalcola a ogni lettura.
  forecast(id: number): Observable<AgreementForecast> {
    return this.http.get<AgreementForecast>(`${this.BASE_URL}/${id}/forecast`, {headers: this.getAuthHeaders()});
  }

  // Costo unitario a mano per tipo di utenza; null = torna al proposto.
  setForecastPrice(id: number, hardType: string, unitPrice: number | null): Observable<AgreementForecast> {
    return this.http.put<AgreementForecast>(
      `${this.BASE_URL}/${id}/forecast/prices/${hardType}`, {unit_price: unitPrice}, {headers: this.getAuthHeaders()},
    );
  }

  linkContract(id: number, contractId: number): Observable<unknown> {
    return this.http.post(`${this.BASE_URL}/${id}/contracts/${contractId}`, {}, {headers: this.getAuthHeaders()});
  }

  unlinkContract(id: number, contractId: number): Observable<unknown> {
    return this.http.delete(`${this.BASE_URL}/${id}/contracts/${contractId}`, {headers: this.getAuthHeaders()});
  }
}
