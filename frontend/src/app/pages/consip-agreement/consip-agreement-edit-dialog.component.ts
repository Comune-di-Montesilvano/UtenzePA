import {Component, inject, OnInit} from '@angular/core';
import {FormBuilder, ReactiveFormsModule, Validators} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule} from '@angular/material/select';
import {MatButtonModule} from '@angular/material/button';
import {MatDatepickerModule} from '@angular/material/datepicker';
import {plainToInstance} from 'class-transformer';
import {EditDialogData} from '../../core/components/abstract-data-table.component';
import {ConsipAgreement} from './entity/consip-agreement.entity';
import {AuthService} from '../../services/auth.service';
import {HasRoleDirective} from '../../core/directives/has-role.directive';
import {ReadOnlyDirective} from '../../core/directives/read-only.directive';
import {FilterableSelectComponent} from '../../core/components/filterable-select.component';
import {SuppliersService} from '../suppliers/suppliers.service';
import {TOption} from '../../core/types/option.interface';

@Component({
  selector: 'app-consip-agreement-edit-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatDatepickerModule,
    HasRoleDirective,
    ReadOnlyDirective,
    FilterableSelectComponent
  ],
  templateUrl: './consip-agreement-edit-dialog.component.html'
})
export class ConsipAgreementEditDialogComponent implements OnInit {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<ConsipAgreementEditDialogComponent, ConsipAgreement | undefined>);
  private authService = inject(AuthService);
  private supplierService = inject(SuppliersService);
  protected data = inject<EditDialogData<ConsipAgreement>>(MAT_DIALOG_DATA);

  isNew = this.data.mode === 'create';
  supplierOptions: TOption[] = [];

  safeguardOptions: { label: string; value: boolean }[] = [
    {label: 'Sì', value: true},
    {label: 'No', value: false},
  ];

  form = this.fb.group({
    name: [this.data.item.name ?? '', Validators.required],
    cig_master: [this.data.item.cig_master ?? '', [Validators.required, Validators.maxLength(10)]],
    expiration_date: [this.data.item.expiration_date ?? null, Validators.required],
    safeguard: [this.normalizeSafeguard(this.data.item.safeguard)],
    description: [this.data.item.description ?? ''],
    supplier_id: [this.data.item.supplier_id ?? null, Validators.required],
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
    this.supplierService.search({deleted: false}).subscribe({
      next: (data) => {
        this.supplierOptions = data
          .map(s => ({label: s.company_name, value: s.id}))
          .sort((a, b) => a.label.localeCompare(b.label));
      },
      error: (err) => console.error('Errore nel caricamento dei fornitori:', err),
    });
  }

  // Il campo backend `safeguard` è una colonna tinyint (0/1), non booleana in
  // senso stretto (vedi backend/src/apis/consip-agreement/entity/consip-agreement.entity.ts:32).
  // `ConsipAgreement.create()` inizializza safeguard a 0 per i nuovi elementi
  // (non a null): la normalizzazione mappa esplicitamente 0/1 -> false/true,
  // preservando il comportamento del vecchio select PrimeNG (che mostrava "No"
  // selezionato di default sui nuovi elementi), e mappa solo null/undefined
  // reali a "nessuna selezione".
  private normalizeSafeguard(value: unknown): boolean | null {
    if (value === true || value === 1) return true;
    if (value === false || value === 0) return false;
    return null;
  }

  save(): void {
    if (!this.form.valid) return;
    const raw = this.form.getRawValue();
    const result = plainToInstance(ConsipAgreement, {
      id: this.data.item.id,
      ...raw,
      // Il DTO backend valida `safeguard` con @IsIn([0, 1]) (numero, non
      // booleano) — va riconvertito esplicitamente prima dell'invio, vedi
      // backend/src/apis/consip-agreement/dto/create-consip-agreement.dto.ts:34-35.
      safeguard: raw.safeguard === true ? 1 : raw.safeguard === false ? 0 : null,
    });
    this.dialogRef.close(result);
  }

  cancel(): void {
    this.dialogRef.close(undefined);
  }
}
