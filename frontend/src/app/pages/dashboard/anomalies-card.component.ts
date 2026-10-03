import {ChangeDetectionStrategy, Component, inject, Injectable, OnInit} from '@angular/core';
import {HttpClient, HttpHeaders} from '@angular/common/http';
import {Router} from '@angular/router';
import {Observable} from 'rxjs';
import {MatCardModule} from '@angular/material/card';
import {MatExpansionModule} from '@angular/material/expansion';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {environment} from '../../../environments/environment';
import {AuthService} from '../../services/auth.service';
import {EntityNavigatorService} from '../../core/services/entity-navigator.service';

interface AnomalyList<T> {
  count: number;
  items: T[];
}

interface ContractAnomaly {
  id: number;
  supplier: string | null;
  agreement: string | null;
  supply_expiry_date: string | null;
  utilities: number;
}

interface UtilityAnomaly {
  id: number;
  utility_id: string;
  type: string | null;
  contracts?: string | null;
}

interface Anomalies {
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

const formatDate = (iso: string | null): string => {
  if (!iso) return 'senza scadenza';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

// Anomalie dei dati contrattuali. Regola: un contratto senza CIG (e non
// escluso) è di fatto inesistente.
@Component({
  selector: 'app-anomalies-card',
  standalone: true,
  imports: [MatCardModule, MatExpansionModule, MatButtonModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <mat-card>
      <mat-card-header style="padding: 1.25rem;">
        <mat-card-title style="font-size: 1.1rem; display: flex; align-items: center; gap: 0.5rem;">
          <mat-icon [style.color]="total > 0 ? '#dc2626' : '#16a34a'">{{ total > 0 ? 'report_problem' : 'verified' }}</mat-icon>
          Anomalie dati contrattuali
        </mat-card-title>
        <mat-card-subtitle>Un contratto senza CIG, e non escluso, è considerato inesistente.</mat-card-subtitle>
      </mat-card-header>
      <mat-card-content>
        @if (!data) {
          <p style="color: #6b7280;">Caricamento…</p>
        } @else {
          <mat-accordion multi>
            <mat-expansion-panel [disabled]="data.contracts_without_cig.count === 0">
              <mat-expansion-panel-header>
                <mat-panel-title>
                  <span class="anomaly-count" [class.zero]="data.contracts_without_cig.count === 0">{{ data.contracts_without_cig.count }}</span>
                  Contratti senza CIG
                </mat-panel-title>
              </mat-expansion-panel-header>
              <button mat-stroked-button (click)="openContracts()" style="margin-bottom: 0.5rem;">Apri elenco contratti</button>
              <ul class="anomaly-list">
                @for (c of data.contracts_without_cig.items; track c.id) {
                  <li (click)="openContract(c.id)">
                    #{{ c.id }} {{ c.supplier ?? '?' }}{{ c.agreement ? ' – ' + c.agreement : '' }} · {{ fmt(c.supply_expiry_date) }} · {{ c.utilities }} {{ c.utilities === 1 ? 'utenza' : 'utenze' }}
                  </li>
                }
              </ul>
            </mat-expansion-panel>

            <mat-expansion-panel [disabled]="data.active_utilities_without_cig_contract.count === 0">
              <mat-expansion-panel-header>
                <mat-panel-title>
                  <span class="anomaly-count" [class.zero]="data.active_utilities_without_cig_contract.count === 0">{{ data.active_utilities_without_cig_contract.count }}</span>
                  Utenze attive coperte solo da contratti senza CIG
                </mat-panel-title>
              </mat-expansion-panel-header>
              <ul class="anomaly-list">
                @for (u of data.active_utilities_without_cig_contract.items; track u.id) {
                  <li (click)="openUtility(u.id)">{{ u.utility_id }} · {{ u.type }} · {{ u.contracts }}</li>
                }
              </ul>
            </mat-expansion-panel>

            <mat-expansion-panel [disabled]="data.active_utilities_without_contract.count === 0">
              <mat-expansion-panel-header>
                <mat-panel-title>
                  <span class="anomaly-count" [class.zero]="data.active_utilities_without_contract.count === 0">{{ data.active_utilities_without_contract.count }}</span>
                  Utenze attive senza contratto valido
                </mat-panel-title>
              </mat-expansion-panel-header>
              <ul class="anomaly-list">
                @for (u of data.active_utilities_without_contract.items; track u.id) {
                  <li (click)="openUtility(u.id)">{{ u.utility_id }} · {{ u.type }}</li>
                }
              </ul>
            </mat-expansion-panel>

            <mat-expansion-panel [disabled]="data.active_utilities_without_arera_category.count === 0">
              <mat-expansion-panel-header>
                <mat-panel-title>
                  <span class="anomaly-count" [class.zero]="data.active_utilities_without_arera_category.count === 0">{{ data.active_utilities_without_arera_category.count }}</span>
                  Utenze attive senza tipologia ARERA
                </mat-panel-title>
              </mat-expansion-panel-header>
              <ul class="anomaly-list">
                @for (u of data.active_utilities_without_arera_category.items; track u.id) {
                  <li (click)="openUtility(u.id)">{{ u.utility_id }} · {{ u.type }}</li>
                }
              </ul>
            </mat-expansion-panel>

            <mat-expansion-panel [disabled]="data.utilities_with_overlapping_contracts.count === 0">
              <mat-expansion-panel-header>
                <mat-panel-title>
                  <span class="anomaly-count" [class.zero]="data.utilities_with_overlapping_contracts.count === 0">{{ data.utilities_with_overlapping_contracts.count }}</span>
                  Utenze con contratti sovrapposti
                </mat-panel-title>
              </mat-expansion-panel-header>
              <ul class="anomaly-list">
                @for (u of data.utilities_with_overlapping_contracts.items; track u.id) {
                  <li (click)="openUtility(u.id)">{{ u.utility_id }} · {{ u.type }} · {{ u.contracts }}</li>
                }
              </ul>
            </mat-expansion-panel>

            <mat-expansion-panel [disabled]="data.duplicate_cigs.count === 0">
              <mat-expansion-panel-header>
                <mat-panel-title>
                  <span class="anomaly-count" [class.zero]="data.duplicate_cigs.count === 0">{{ data.duplicate_cigs.count }}</span>
                  CIG duplicati
                </mat-panel-title>
              </mat-expansion-panel-header>
              <ul class="anomaly-list">
                @for (d of data.duplicate_cigs.items; track d.cig) {
                  <li>
                    {{ d.cig }} ·
                    @for (id of d.contracts; track id) {
                      <a href="javascript:void(0)" (click)="openContract(id)" style="margin-right: 0.5rem;">#{{ id }}</a>
                    }
                  </li>
                }
              </ul>
            </mat-expansion-panel>

            <mat-expansion-panel [disabled]="data.real_estate_contracts_without_assets.count === 0">
              <mat-expansion-panel-header>
                <mat-panel-title>
                  <span class="anomaly-count" [class.zero]="data.real_estate_contracts_without_assets.count === 0">{{ data.real_estate_contracts_without_assets.count }}</span>
                  Contratti immobiliari senza immobile
                </mat-panel-title>
              </mat-expansion-panel-header>
              <p style="margin: 0 0 0.5rem;">
                <a href="javascript:void(0)" (click)="openRealEstateWithoutAssets()">Apri l'elenco filtrato</a>
              </p>
              <ul class="anomaly-list">
                @for (c of data.real_estate_contracts_without_assets.items; track c.id) {
                  <li>
                    <a href="javascript:void(0)" (click)="openRealEstateContract(c.id)">#{{ c.id }}</a>
                    {{ c.counterparty ?? '' }}{{ c.subject ? ' · ' + c.subject : '' }}
                  </li>
                }
              </ul>
            </mat-expansion-panel>
            <mat-expansion-panel [disabled]="data.real_estate_contracts_without_parties.count === 0">
              <mat-expansion-panel-header>
                <mat-panel-title>
                  <span class="anomaly-count" [class.zero]="data.real_estate_contracts_without_parties.count === 0">{{ data.real_estate_contracts_without_parties.count }}</span>
                  Contratti immobiliari senza parti
                </mat-panel-title>
              </mat-expansion-panel-header>
              <ul class="anomaly-list">
                @for (c of data.real_estate_contracts_without_parties.items; track c.id) {
                  <li>
                    <a href="javascript:void(0)" (click)="openRealEstateContract(c.id)">#{{ c.id }}</a>
                    {{ c.subject ?? '' }}
                  </li>
                }
              </ul>
            </mat-expansion-panel>
            <mat-expansion-panel [disabled]="data.third_parties_without_identifier.count === 0">
              <mat-expansion-panel-header>
                <mat-panel-title>
                  <span class="anomaly-count" [class.zero]="data.third_parties_without_identifier.count === 0">{{ data.third_parties_without_identifier.count }}</span>
                  Soggetti senza P.IVA o codice fiscale
                </mat-panel-title>
              </mat-expansion-panel-header>
              <ul class="anomaly-list">
                @for (p of data.third_parties_without_identifier.items; track p.id) {
                  <li>
                    <a href="javascript:void(0)" (click)="openThirdParty(p.id)">{{ p.name }}</a>
                  </li>
                }
              </ul>
            </mat-expansion-panel>
            <mat-expansion-panel [disabled]="data.plants_without_asset.count === 0">
              <mat-expansion-panel-header>
                <mat-panel-title>
                  <span class="anomaly-count" [class.zero]="data.plants_without_asset.count === 0">{{ data.plants_without_asset.count }}</span>
                  Ascensori, antincendio e termici senza immobile
                </mat-panel-title>
              </mat-expansion-panel-header>
              <ul class="anomaly-list">
                @for (p of data.plants_without_asset.items; track p.id) {
                  <li>
                    <a href="javascript:void(0)" (click)="openPlant(p.id)">{{ p.code }}</a> {{ p.name }}
                  </li>
                }
              </ul>
            </mat-expansion-panel>
            <mat-expansion-panel [disabled]="data.plants_without_position.count === 0">
              <mat-expansion-panel-header>
                <mat-panel-title>
                  <span class="anomaly-count" [class.zero]="data.plants_without_position.count === 0">{{ data.plants_without_position.count }}</span>
                  Impianti senza posizione
                </mat-panel-title>
              </mat-expansion-panel-header>
              <p style="margin: 0 0 0.5rem;">
                <a href="javascript:void(0)" (click)="openPlantsWithoutPosition()">Apri l'elenco filtrato</a>
              </p>
              <ul class="anomaly-list">
                @for (p of data.plants_without_position.items; track p.id) {
                  <li>
                    <a href="javascript:void(0)" (click)="openPlant(p.id)">{{ p.code }}</a> {{ p.name }}
                  </li>
                }
              </ul>
            </mat-expansion-panel>
          </mat-accordion>
        }
      </mat-card-content>
    </mat-card>
  `,
  styles: [`
    .anomaly-count { display: inline-block; min-width: 2.25rem; text-align: center; margin-right: 0.75rem;
      padding: 1px 8px; border-radius: 10px; background: #fee2e2; color: #991b1b; font-weight: 600; }
    .anomaly-count.zero { background: #dcfce7; color: #166534; }
    .anomaly-list { max-height: 40vh; overflow-y: auto; margin: 0; padding-left: 1.25rem; font-size: 0.875rem; }
    .anomaly-list li { cursor: pointer; padding: 2px 0; }
    .anomaly-list li:hover { text-decoration: underline; }
  `],
})
export class AnomaliesCardComponent implements OnInit {
  private service = inject(AnomaliesService);
  private router = inject(Router);
  private navigator = inject(EntityNavigatorService);

  data: Anomalies | null = null;
  readonly fmt = formatDate;

  get total(): number {
    if (!this.data) return 0;
    return this.data.contracts_without_cig.count + this.data.active_utilities_without_cig_contract.count
      + this.data.active_utilities_without_contract.count + this.data.utilities_with_overlapping_contracts.count
      + this.data.duplicate_cigs.count + this.data.real_estate_contracts_without_assets.count
      + this.data.plants_without_position.count + this.data.plants_without_asset.count
      + this.data.real_estate_contracts_without_parties.count + this.data.third_parties_without_identifier.count
      + this.data.active_utilities_without_arera_category.count;
  }

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.service.get().subscribe({
      next: data => this.data = data,
      error: err => console.error('Errore caricamento anomalie:', err),
    });
  }

  openContracts(): void {
    this.router.navigate(['/contracts'], {queryParams: {missing_cig: true}});
  }

  openContract(id: number): void {
    this.router.navigate(['/contracts'], {queryParams: {selectedId: id}});
  }

  openRealEstateWithoutAssets(): void {
    this.router.navigate(['/utilizer-grant'], {queryParams: {alert: 'without_assets'}});
  }

  openPlantsWithoutPosition(): void {
    this.router.navigate(['/plants'], {queryParams: {position: 'missing'}});
  }

  openPlant(id: number): void {
    this.router.navigate(['/plants'], {queryParams: {selectedId: id}});
  }

  openThirdParty(id: number): void {
    this.navigator.openThirdParty(id).subscribe(saved => {
      if (saved) this.load();
    });
  }

  openRealEstateContract(id: number): void {
    this.router.navigate(['/utilizer-grant'], {queryParams: {selectedId: id}});
  }

  openUtility(id: number): void {
    this.router.navigate(['/utilities'], {queryParams: {selectedId: id}});
  }
}
