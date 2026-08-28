import {Component, inject, OnInit, ChangeDetectionStrategy} from '@angular/core';
import {FormBuilder, ReactiveFormsModule, Validators} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatButtonModule} from '@angular/material/button';
import {MatDatepickerModule} from '@angular/material/datepicker';
import {MatCheckboxModule} from '@angular/material/checkbox';
import {plainToInstance} from 'class-transformer';
import {EditDialogData} from '../../core/components/abstract-data-table.component';
import {UtilizerGrant} from './entity/utilizer-grant.entity';
import {AuthService} from '../../services/auth.service';
import {HasRoleDirective} from '../../core/directives/has-role.directive';
import {ReadOnlyDirective} from '../../core/directives/read-only.directive';
import {FilterableSelectComponent} from '../../core/components/filterable-select.component';
import {AssetService} from '../assets/asset.service';
import {UtilizerService} from '../utilizer/utilizer.service';
import {TOption} from '../../core/types/option.interface';
import {StringHelper} from '../../core/helpers/string.helper';

@Component({
  selector: 'app-utilizer-grant-edit-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatDatepickerModule,
    MatCheckboxModule,
    HasRoleDirective,
    ReadOnlyDirective,
    FilterableSelectComponent
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './utilizer-grant-edit-dialog.component.html'
})
export class UtilizerGrantEditDialogComponent implements OnInit {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<UtilizerGrantEditDialogComponent, UtilizerGrant | undefined>);
  private authService = inject(AuthService);
  private assetService = inject(AssetService);
  private utilizerService = inject(UtilizerService);
  protected data = inject<EditDialogData<UtilizerGrant>>(MAT_DIALOG_DATA);

  isNew = this.data.mode === 'create';
  assetOptions: TOption[] = [];
  utilizerOptions: TOption[] = [];

  form = this.fb.group({
    asset_id_fk: [this.data.item.asset_id_fk ?? null, Validators.required],
    utilizer_id_fk: [this.data.item.utilizer_id_fk ?? null, Validators.required],
    usage_type: [this.data.item.usage_type ?? ''],
    grant_date: [this.data.item.grant_date ?? null],
    expire_date: [this.data.item.expire_date ?? null],
    concession_act: [this.data.item.concession_act ?? ''],
    utilities_to_be_taken_over: [this.data.item.utilities_to_be_taken_over ?? false],
  });

  constructor() {
    // ReadOnlyDirective sul <form> nel template imposta solo pointer-events:none,
    // bypassabile da tastiera/screen reader. Qui disabilitiamo esplicitamente il
    // FormGroup per il ruolo Lettore, cosi' i controlli sono anche
    // programmaticamente non modificabili e save() non puo' inviare dati
    // (gate di autorizzazione lato client per il ruolo Lettore).
    const role = this.authService.getCurrentUser()?.role;
    if (!role || role === 'Lettore') {
      this.form.disable();
    }
  }

  ngOnInit(): void {
    this.assetService.search({deleted: false}).subscribe({
      next: (data) => {
        this.assetOptions = data
          .map(a => ({label: a.asset_name, value: a.id}))
          .sort((a, b) => a.label.localeCompare(b.label));
      },
      error: (err) => console.error('Errore nel caricamento degli Asset:', err),
    });

    this.utilizerService.search({deleted: false}).subscribe({
      next: (data) => {
        this.utilizerOptions = data
          .map(u => ({label: StringHelper.truncateAt(u.name, 100), value: u.id}))
          .sort((a, b) => a.label.localeCompare(b.label));
      },
      error: (err) => console.error('Errore nel caricamento degli Utilizzatori:', err),
    });
  }

  save(): void {
    if (!this.form.valid) return;
    const result = plainToInstance(UtilizerGrant, {
      id: this.data.item.id,
      ...this.form.getRawValue()
    });
    this.dialogRef.close(result);
  }

  cancel(): void {
    this.dialogRef.close(undefined);
  }
}
