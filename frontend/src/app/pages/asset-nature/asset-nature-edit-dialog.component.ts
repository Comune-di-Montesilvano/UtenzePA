import {ChangeDetectionStrategy, Component, inject, OnInit} from '@angular/core';
import {FormBuilder, ReactiveFormsModule, Validators} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatAutocompleteModule} from '@angular/material/autocomplete';
import {MatIconModule} from '@angular/material/icon';
import {MatButtonModule} from '@angular/material/button';
import {MatTooltipModule} from '@angular/material/tooltip';
import {plainToInstance} from 'class-transformer';
import {EditDialogData} from '../../core/components/abstract-data-table.component';
import {AuthService} from '../../services/auth.service';
import {HasRoleDirective} from '../../core/directives/has-role.directive';
import {ReadOnlyDirective} from '../../core/directives/read-only.directive';
import {MultiSelectComponent} from '../../core/components/multi-select.component';
import {TOption} from '../../core/types/option.interface';
import {AssetAggregatorIconOptions, ASSET_AGGREGATOR_ICON_FALLBACK} from '../asset-aggregator/enum/asset-aggregator-icon.enum';
import {IconPickerDialogComponent} from '../asset-aggregator/icon-picker-dialog.component';
import {AssetFunctionsService} from '../asset-function/asset-function.service';
import {AssetNature} from './entity/asset-nature.entity';

@Component({
  selector: 'app-asset-nature-edit-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatAutocompleteModule,
    MatIconModule, MatButtonModule, MatTooltipModule, HasRoleDirective, ReadOnlyDirective, MultiSelectComponent
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './asset-nature-edit-dialog.component.html'
})
export class AssetNatureEditDialogComponent implements OnInit {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<AssetNatureEditDialogComponent, AssetNature | undefined>);
  private dialog = inject(MatDialog);
  private authService = inject(AuthService);
  private functionsService = inject(AssetFunctionsService);
  protected data = inject<EditDialogData<AssetNature>>(MAT_DIALOG_DATA);

  isNew = this.data.mode === 'create';
  iconFallback = ASSET_AGGREGATOR_ICON_FALLBACK;
  filteredIconOptions = AssetAggregatorIconOptions;
  functionOptions: TOption[] = [];

  form = this.fb.group({
    name: [this.data.item.name ?? '', Validators.required],
    icon: [this.data.item.icon ?? ASSET_AGGREGATOR_ICON_FALLBACK],
    function_ids: [(this.data.item.functions ?? []).map(f => f.id)],
  });

  constructor() {
    this.form.controls.icon.valueChanges.subscribe((term) => {
      const t = (term ?? '').trim().toLowerCase();
      this.filteredIconOptions = t
        ? AssetAggregatorIconOptions.filter((o) => o.value.includes(t) || o.label.toLowerCase().includes(t))
        : AssetAggregatorIconOptions;
    });
    const role = this.authService.getCurrentUser()?.role;
    if (!role || role === 'Lettore') this.form.disable();
  }

  ngOnInit(): void {
    this.functionsService.search({deleted: false} as never).subscribe({
      next: data => this.functionOptions = data.map(f => ({label: f.name, value: f.id, icon: f.icon ?? undefined})),
      error: err => console.error('Errore nel caricamento delle funzioni immobile:', err)
    });
  }

  openIconPicker(): void {
    this.dialog
      .open(IconPickerDialogComponent, {width: '480px', data: {currentIcon: this.form.controls.icon.value}})
      .afterClosed()
      .subscribe((result?: string) => {
        if (result) this.form.controls.icon.setValue(result);
      });
  }

  save(): void {
    if (!this.form.valid) return;
    this.dialogRef.close(plainToInstance(AssetNature, {id: this.data.item.id, ...this.form.getRawValue()}));
  }

  cancel(): void {
    this.dialogRef.close(undefined);
  }
}
