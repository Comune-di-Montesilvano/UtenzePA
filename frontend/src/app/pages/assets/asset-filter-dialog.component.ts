import {Component, inject, OnInit} from '@angular/core';
import {FormBuilder, FormControl, ReactiveFormsModule} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule} from '@angular/material/select';
import {MatAutocompleteModule} from '@angular/material/autocomplete';
import {MatRadioModule} from '@angular/material/radio';
import {MatButtonModule} from '@angular/material/button';
import {FilterDialogData} from '../../core/components/abstract-search.component';
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
    MatSelectModule, MatAutocompleteModule, MatRadioModule, MatButtonModule
  ],
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
  filteredAssetAggregatorOptions: TOption[] = [];
  assetTypeFilterCtrl = new FormControl<string>('');

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
        this.assetAggregatorOptions = data
          .map(a => ({label: a.description ?? '', value: a.id}))
          .sort((a, b) => a.label.localeCompare(b.label));
        this.filteredAssetAggregatorOptions = this.assetAggregatorOptions;
        this.assetTypeFilterCtrl.setValue(this.displayAssetType(this.form.value.asset_type_id ?? null), {emitEvent: false});
      },
      error: err => console.error('Errore nel caricamento degli Asset Aggregator:', err)
    });

    this.assetTypeFilterCtrl.valueChanges.subscribe(term => {
      const t = (typeof term === 'string' ? term : '').toLowerCase();
      this.filteredAssetAggregatorOptions = this.assetAggregatorOptions.filter(o => o.label.toLowerCase().includes(t));
    });
  }

  displayAssetType = (value: number | null): string =>
    this.assetAggregatorOptions.find(o => o.value === value)?.label ?? '';

  onAssetTypeSelected(value: number | string | boolean): void {
    this.form.patchValue({asset_type_id: Number(value)});
  }

  apply(): void {
    this.dialogRef.close(this.form.getRawValue() as AssetFilterValues);
  }

  clear(): void {
    this.dialogRef.close('clear');
  }
}
