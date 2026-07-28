import {Component, OnInit} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormBuilder, ReactiveFormsModule} from '@angular/forms';
import {ButtonModule} from 'primeng/button';
import {InputTextModule} from 'primeng/inputtext';
import {DialogModule} from 'primeng/dialog';
import {SelectModule} from 'primeng/select';
import {RadioButtonModule} from 'primeng/radiobutton';
import {InputNumberModule} from 'primeng/inputnumber';
import {AssetService} from './asset.service';
import {AssetAggregatorsService} from '../asset-aggregator/asset-aggregator.service';
import {TOption} from '../../core/types/option.interface';
import {AbstractSearchComponent} from '../../core/components/abstract-search.component';
import {LatitudeInputDirective} from '../../core/directives/latitude-input.directive';
import {LongitudeInputDirective} from '../../core/directives/longitude-input.directive';

@Component({
             selector: 'app-search-assets',
             standalone: true,
             imports: [
               CommonModule,
               ReactiveFormsModule,
               ButtonModule,
               InputTextModule,
               DialogModule,
               SelectModule,
               RadioButtonModule,
               InputNumberModule,
               LatitudeInputDirective,
               LongitudeInputDirective
             ],
             templateUrl: './search-assets.component.html',
           })
export class SearchAssetsComponent extends AbstractSearchComponent implements OnInit {

  assetAggregatorOptions: TOption[] = [];

  ownershipOptions = [
    {label: 'Tutti', value: null},
    {label: 'Sì', value: 1},
    {label: 'No', value: 0}
  ];

  categoryOptions: any;

  toponomyOptions: TOption[] = [];

  constructor(
    private fb: FormBuilder,
    private assetAggregatorsService: AssetAggregatorsService,
    private readonly assetService: AssetService
  ) {

    super();

    this.toponomyOptions = this.assetService.toponymOptions();
    this.categoryOptions = this.assetService.categoryOptions();

    this.qSearch = this.fb.group(
      {
        qsearch: [''],
        asset_name: [''],
        asset_type_id: [null],
        category: [null],
        ownership: [null],
        toponym: [null],
        address: [''],
        civic_number: [''],
        municipality: [''],
        zip_code: [''],
        latitude: [''],
        longitude: [''],
        services_and_artifacts: [''],
        cadastral_value: [null],
        area_sqm: [null],
        sheet: [''],
        parcel: [''],
        subordinate: [''],
        associated_building: [''],
        specific_details: [''],
        memo: [''],
        deleted: [null]
      });
  }

  override ngOnInit() {
    super.ngOnInit();
    this.loadOptions(this.assetAggregatorsService, 'id', 'description', {deleted: false})
        .subscribe({
                     next: options => this.assetAggregatorOptions = options,
                   });
  }
}
