import {Component} from '@angular/core';
import {CommonModule} from '@angular/common';
import {TableModule} from 'primeng/table';
import {DialogModule} from 'primeng/dialog';
import {ButtonModule} from 'primeng/button';
import {ReactiveFormsModule, Validators} from '@angular/forms';
import {SelectModule} from 'primeng/select';
import {HasRoleDirective} from '../../core/directives/has-role.directive';
import {InputTextModule} from 'primeng/inputtext';
import {InputNumberModule} from 'primeng/inputnumber';
import {CheckboxModule} from 'primeng/checkbox';
import {DatePickerModule} from 'primeng/datepicker';
import {TooltipModule} from 'primeng/tooltip';
import {ReadOnlyDirective} from '../../core/directives/read-only.directive';
import {Textarea} from 'primeng/textarea';
import {AbstractDataTableComponent} from '../../core/components/abstract-data-table.component';
import {SkeletonModule} from 'primeng/skeleton';
import {UtilizerGrant} from './entity/utilizer-grant.entity';
import {UtilizerGrantService} from './utilizer-grant.service';
import {AssetService} from '../assets/asset.service';
import {ScreenSizeService} from '../../services/screen-size.service';
import {DateHelper} from '../../core/helpers/date.helper';
import {TOption} from '../../core/types/option.interface';
import {UtilizerService} from '../utilizer/utilizer.service';
import {StringHelper} from '../../core/helpers/string.helper';

interface AssetOption {
  asset_id: number;
  asset_name: string;
}

@Component({
             selector: 'app-data-table-utilizer-grant',
             standalone: true,
             imports: [
               ReactiveFormsModule,
               CommonModule,
               TableModule,
               DialogModule,
               ButtonModule,
               SelectModule,
               HasRoleDirective,
               InputTextModule,
               InputNumberModule,
               CheckboxModule,
               DatePickerModule,
               TooltipModule,
               ReadOnlyDirective,
               Textarea,
               SkeletonModule,
             ],
             templateUrl: './data-table-utilizer-grant.component.html',
           })
export class DataTableUtilizerGrantComponent extends AbstractDataTableComponent<UtilizerGrant> {

  readonly skeletonRows = Array(10).fill({});
  readonly skeletonCols = Array.from({length: 9}, (_, i) => i);

  maxDescLength = 50;
  assetOptions: TOption[] = [];
  utilizerOptions: TOption[] = [];
  usageTypeOptions: any;

  constructor(
    screen: ScreenSizeService,
    private utilizerGrantService: UtilizerGrantService,
    private utilizerService: UtilizerService,
    private assetsService: AssetService,
  ) {
    super(screen);
    this.usageTypeOptions = utilizerGrantService.usageTypeOptions();
  }

  override ngOnInit() {
    super.ngOnInit();
    this.loadAssetOptions();
  }

  override itemInstance(): UtilizerGrant {
    return UtilizerGrant.create();
  }

  protected override buildForm(data?: Partial<UtilizerGrant>): void {
    const toDate = (v: any) => v ? new Date(DateHelper.isoToLocalDate(v) ?? v) : null;
    this.form = this.fb.group(
      {
        asset_id_fk: [data?.asset_id_fk ?? null, Validators.required],
        utilizer_id_fk: [data?.utilizer_id_fk ?? null, Validators.required],
        usage_type: [data?.usage_type ?? ''],
        grant_date: [toDate(data?.grant_date)],
        expire_date: [toDate(data?.expire_date)],
        concession_act: [data?.concession_act ?? ''],
        utilities_to_be_taken_over: [data?.utilities_to_be_taken_over ?? false],
      });
  }

  override isFormValid(): boolean {
    return this.form?.valid ?? false;
  }

  loadAssetOptions() {
    this.assetsService.search({deleted: false}).subscribe(
      {
        next: (data) => {
          this.assetOptions = data
            .map(asset => ({
              value: asset.id,
              label: asset.asset_name
            }))
            .sort((a, b) => (a.label ?? '').localeCompare(b.label ?? ''));
        },
        error: (err) => console.error('Errore nel caricamento degli Asset:', err),
      });

    this.utilizerService.search({deleted: false}).subscribe(
      {
        next: (data) => {
          this.utilizerOptions = data
            .map(item => ({value: item.id, label: StringHelper.truncateAt(item.name, 100)}))
            .sort((a, b) => (a.label ?? '').localeCompare(b.label ?? ''));
        },
        error: (err) => console.error('Errore nel caricamento degli Utilizzatori:', err),
      })
  }
}
