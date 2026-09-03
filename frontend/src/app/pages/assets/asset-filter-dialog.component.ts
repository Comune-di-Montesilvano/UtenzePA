import {Component, inject, OnInit, ChangeDetectionStrategy} from '@angular/core';
import {FormBuilder, ReactiveFormsModule} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule} from '@angular/material/select';
import {MatRadioModule} from '@angular/material/radio';
import {MatButtonModule} from '@angular/material/button';
import {FilterDialogData} from '../../core/components/abstract-search.component';
import {FilterableSelectComponent} from '../../core/components/filterable-select.component';
import {AssetAggregatorsService} from '../asset-aggregator/asset-aggregator.service';
import {AssetService} from './asset.service';
import {TOption} from '../../core/types/option.interface';

export interface AssetFilterValues {
  asset_name: string | null;
  asset_type_id: number | null;
  category: string | null;
  ownership: number | null;
  toponym: string | null;
  address: string | null;
  civic_number: string | null;
  municipality: string | null;
  zip_code: string | null;
  latitude: string | null;
  longitude: string | null;
  services_and_artifacts: string | null;
  cadastral_value: number | null;
  area_sqm: number | null;
  sheet: string | null;
  parcel: string | null;
  subordinate: string | null;
  associated_building: string | null;
  specific_details: string | null;
  memo: string | null;
}

@Component({
  selector: 'app-asset-filter-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule,
    MatSelectModule, MatRadioModule, MatButtonModule, FilterableSelectComponent
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './asset-filter-dialog.component.html'
})
export class AssetFilterDialogComponent implements OnInit {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<AssetFilterDialogComponent, AssetFilterValues | 'clear'>);
  private assetAggregatorsService = inject(AssetAggregatorsService);
  private assetService = inject(AssetService);
  protected data = inject<FilterDialogData<AssetFilterValues>>(MAT_DIALOG_DATA);

  categoryOptions: TOption[] = this.assetService.categoryOptions();
  toponomyOptions: TOption[] = this.assetService.toponymOptions();

  assetAggregatorOptions: TOption[] = [];

  form = this.fb.group({
    asset_name: [this.data.values.asset_name ?? ''],
    asset_type_id: [this.data.values.asset_type_id ?? null],
    category: [this.data.values.category ?? null],
    ownership: [this.data.values.ownership ?? null],
    toponym: [this.data.values.toponym ?? null],
    address: [this.data.values.address ?? ''],
    civic_number: [this.data.values.civic_number ?? ''],
    municipality: [this.data.values.municipality ?? ''],
    zip_code: [this.data.values.zip_code ?? ''],
    latitude: [this.data.values.latitude ?? ''],
    longitude: [this.data.values.longitude ?? ''],
    services_and_artifacts: [this.data.values.services_and_artifacts ?? ''],
    cadastral_value: [this.data.values.cadastral_value ?? null],
    area_sqm: [this.data.values.area_sqm ?? null],
    sheet: [this.data.values.sheet ?? ''],
    parcel: [this.data.values.parcel ?? ''],
    subordinate: [this.data.values.subordinate ?? ''],
    associated_building: [this.data.values.associated_building ?? ''],
    specific_details: [this.data.values.specific_details ?? ''],
    memo: [this.data.values.memo ?? ''],
  });

  ngOnInit(): void {
    this.assetAggregatorsService.search({deleted: false}).subscribe({
      next: data => {
        // a.code (es. "CASE", "SCUOLE"), non a.description — quest'ultimo è
        // una nota libera facoltativa, vuota per la maggior parte degli
        // aggregati: usarla come label produceva righe visibili ma senza
        // testo nel picker (bug reale, non un problema di stile del
        // componente — vedi FilterableSelectComponent per la stessa label
        // usata correttamente altrove, es. filtro mappa).
        this.assetAggregatorOptions = data
          .map(a => ({label: a.code ?? '', value: a.id}))
          .sort((a, b) => a.label.localeCompare(b.label));
      },
      error: err => console.error('Errore nel caricamento degli Asset Aggregator:', err)
    });
  }

  apply(): void {
    this.dialogRef.close(this.form.getRawValue() as AssetFilterValues);
  }

  clear(): void {
    this.dialogRef.close('clear');
  }
}
