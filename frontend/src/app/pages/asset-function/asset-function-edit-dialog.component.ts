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
import {ICON_OPTIONS, ICON_FALLBACK} from '../../core/helpers/material-icons';
import {IconPickerDialogComponent} from '../../core/components/icon-picker-dialog.component';
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
  iconFallback = ICON_FALLBACK;
  filteredIconOptions = ICON_OPTIONS;

  form = this.fb.group({
    name: [this.data.item.name ?? '', Validators.required],
    icon: [this.data.item.icon ?? ICON_FALLBACK],
  });

  constructor() {
    this.form.controls.icon.valueChanges.subscribe((term) => {
      const t = (term ?? '').trim().toLowerCase();
      this.filteredIconOptions = t
        ? ICON_OPTIONS.filter((o) => o.value.includes(t) || o.label.toLowerCase().includes(t))
        : ICON_OPTIONS;
    });
    const role = this.authService.getCurrentUser()?.role;
    if (!role || role === 'Lettore') this.form.disable();
  }

  // Autocomplete limitato ai suggerimenti curati: per cercare su tutto il
  // catalogo Material Icons apre il picker condiviso con le nature.
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
