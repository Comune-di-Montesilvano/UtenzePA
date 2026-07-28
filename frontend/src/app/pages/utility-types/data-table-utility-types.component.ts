import {Component} from '@angular/core';
import {CommonModule} from '@angular/common';
import {TableModule} from 'primeng/table';
import {DialogModule} from 'primeng/dialog';
import {ButtonModule} from 'primeng/button';
import {ReactiveFormsModule, Validators} from '@angular/forms';
import {SelectModule} from 'primeng/select';
import {MultiSelectModule} from 'primeng/multiselect';
import {HasRoleDirective} from '../../core/directives/has-role.directive';
import {ReadOnlyDirective} from '../../core/directives/read-only.directive';
import {ScreenSizeService} from '../../services/screen-size.service';
import {TooltipModule} from 'primeng/tooltip';
import {InputText} from 'primeng/inputtext';
import {UtilityType} from './entity/utility-type.entity';
import {AbstractDataTableComponent} from '../../core/components/abstract-data-table.component';
import {SkeletonModule} from 'primeng/skeleton';
import {HardType, HardTypeDescription, HardTypeOptions} from './enum/hard-type.enum';
import {PurposeService} from '../purpose/purpose.service';
import {Purpose} from '../purpose/entity/purpose.entity';
import {UseType} from '../purpose/enum/use-type.enum';

@Component({
             selector: 'app-data-table-utility-types',
             standalone: true,
             imports: [
               ReactiveFormsModule,
               CommonModule,
               TableModule,
               DialogModule,
               ButtonModule,
               SelectModule,
               MultiSelectModule,
               HasRoleDirective,
               ReadOnlyDirective,
               TooltipModule,
               InputText,
               SkeletonModule,
             ],
             templateUrl: './data-table-utility-types.component.html'
           })
export class DataTableUtilityTypesComponent extends AbstractDataTableComponent<UtilityType> {

  readonly skeletonRows = Array(10).fill({});
  readonly skeletonCols = Array.from({length: 5}, (_, i) => i);

  hardTypeDescription = HardTypeDescription;
  hardTypeOptions = HardTypeOptions;

  genericPurposes: Purpose[] = [];
  specificPurposes: Purpose[] = [];

  constructor(screen: ScreenSizeService, private purposeService: PurposeService) {
    super(screen);
  }

  override ngOnInit() {
    super.ngOnInit();
    this.loadPurposes();
  }

  loadPurposes() {
    this.purposeService.search({deleted: false}).subscribe(purposes => {
      this.genericPurposes = purposes.filter(p => p.use_type === UseType.GENERIC);
      this.specificPurposes = purposes.filter(p => p.use_type === UseType.SPECIFIC);
    });
  }

  getHardTypeDescription(value: any): string {
    return this.hardTypeDescription[value as HardType] || value;
  }

  override itemInstance(): UtilityType {
    return UtilityType.create();
  }

  protected override buildForm(data?: Partial<UtilityType>): void {
    const purposes = data?.purposes ?? [];
    this.form = this.fb.group({
      name:                 [data?.name        ?? '', Validators.required],
      hard_type:            [data?.hard_type   ?? null, Validators.required],
      description:          [data?.description ?? ''],
      generic_purpose_ids:  [purposes.filter(p => p.use_type === UseType.GENERIC).map(p => p.id)],
      specific_purpose_ids: [purposes.filter(p => p.use_type === UseType.SPECIFIC).map(p => p.id)],
    });
  }

  protected override prepareFormValue(): Record<string, any> {
    const {generic_purpose_ids, specific_purpose_ids, ...rest} = this.form.value;
    return rest;
  }

  protected override enrichItem(): void {
    const {generic_purpose_ids, specific_purpose_ids} = this.form.value;
    const allIds = [...(generic_purpose_ids ?? []), ...(specific_purpose_ids ?? [])];
    this.selectedItem!.purposes = allIds.map(id =>
      [...this.genericPurposes, ...this.specificPurposes].find(p => p.id === id) as Purpose
    );
  }

  override isFormValid(): boolean {
    return this.form?.valid ?? false;
  }
}
