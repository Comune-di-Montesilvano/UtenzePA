import {inject, Injectable} from '@angular/core';
import {HttpClient, HttpHeaders} from '@angular/common/http';
import {Observable} from 'rxjs';
import {environment} from '../../../environments/environment';
import {AuthService} from '../../services/auth.service';

// Anomalie dei dati (GET /anomalies): dashboard e segnalazioni degli elenchi.
export interface AnomalyList<T> {
  count: number;
  items: T[];
}

export interface ContractAnomaly {
  id: number;
  supplier: string | null;
  agreement: string | null;
  supply_expiry_date: string | null;
  utilities: number;
}

export interface UtilityAnomaly {
  id: number;
  utility_id: string;
  type: string | null;
  contracts?: string | null;
}

export interface Anomalies {
  contracts_without_cig: AnomalyList<ContractAnomaly>;
  active_utilities_without_contract: AnomalyList<UtilityAnomaly>;
  active_utilities_without_cig_contract: AnomalyList<UtilityAnomaly>;
  utilities_with_overlapping_contracts: AnomalyList<UtilityAnomaly>;
  duplicate_cigs: AnomalyList<{cig: string; contracts: number[]}>;
  real_estate_contracts_without_assets: AnomalyList<{id: number; counterparty: string | null; subject: string | null}>;
  plants_without_position: AnomalyList<{id: number; code: string; name: string; type: string}>;
  plants_without_asset: AnomalyList<{id: number; code: string; name: string; type: string}>;
  real_estate_contracts_without_parties: AnomalyList<{id: number; subject: string | null}>;
  third_parties_without_identifier: AnomalyList<{id: number; name: string; type: string}>;
  active_utilities_without_arera_category: AnomalyList<UtilityAnomaly>;
  active_gas_utilities_without_use_category: AnomalyList<UtilityAnomaly>;
  utilities_to_transfer: AnomalyList<UtilityAnomaly>;
  utilities_to_recover: AnomalyList<UtilityAnomaly>;
  assets_without_classification: AnomalyList<{id: number; asset_name: string; missing: string}>;
  invoices_on_ceased_utilities: AnomalyList<{invoice_id: number; number: string; invoice_date: string; utility_id: number; utility_code: string}>;
  utilities_with_uncommitted_chapter: AnomalyList<UtilityAnomaly & {chapter: string}>;
  active_utilities_without_chapter: AnomalyList<UtilityAnomaly>;
  invoice_lines_without_utility: AnomalyList<{invoice_id: number; number: string; supply_code: string | null; amount: number}>;
}

// Non estende AbstractService: header Authorization messo a mano (nessun
// interceptor lo aggiunge, vedi CLAUDE.md).
@Injectable({providedIn: 'root'})
export class AnomaliesService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);

  get(): Observable<Anomalies> {
    return this.http.get<Anomalies>(`${environment.apiUrl}/anomalies`, {
      headers: new HttpHeaders({Authorization: `Bearer ${this.auth.getToken() || ''}`}),
    });
  }
}
