import {Component, OnInit} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormBuilder, ReactiveFormsModule} from '@angular/forms';
import {ButtonModule} from 'primeng/button';
import {InputTextModule} from 'primeng/inputtext';
import {DialogModule} from 'primeng/dialog';
import {SelectModule} from 'primeng/select';
import {InputNumberModule} from 'primeng/inputnumber';
import {RadioButtonModule} from 'primeng/radiobutton';
import {DatePickerModule} from 'primeng/datepicker';
import {UtilizerGrantService} from './utilizer-grant.service';
import {AssetService} from '../assets/asset.service';
import {AbstractSearchComponent} from '../../core/components/abstract-search.component';
import {TOption} from '../../core/types/option.interface';
import {UtilizerService} from '../utilizer/utilizer.service';

@Component({
             selector: 'app-search-utilizer-grant',
             standalone: true,
             imports: [
               CommonModule,
               ReactiveFormsModule,
               ButtonModule,
               InputTextModule,
               DialogModule,
               SelectModule,
               InputNumberModule,
               RadioButtonModule,
               DatePickerModule,
             ],
             templateUrl: './search-utilizer-grant.component.html',
           })
export class SearchUtilizerGrantComponent extends AbstractSearchComponent implements OnInit {

  assetOptions: TOption[] = [];
  utilizerOptions: TOption[] = [];

  usageTypeOptions: any;

  constructor(
    private fb: FormBuilder,
    private utilizerGrantService: UtilizerGrantService,
    private assetsService: AssetService,
    private utilizerService: UtilizerService,
  ) {
    super();
    this.usageTypeOptions = utilizerGrantService.usageTypeOptions();
    this.qSearch = this.fb.group(
      {
        qsearch: [''],
        user_name: [''],
        concession_act: [''],
        usage_type: [null],
        utilities_to_be_taken_over: [false],
        grant_date: [null],
        expire_date: [null],
        asset_id_fk: [null],
        utilizer_id_fk: [null],
        deleted: [null],
      });
  }

  override ngOnInit() {
    super.ngOnInit();
    this.loadOptions(this.assetsService, 'id', 'asset_name', {deleted: false})
        .subscribe(
          {
            next: options => this.assetOptions = options,
            error: err => console.error('Errore nel caricamento degli Asset:', err),
          });
    this.loadOptions(this.utilizerService, 'id', 'name', {deleted: false}, 50)
        .subscribe(
          {
            next: options => this.utilizerOptions = options,
            error: err => console.error('Errore nel caricamento degli Utilizzatori:', err),
          });
  }
}


