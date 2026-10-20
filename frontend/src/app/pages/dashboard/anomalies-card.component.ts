import {ChangeDetectionStrategy, Component, inject, OnInit} from '@angular/core';
import {Router} from '@angular/router';
import {MatCardModule} from '@angular/material/card';
import {MatExpansionModule} from '@angular/material/expansion';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatTooltipModule} from '@angular/material/tooltip';
import {MatDialog} from '@angular/material/dialog';
import {ConfirmDialogComponent} from '../../core/components/confirm-dialog.component';
import {ToastService} from '../../core/services/toast.service';
import {AuthService} from '../../services/auth.service';
import {isEditorRole} from '../../core/components/entity-sheet/sheet-utils';
import {InvoicePatternsService} from '../invoice-import/invoice-patterns.service';
import {EntityNavigatorService} from '../../core/services/entity-navigator.service';
import {sinceDays} from '../../core/components/entity-sheet/sheet-utils';
import {Anomalies, AnomaliesService} from '../../core/services/anomalies.service';
import {importIssueLabel} from '../invoice-import/import-issues';

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
  imports: [MatCardModule, MatExpansionModule, MatButtonModule, MatIconModule, MatTooltipModule],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <mat-card>
      <mat-card-header style="padding: 1.25rem;">
        <mat-card-title style="font-size: 1.1rem; display: flex; align-items: center; gap: 0.5rem;">
          <mat-icon [style.color]="total > 0 ? 'light-dark(#dc2626, #f87171)' : 'light-dark(#16a34a, #4ade80)'">{{ total > 0 ? 'report_problem' : 'verified' }}</mat-icon>
          Anomalie dati contrattuali
        </mat-card-title>
        <mat-card-subtitle>Un contratto di fornitura senza CIG, e non escluso, è considerato inesistente.</mat-card-subtitle>
      </mat-card-header>
      <mat-card-content>
        @if (!data) {
          <p style="color: var(--app-muted);">Caricamento…</p>
        } @else {
          @if (!hasAnomalies()) {
            <p class="no-anomalies">Nessuna anomalia: i dati sono in ordine.</p>
          }
          <mat-accordion multi>
            @if (data.contracts_without_cig.count > 0) {
            <mat-expansion-panel>
              <mat-expansion-panel-header>
                <mat-panel-title>
                  <span class="anomaly-count" [class.zero]="data.contracts_without_cig.count === 0">{{ data.contracts_without_cig.count }}</span>
                  Contratti di fornitura senza CIG
                </mat-panel-title>
              </mat-expansion-panel-header>
              <button mat-stroked-button (click)="openContracts()" style="margin-bottom: 0.5rem;">Apri elenco contratti di fornitura</button>
              <ul class="anomaly-list">
                @for (c of data.contracts_without_cig.items; track c.id) {
                  <li (click)="openContract(c.id)">
                    #{{ c.id }} {{ c.supplier ?? '?' }}{{ c.agreement ? ' – ' + c.agreement : '' }} · {{ fmt(c.supply_expiry_date) }} · {{ c.utilities }} {{ c.utilities === 1 ? 'utenza' : 'utenze' }}
                  </li>
                }
              </ul>
            </mat-expansion-panel>
            }

            @if (data.active_utilities_without_cig_contract.count > 0) {
            <mat-expansion-panel>
              <mat-expansion-panel-header>
                <mat-panel-title>
                  <span class="anomaly-count" [class.zero]="data.active_utilities_without_cig_contract.count === 0">{{ data.active_utilities_without_cig_contract.count }}</span>
                  Utenze attive coperte solo da contratti di fornitura senza CIG
                </mat-panel-title>
              </mat-expansion-panel-header>
              <ul class="anomaly-list">
                @for (u of data.active_utilities_without_cig_contract.items; track u.id) {
                  <li (click)="openUtility(u.id)">{{ u.utility_id }} · {{ u.type }} · {{ u.contracts }}</li>
                }
              </ul>
            </mat-expansion-panel>
            }

            @if (data.active_utilities_without_contract.count > 0) {
            <mat-expansion-panel>
              <mat-expansion-panel-header>
                <mat-panel-title>
                  <span class="anomaly-count" [class.zero]="data.active_utilities_without_contract.count === 0">{{ data.active_utilities_without_contract.count }}</span>
                  Utenze attive senza contratto di fornitura valido
                </mat-panel-title>
              </mat-expansion-panel-header>
              <ul class="anomaly-list">
                @for (u of data.active_utilities_without_contract.items; track u.id) {
                  <li (click)="openUtility(u.id)">{{ u.utility_id }} · {{ u.type }}</li>
                }
              </ul>
            </mat-expansion-panel>
            }

            @if (data.active_utilities_without_arera_category.count > 0) {
            <mat-expansion-panel>
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
            }

            @if (data.active_gas_utilities_without_use_category.count > 0) {
            <mat-expansion-panel>
              <mat-expansion-panel-header>
                <mat-panel-title>
                  <span class="anomaly-count" [class.zero]="data.active_gas_utilities_without_use_category.count === 0">{{ data.active_gas_utilities_without_use_category.count }}</span>
                  Utenze gas attive senza categoria d'uso
                </mat-panel-title>
              </mat-expansion-panel-header>
              <ul class="anomaly-list">
                @for (u of data.active_gas_utilities_without_use_category.items; track u.id) {
                  <li (click)="openUtility(u.id)">{{ u.utility_id }} · {{ u.type }}</li>
                }
              </ul>
            </mat-expansion-panel>
            }

            @if (data.active_utilities_without_position.count > 0) {
            <mat-expansion-panel>
              <mat-expansion-panel-header>
                <mat-panel-title>
                  <span class="anomaly-count" [class.zero]="data.active_utilities_without_position.count === 0">{{ data.active_utilities_without_position.count }}</span>
                  Utenze attive senza posizione
                </mat-panel-title>
              </mat-expansion-panel-header>
              <ul class="anomaly-list">
                @for (u of data.active_utilities_without_position.items; track u.id) {
                  <li (click)="openUtility(u.id)">{{ u.utility_id }} · {{ u.type }}</li>
                }
              </ul>
            </mat-expansion-panel>
            }

            @if (data.utilities_to_transfer.count > 0) {
            <mat-expansion-panel>
              <mat-expansion-panel-header>
                <mat-panel-title>
                  <span class="anomaly-count" [class.zero]="data.utilities_to_transfer.count === 0">{{ data.utilities_to_transfer.count }}</span>
                  Utenze da volturare
                </mat-panel-title>
              </mat-expansion-panel-header>
              <ul class="anomaly-list">
                @for (u of data.utilities_to_transfer.items; track u.id) {
                  <li (click)="openUtility(u.id)">{{ u.utility_id }} · {{ u.type }} · {{ sinceDays(u.pending_days) }}</li>
                }
              </ul>
            </mat-expansion-panel>
            }

            @if (data.utilities_to_recover.count > 0) {
            <mat-expansion-panel>
              <mat-expansion-panel-header>
                <mat-panel-title>
                  <span class="anomaly-count" [class.zero]="data.utilities_to_recover.count === 0">{{ data.utilities_to_recover.count }}</span>
                  Utenze da reintestare al Comune
                </mat-panel-title>
              </mat-expansion-panel-header>
              <ul class="anomaly-list">
                @for (u of data.utilities_to_recover.items; track u.id) {
                  <li (click)="openUtility(u.id)">{{ u.utility_id }} · {{ u.type }} · {{ sinceDays(u.pending_days) }}</li>
                }
              </ul>
            </mat-expansion-panel>
            }

            @if (data.utilities_to_decide.count > 0) {
            <mat-expansion-panel>
              <mat-expansion-panel-header>
                <mat-panel-title>
                  <span class="anomaly-count">{{ data.utilities_to_decide.count }}</span>
                  Utenze da decidere (contratti immobiliari)
                </mat-panel-title>
              </mat-expansion-panel-header>
              <ul class="anomaly-list">
                @for (u of data.utilities_to_decide.items; track u.id) {
                  <li (click)="openUtility(u.id)">{{ u.utility_id }} · {{ u.type }} · {{ sinceDays(u.pending_days) }}</li>
                }
              </ul>
            </mat-expansion-panel>
            }

            @if (data.pending_activations.count > 0) {
            <mat-expansion-panel>
              <mat-expansion-panel-header>
                <mat-panel-title>
                  <span class="anomaly-count">{{ data.pending_activations.count }}</span>
                  Attivazioni in sospeso
                </mat-panel-title>
              </mat-expansion-panel-header>
              <ul class="anomaly-list">
                @for (u of data.pending_activations.items; track u.id) {
                  <li (click)="openUtility(u.id)">{{ u.utility_id }} · {{ u.type }} · {{ sinceDays(u.pending_days) }}</li>
                }
              </ul>
            </mat-expansion-panel>
            }

            @if (data.pending_cessations.count > 0) {
            <mat-expansion-panel>
              <mat-expansion-panel-header>
                <mat-panel-title>
                  <span class="anomaly-count">{{ data.pending_cessations.count }}</span>
                  Cessazioni in sospeso
                </mat-panel-title>
              </mat-expansion-panel-header>
              <ul class="anomaly-list">
                @for (u of data.pending_cessations.items; track u.id) {
                  <li (click)="openUtility(u.id)">{{ u.utility_id }} · {{ u.type }} · {{ sinceDays(u.pending_days) }}</li>
                }
              </ul>
            </mat-expansion-panel>
            }

            @if (data.utilities_with_overlapping_contracts.count > 0) {
            <mat-expansion-panel>
              <mat-expansion-panel-header>
                <mat-panel-title>
                  <span class="anomaly-count" [class.zero]="data.utilities_with_overlapping_contracts.count === 0">{{ data.utilities_with_overlapping_contracts.count }}</span>
                  Utenze con contratti di fornitura sovrapposti
                </mat-panel-title>
              </mat-expansion-panel-header>
              <ul class="anomaly-list">
                @for (u of data.utilities_with_overlapping_contracts.items; track u.id) {
                  <li (click)="openUtility(u.id)">{{ u.utility_id }} · {{ u.type }} · {{ u.contracts }}</li>
                }
              </ul>
            </mat-expansion-panel>
            }

            @if (data.duplicate_cigs.count > 0) {
            <mat-expansion-panel>
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
            }

            @if (data.real_estate_contracts_without_assets.count > 0) {
            <mat-expansion-panel>
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
            }
            @if (data.real_estate_contracts_without_parties.count > 0) {
            <mat-expansion-panel>
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
            }
            @if (data.third_parties_without_identifier.count > 0) {
            <mat-expansion-panel>
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
            }
            @if (data.plants_without_asset.count > 0) {
            <mat-expansion-panel>
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
            }
            @if (data.assets_without_classification.count > 0) {
            <mat-expansion-panel>
              <mat-expansion-panel-header>
                <mat-panel-title>
                  <span class="anomaly-count" [class.zero]="data.assets_without_classification.count === 0">{{ data.assets_without_classification.count }}</span>
                  Immobili senza natura o funzione
                </mat-panel-title>
              </mat-expansion-panel-header>
              <ul class="anomaly-list">
                @for (a of data.assets_without_classification.items; track a.id) {
                  <li (click)="openAsset(a.id)">{{ a.asset_name }} · manca {{ a.missing }}</li>
                }
              </ul>
            </mat-expansion-panel>
            }
            @if (data.rented_assets_without_passive_contract.count > 0) {
            <mat-expansion-panel>
              <mat-expansion-panel-header>
                <mat-panel-title>
                  <span class="anomaly-count">{{ data.rented_assets_without_passive_contract.count }}</span>
                  Immobili non di proprietà senza contratto passivo attivo
                </mat-panel-title>
              </mat-expansion-panel-header>
              <ul class="anomaly-list">
                @for (a of data.rented_assets_without_passive_contract.items; track a.id) {
                  <li (click)="openAsset(a.id)">{{ a.asset_name }}</li>
                }
              </ul>
            </mat-expansion-panel>
            }
            @if (data.assets_without_cadastre.count > 0) {
            <mat-expansion-panel>
              <mat-expansion-panel-header>
                <mat-panel-title>
                  <span class="anomaly-count">{{ data.assets_without_cadastre.count }}</span>
                  Immobili di proprietà senza unità catastali
                </mat-panel-title>
              </mat-expansion-panel-header>
              <ul class="anomaly-list">
                @for (a of data.assets_without_cadastre.items; track a.id) {
                  <li (click)="openAsset(a.id)">{{ a.asset_name }}</li>
                }
              </ul>
            </mat-expansion-panel>
            }
            @if (data.assets_without_mef_id.count > 0) {
            <mat-expansion-panel>
              <mat-expansion-panel-header>
                <mat-panel-title>
                  <span class="anomaly-count">{{ data.assets_without_mef_id.count }}</span>
                  Fabbricati di proprietà senza Id MEF
                </mat-panel-title>
              </mat-expansion-panel-header>
              <ul class="anomaly-list">
                @for (a of data.assets_without_mef_id.items; track a.id) {
                  <li (click)="openAsset(a.id)">{{ a.asset_name }}</li>
                }
              </ul>
            </mat-expansion-panel>
            }
            @if (data.units_without_subordinate.count > 0) {
            <mat-expansion-panel>
              <mat-expansion-panel-header>
                <mat-panel-title>
                  <span class="anomaly-count">{{ data.units_without_subordinate.count }}</span>
                  Subalterno da assegnare (immobili con stessi via, civico, foglio e particella)
                </mat-panel-title>
              </mat-expansion-panel-header>
              <ul class="anomaly-list">
                @for (a of data.units_without_subordinate.items; track a.id) {
                  <li (click)="openAsset(a.id)">{{ a.asset_name }}</li>
                }
              </ul>
            </mat-expansion-panel>
            }
            @if (data.functions_without_mef_type.count > 0) {
            <mat-expansion-panel>
              <mat-expansion-panel-header>
                <mat-panel-title>
                  <span class="anomaly-count">{{ data.functions_without_mef_type.count }}</span>
                  Funzioni immobile senza tipologia MEF
                </mat-panel-title>
              </mat-expansion-panel-header>
              <ul class="anomaly-list">
                @for (a of data.functions_without_mef_type.items; track a.id) {
                  <li (click)="openAssetFunction(a.id)">{{ a.name }}</li>
                }
              </ul>
            </mat-expansion-panel>
            }
            @if (data.invoices_outside_supply_periods.count > 0) {
            <mat-expansion-panel>
              <mat-expansion-panel-header>
                <mat-panel-title>
                  <span class="anomaly-count" [class.zero]="data.invoices_outside_supply_periods.count === 0">{{ data.invoices_outside_supply_periods.count }}</span>
                  Fatture fuori dai periodi di attività (ultimi 12 mesi)
                </mat-panel-title>
              </mat-expansion-panel-header>
              <ul class="anomaly-list">
                @for (a of data.invoices_outside_supply_periods.items; track a.invoice_id + '-' + a.utility_id) {
                  <li (click)="openInvoice(a.invoice_id)">{{ a.number }} del {{ dateIt(a.invoice_date) }} · {{ a.utility_code }}{{ a.period ? ' · ' + a.period : '' }}</li>
                }
              </ul>
            </mat-expansion-panel>
            }
            @if (data.active_utilities_without_chapter.count > 0) {
            <mat-expansion-panel>
              <mat-expansion-panel-header>
                <mat-panel-title>
                  <span class="anomaly-count">{{ data.active_utilities_without_chapter.count }}</span>
                  Utenze attive senza capitolo di spesa
                </mat-panel-title>
              </mat-expansion-panel-header>
              <ul class="anomaly-list">
                @for (u of data.active_utilities_without_chapter.items; track u.id) {
                  <li (click)="openUtility(u.id)">{{ u.utility_id }} · {{ u.type }}{{ u.contracts ? ' · ' + u.contracts : '' }}</li>
                }
              </ul>
            </mat-expansion-panel>
            }
            @if (data.chapters_over_budget.count > 0) {
            <mat-expansion-panel>
              <mat-expansion-panel-header>
                <mat-panel-title>
                  <span class="anomaly-count">{{ data.chapters_over_budget.count }}</span>
                  Capitoli oltre l'assestato dell'anno
                </mat-panel-title>
              </mat-expansion-panel-header>
              <ul class="anomaly-list">
                @for (c of data.chapters_over_budget.items; track c.id) {
                  <li (click)="openChapter(c.id)">{{ c.chapter }} · assestato {{ eur(c.adjusted_budget) }} · impegnato {{ eur(c.committed) }} · fatturato {{ eur(c.invoiced) }}</li>
                }
              </ul>
            </mat-expansion-panel>
            }
            @if (data.chapters_without_budget.count > 0) {
            <mat-expansion-panel>
              <mat-expansion-panel-header>
                <mat-panel-title>
                  <span class="anomaly-count">{{ data.chapters_without_budget.count }}</span>
                  Capitoli usati senza assestato dell'anno
                </mat-panel-title>
              </mat-expansion-panel-header>
              <ul class="anomaly-list">
                @for (c of data.chapters_without_budget.items; track c.id) {
                  <li (click)="openChapter(c.id)">{{ c.chapter }} · {{ c.description }}</li>
                }
              </ul>
            </mat-expansion-panel>
            }
            @if (data.utilities_with_uncommitted_chapter.count > 0) {
            <mat-expansion-panel>
              <mat-expansion-panel-header>
                <mat-panel-title>
                  <span class="anomaly-count" [class.zero]="data.utilities_with_uncommitted_chapter.count === 0">{{ data.utilities_with_uncommitted_chapter.count }}</span>
                  Utenze con capitolo non impegnato sul contratto di fornitura
                </mat-panel-title>
              </mat-expansion-panel-header>
              <ul class="anomaly-list">
                @for (u of data.utilities_with_uncommitted_chapter.items; track u.id) {
                  <li (click)="openUtility(u.id)">{{ u.utility_id }} · capitolo {{ u.chapter }} · {{ u.contracts }}</li>
                }
              </ul>
            </mat-expansion-panel>
            }
            @if (data.invoice_lines_without_utility.count > 0) {
            <mat-expansion-panel>
              <mat-expansion-panel-header>
                <mat-panel-title>
                  <span class="anomaly-count" [class.zero]="data.invoice_lines_without_utility.count === 0">{{ data.invoice_lines_without_utility.count }}</span>
                  Righe fattura senza utenza
                </mat-panel-title>
              </mat-expansion-panel-header>
              <ul class="anomaly-list">
                @for (r of data.invoice_lines_without_utility.items; track $index) {
                  <li (click)="openInvoice(r.invoice_id)">{{ r.number }} · {{ r.supply_code || 'senza codice' }} · {{ eur(r.amount) }}</li>
                }
              </ul>
            </mat-expansion-panel>
            }
            @if (data.invoice_import_stalled.count > 0) {
            <mat-expansion-panel>
              <mat-expansion-panel-header>
                <mat-panel-title>
                  <span class="anomaly-count">{{ data.invoice_import_stalled.count }}</span>
                  Import fatture fermo
                </mat-panel-title>
              </mat-expansion-panel-header>
              <ul class="anomaly-list">
                @for (s of data.invoice_import_stalled.items; track $index) {
                  <li (click)="openInvoiceImport()">
                    Ultimo giro riuscito: {{ s.last_success_at ? dateTimeIt(s.last_success_at) : 'mai' }}{{ s.last_error ? ' · ' + s.last_error : '' }}
                  </li>
                }
              </ul>
            </mat-expansion-panel>
            }
            @if (data.invoice_import_pending.count > 0) {
            <mat-expansion-panel>
              <mat-expansion-panel-header>
                <mat-panel-title>
                  <span class="anomaly-count">{{ data.invoice_import_pending.count }}</span>
                  Fatture PEC in attesa di import
                </mat-panel-title>
              </mat-expansion-panel-header>
              <ul class="anomaly-list plain">
                @for (p of data.invoice_import_pending.items; track p.id) {
                  <li>{{ p.supplier || 'Fornitore' }} · {{ p.number }}{{ p.date ? ' del ' + dateIt(p.date) : '' }}</li>
                }
              </ul>
            </mat-expansion-panel>
            }
            @if (data.invoice_sdi_outcome_discarded.count > 0) {
            <mat-expansion-panel>
              <mat-expansion-panel-header>
                <mat-panel-title>
                  <span class="anomaly-count">{{ data.invoice_sdi_outcome_discarded.count }}</span>
                  Fatture con esito scartato dallo SDI
                </mat-panel-title>
              </mat-expansion-panel-header>
              <ul class="anomaly-list">
                @for (d of data.invoice_sdi_outcome_discarded.items; track d.invoice_id) {
                  <li (click)="openInvoice(d.invoice_id)">{{ d.number }}</li>
                }
              </ul>
            </mat-expansion-panel>
            }
            @if (data.invoice_patterns_unknown.count > 0) {
            <mat-expansion-panel>
              <mat-expansion-panel-header>
                <mat-panel-title>
                  <span class="anomaly-count">{{ data.invoice_patterns_unknown.count }}</span>
                  Fornitori con fatture senza pattern
                </mat-panel-title>
              </mat-expansion-panel-header>
              <ul class="anomaly-list">
                @for (u of data.invoice_patterns_unknown.items; track u.supplier_id) {
                  <li (click)="openPatternEditor(u.message_id)">{{ u.supplier }} · {{ u.count }} {{ u.count === 1 ? 'fattura' : 'fatture' }}</li>
                }
              </ul>
            </mat-expansion-panel>
            }
            @if (data.invoice_import_issues.count > 0) {
            <mat-expansion-panel>
              <mat-expansion-panel-header>
                <mat-panel-title>
                  <span class="anomaly-count">{{ data.invoice_import_issues.count }}</span>
                  Differenze trovate dall'import fatture
                </mat-panel-title>
              </mat-expansion-panel-header>
              <ul class="anomaly-list">
                @for (d of data.invoice_import_issues.items; track $index) {
                  @if (d.type === 'PDF_DATA_MISSING' || d.type === 'READING_DECREASING') {
                    <!-- Il PDF va controllato nell'editor; caso isolato: si silenzia. -->
                    <li (click)="openPatternEditor(d.message_id)">
                      {{ issueLabel(d.type) }} · {{ d.number || 'senza fattura' }} · {{ d.detail }}
                      @if (canEdit) {
                        <button mat-icon-button class="mute-button" matTooltip="Silenzia: dati registrati a mano"
                                aria-label="Silenzia la segnalazione" (click)="$event.stopPropagation(); muteIssue(d.id)">
                          <mat-icon>notifications_off</mat-icon>
                        </button>
                      }
                    </li>
                  } @else {
                    <li (click)="d.utility_id ? openUtility(d.utility_id) : d.invoice_id ? openInvoice(d.invoice_id) : openInvoiceImport()">
                      {{ issueLabel(d.type) }} · {{ d.number || 'senza fattura' }} · {{ d.detail }}
                    </li>
                  }
                }
              </ul>
            </mat-expansion-panel>
            }
            @if (data.plants_without_position.count > 0) {
            <mat-expansion-panel>
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
            }
          </mat-accordion>
        }
      </mat-card-content>
    </mat-card>
  `,
  styles: [`
    .no-anomalies { margin: 0.5rem 0; color: light-dark(#15803d, #86efac); }
    .anomaly-count { display: inline-block; min-width: 2.25rem; text-align: center; margin-right: 0.75rem;
      padding: 1px 8px; border-radius: 10px; background: var(--tone-danger-bg); color: var(--tone-danger-fg); font-weight: 600; }
    .anomaly-count.zero { background: var(--tone-ok-bg); color: var(--tone-ok-fg); }
    .anomaly-list { max-height: 40vh; overflow-y: auto; margin: 0; padding-left: 1.25rem; font-size: 0.875rem; }
    .anomaly-list li { cursor: pointer; padding: 2px 0; }
    .anomaly-list li:hover { text-decoration: underline; }
    .anomaly-list.plain li { cursor: default; }
    .mute-button { width: 28px; height: 28px; padding: 2px; vertical-align: middle; }
    .mute-button mat-icon { font-size: 18px; width: 18px; height: 18px; }
    .anomaly-list.plain li:hover { text-decoration: none; }
  `],
})
export class AnomaliesCardComponent implements OnInit {
  private service = inject(AnomaliesService);
  private router = inject(Router);
  private navigator = inject(EntityNavigatorService);
  private dialog = inject(MatDialog);
  private toast = inject(ToastService);
  private patterns = inject(InvoicePatternsService);
  readonly canEdit = isEditorRole(inject(AuthService).getCurrentUser()?.role);

  data: Anomalies | null = null;

  // Le anomalie a zero non si mostrano: se sono tutte a zero, un messaggio.
  hasAnomalies(): boolean {
    return !!this.data && Object.values(this.data).some(a => a.count > 0);
  }
  readonly fmt = formatDate;
  readonly sinceDays = sinceDays;

  // Tutte le anomalie: la somma a mano dimenticava quelle aggiunte via via.
  get total(): number {
    if (!this.data) return 0;
    return Object.values(this.data).reduce((sum, a) => sum + a.count, 0);
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

  openAsset(id: number): void {
    this.navigator.openAsset(id).subscribe(saved => {
      if (saved) this.load();
    });
  }

  openThirdParty(id: number): void {
    this.navigator.openThirdParty(id).subscribe(saved => {
      if (saved) this.load();
    });
  }

  openAssetFunction(id: number): void {
    this.router.navigate(['/asset-function'], {queryParams: {selectedId: id}});
  }

  openRealEstateContract(id: number): void {
    this.router.navigate(['/utilizer-grant'], {queryParams: {selectedId: id}});
  }

  openInvoice(id: number): void {
    this.navigator.openInvoice(id).subscribe(saved => {
      if (saved) this.load();
    });
  }

  dateTimeIt(iso: string): string {
    return new Date(iso).toLocaleString('it-IT', {dateStyle: 'short', timeStyle: 'short'});
  }

  dateIt(iso: string): string {
    return iso.split('-').reverse().join('/');
  }

  eur(n: number): string {
    return n.toLocaleString('it-IT', {style: 'currency', currency: 'EUR'});
  }

  openChapter(id: number): void {
    this.navigator.openBudgetChapter(id).subscribe(() => this.load());
  }

  issueLabel = importIssueLabel;

  muteIssue(id: number): void {
    this.dialog
      .open(ConfirmDialogComponent, {
        data: {
          title: 'Silenziare la segnalazione?',
          message: 'Non comparirà più per questa fattura, anche se viene rielaborata. Usala quando i dati sono stati registrati a mano.',
          confirmLabel: 'Silenzia',
        },
      })
      .afterClosed()
      .subscribe(ok => {
        if (!ok) return;
        this.patterns.muteIssue(id).subscribe({
          next: () => this.load(),
          error: err => this.toast.add({severity: 'error', summary: 'Errore', detail: err?.error?.message ?? 'Segnalazione non silenziata.'}),
        });
      });
  }

  openPatternEditor(messageId: number): void {
    this.router.navigate(['/invoice-import/editor', messageId]);
  }

  openInvoiceImport(): void {
    this.router.navigate(['/invoice-import']);
  }

  openUtility(id: number): void {
    this.router.navigate(['/utilities'], {queryParams: {selectedId: id}});
  }
}
