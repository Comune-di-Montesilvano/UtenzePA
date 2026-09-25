import {ChangeDetectionStrategy, Component, inject} from '@angular/core';
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
import {AssetAggregatorIconOptions, ASSET_AGGREGATOR_ICON_FALLBACK} from '../asset-aggregator/enum/asset-aggregator-icon.enum';
import {IconPickerDialogComponent} from '../asset-aggregator/icon-picker-dialog.component';
import {AssetFunction} from './entity/asset-function.entity';

@Component({
  selector: 'app-asset-function-edit-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatAutocompleteModule,
    MatIconModule, MatButtonModule, MatTooltipModule, HasRoleDirective, ReadOnlyDirective
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './asset-function-edit-dialog.component.html'
})
export class AssetFunctionEditDialogComponent {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<AssetFunctionEditDialogComponent, AssetFunction | undefined>);
  private dialog = inject(MatDialog);
  private authService = inject(AuthService);
  protected data = inject<EditDialogData<AssetFunction>>(MAT_DIALOG_DATA);

  isNew = this.data.mode === 'create';
  iconFallback = ASSET_AGGREGATOR_ICON_FALLBACK;
  filteredIconOptions = AssetAggregatorIconOptions;

  form = this.fb.group({
    name: [this.data.item.name ?? '', Validators.required],
    icon: [this.data.item.icon ?? ASSET_AGGREGATOR_ICON_FALLBACK],
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

  // Autocomplete limitato ai suggerimenti curati: per cercare su tutto il
  // catalogo Material Icons apre il picker condiviso con gli aggregati.
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
    this.dialogRef.close(plainToInstance(AssetFunction, {id: this.data.item.id, ...this.form.getRawValue()}));
  }

  cancel(): void {
    this.dialogRef.close(undefined);
  }
}
