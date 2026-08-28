import {Component, inject, OnInit, ChangeDetectionStrategy} from '@angular/core';
import {FormBuilder, ReactiveFormsModule, Validators} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule} from '@angular/material/select';
import {MatButtonModule} from '@angular/material/button';
import {MatTabsModule} from '@angular/material/tabs';
import {MatTooltipModule} from '@angular/material/tooltip';
import {MatIconModule} from '@angular/material/icon';
import {plainToInstance} from 'class-transformer';
import {EditDialogData} from '../../core/components/abstract-data-table.component';
import {Asset} from './entity/asset.entity';
import {AuthService} from '../../services/auth.service';
import {HasRoleDirective} from '../../core/directives/has-role.directive';
import {ReadOnlyDirective} from '../../core/directives/read-only.directive';
import {OnlyNumbersDirective} from '../../core/directives/only-numbers.directive';
import {LatitudeInputDirective} from '../../core/directives/latitude-input.directive';
import {LongitudeInputDirective} from '../../core/directives/longitude-input.directive';
import {AssetAggregatorsService} from '../asset-aggregator/asset-aggregator.service';
import {AssetAggregator} from '../asset-aggregator/entity/asset-aggregator.entity';
import {AssetService} from './asset.service';
import {TOption} from '../../core/types/option.interface';
import {HardType} from '../utility-types/enum/hard-type.enum';
import {Utility} from '../utilities/entity/utility.entity';
import {TruncatePipe} from '../../core/pipes/truncate.pipe';
import {FormatAmountPipe} from '../../core/pipes/format-amount.pipe';
import {DatePipe} from '@angular/common';

@Component({
  selector: 'app-asset-edit-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatTabsModule,
    MatTooltipModule,
    MatIconModule,
    HasRoleDirective,
    ReadOnlyDirective,
    OnlyNumbersDirective,
    LatitudeInputDirective,
    LongitudeInputDirective,
    TruncatePipe,
    FormatAmountPipe,
    DatePipe,
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './asset-edit-dialog.component.html'
})
export class AssetEditDialogComponent implements OnInit {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<AssetEditDialogComponent, Asset | undefined>);
  private authService = inject(AuthService);
  private assetAggregatorsService = inject(AssetAggregatorsService);
  private assetService = inject(AssetService);
  protected data = inject<EditDialogData<Asset>>(MAT_DIALOG_DATA);

  isNew = this.data.mode === 'create';
  maxDescLength = 50;

  assetAggregatorOptions: AssetAggregator[] = [];
  categoryOptions: TOption[] = this.assetService.categoryOptions();
  toponomyOptions: TOption[] = this.assetService.toponymOptions();
  ownershipOptions: TOption[] = [
    {label: 'Sì', value: 1},
    {label: 'No', value: 0}
  ];
  tabs = HardType.items();

  form = this.fb.group({
    asset_name: [this.data.item.asset_name ?? '', Validators.required],
    asset_type_id: [
      this.data.item.assetAggregator != null ? (this.data.item.asset_type_id ?? null) : null,
      Validators.required
    ],
    category: [this.data.item.category ?? null],
    ownership: [this.data.item.ownership ?? 0],
    toponym: [this.data.item.toponym ?? null],
    address: [this.data.item.address ?? null],
    civic_number: [this.data.item.civic_number ?? null],
    municipality: [this.data.item.municipality ?? null],
    zip_code: [this.data.item.zip_code ?? null],
    services_and_artifacts: [this.data.item.services_and_artifacts ?? null],
    latitude: [this.data.item.latitude ?? null],
    longitude: [this.data.item.longitude ?? null],
    cadastral_value: [this.data.item.cadastral_value ?? null],
    sheet: [this.data.item.sheet ?? null],
    parcel: [this.data.item.parcel ?? null],
    subordinate: [this.data.item.subordinate ?? null],
    area_sqm: [this.data.item.area_sqm ?? null],
    associated_building: [this.data.item.associated_building ?? null],
    specific_details: [this.data.item.specific_details ?? null],
    memo: [this.data.item.memo ?? null],
  });

  constructor() {
    const role = this.authService.getCurrentUser()?.role;
    if (!role || role === 'Lettore') {
      this.form.disable();
    }
  }

  ngOnInit(): void {
    this.assetAggregatorsService.search({deleted: false}).subscribe({
      next: data => this.assetAggregatorOptions = data,
      error: err => console.error('Errore nel caricamento degli Asset Aggregator:', err)
    });
  }

  getUtilitiesByHardType(hardType: HardType): Utility[] {
    return this.data.item.utilities?.filter(u => u.utilityType?.hard_type === hardType) ?? [];
  }

  getUtilityCountByType(hardType: HardType): number {
    return this.getUtilitiesByHardType(hardType).length;
  }

  openUtilityDetail(utility: Utility): void {
    window.open(`/utilities?selectedId=${utility.id}`, '_blank');
  }

  save(): void {
    if (!this.form.valid) return;
    const result = plainToInstance(Asset, {
      id: this.data.item.id,
      ...this.form.getRawValue()
    });
    this.dialogRef.close(result);
  }

  cancel(): void {
    this.dialogRef.close(undefined);
  }
}
