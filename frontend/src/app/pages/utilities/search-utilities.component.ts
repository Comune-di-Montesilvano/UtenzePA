import {Component, Type} from '@angular/core';
import {FormBuilder, ReactiveFormsModule} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {AbstractSearchComponent} from '../../core/components/abstract-search.component';
import {UtilityFilterDialogComponent} from './utility-filter-dialog.component';

@Component({
  selector: 'app-search-utilities',
  standalone: true,
  imports: [ReactiveFormsModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule],
  templateUrl: './search-utilities.component.html'
})
export class SearchUtilitiesComponent extends AbstractSearchComponent {

  constructor(private fb: FormBuilder) {
    super();
    // 39 campi filtro reali + qsearch = 40 controlli totali. Rimossi rispetto all'originale i 6
    // FormControl dead mai renderizzati nel template PrimeNG (supply_expiry_date, deleted,
    // water_concession, supply_start_date, management_expiry_date, takeover_termination_date) —
    // sostituiti dalle rispettive varianti "_range", le uniche effettivamente esposte nel dialog
    // filtri (vedi Global Constraints, punto 3).
    this.qSearch = this.fb.group({
      qsearch: [''],
      utility_id: [''],
      meter_number: [''],
      supply_active: [null],
      utility_type_id_fk: [null],
      asset_id_fk: [null],
      supplier_id_fk: [null],
      meter_removed: [null],
      utilityState: [null],
      costs_borne_by_id_fk: [null],
      utility_code: [''],
      aggregator_id_fk: [null],
      supplier_address: [''],
      meter_usage_type: [''],
      consip_order: [''],
      safeguard: [null],
      wbs_gas_element: [''],
      disconnection_ability: [''],
      maintenance_management_id_fk: [null],
      budget_chapter_code_fk: [null],
      power_kw_electric: [''],
      voltage_kw_electric: [''],
      estimated_annual_consumption: [''],
      reported_consumption_year: [''],
      security_deposit: [''],
      phase_type_electric: [null],
      meter_verified: [null],
      specifications: [''],
      notes: [''],
      additional_notes: [''],
      latitude: [''],
      longitude: [''],
      user_id_fk: [null],
      supply_start_date_range: [null],
      supply_expiry_date_range: [null],
      management_expiry_date_range: [null],
      takeover_termination_date_range: [null],
      water_concession_range: [null],
      cig_contract: [''],
      order_number: ['']
    });
  }

  override filterDialogComponent(): Type<unknown> {
    return UtilityFilterDialogComponent;
  }

  override filterDialogWidth(): string {
    return '1200px';
  }
}
