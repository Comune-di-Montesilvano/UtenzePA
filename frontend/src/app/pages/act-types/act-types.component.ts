import {ChangeDetectionStrategy, Component, inject, OnInit} from '@angular/core';
import {FormBuilder, ReactiveFormsModule, Validators} from '@angular/forms';
import {HttpErrorResponse} from '@angular/common/http';
import {MatDialog} from '@angular/material/dialog';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatTooltipModule} from '@angular/material/tooltip';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {HasRoleDirective} from '../../core/directives/has-role.directive';
import {ConfirmDialogComponent, ConfirmDialogData} from '../../core/components/confirm-dialog.component';
import {ToastService} from '../../core/services/toast.service';
import {ActService} from '../acts/act.service';
import {ActType} from '../acts/act.model';

// Tipi di atto (delibera, determina…): anagrafica gestita dagli Admin.
@Component({
  selector: 'app-act-types',
  standalone: true,
  imports: [ReactiveFormsModule, MatButtonModule, MatIconModule, MatTooltipModule, MatFormFieldModule, MatInputModule,
    HasRoleDirective],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <div style="padding: 1rem; max-width: 900px;">
      <h1>Tipi di atto</h1>
      <p class="list-subtitle">Tipi proposti quando si registra un atto (menu Atti). Un tipo usato da un atto non si può eliminare.</p>

      @if (!editing) {
        <button mat-stroked-button type="button" (click)="startEdit()" [appHasRole]="['Admin']">
          <mat-icon>add</mat-icon> Nuovo tipo
        </button>
      } @else {
        <form [formGroup]="form" (ngSubmit)="save()"
              style="border: 1px solid var(--app-border); border-radius: 6px; padding: 1rem; display: flex; flex-wrap: wrap; gap: 1rem; align-items: center;">
          <mat-form-field style="flex: 2 1 300px;">
            <mat-label>Nome</mat-label>
            <input matInput formControlName="name" maxlength="150">
            <mat-error>Obbligatorio</mat-error>
          </mat-form-field>
          <mat-form-field style="flex: 1 1 120px;">
            <mat-label>Ordine</mat-label>
            <input matInput type="number" min="0" step="1" formControlName="sort_order">
          </mat-form-field>
          <div style="display: flex; gap: 0.5rem;">
            <button mat-stroked-button type="button" (click)="cancel()">Annulla</button>
            <button mat-flat-button type="submit" [disabled]="saving">Salva</button>
          </div>
          @if (error) {
            <p style="color: var(--app-error); margin: 0; flex-basis: 100%;">{{ error }}</p>
          }
        </form>
      }

      <table style="width: 100%; border-collapse: collapse; margin-top: 1rem; font-size: 0.875rem;">
        <thead>
          <tr style="text-align: left; border-bottom: 1px solid var(--app-border);">
            <th style="padding: 6px;">Nome</th>
            <th style="padding: 6px; width: 100px;">Ordine</th>
            <th style="padding: 6px; width: 110px;"></th>
          </tr>
        </thead>
        <tbody>
          @for (t of types; track t.id) {
            <tr style="border-bottom: 1px solid var(--app-surface-2);">
              <td style="padding: 6px;">{{ t.name }}</td>
              <td style="padding: 6px;">{{ t.sort_order }}</td>
              <td style="padding: 6px; text-align: right; white-space: nowrap;">
                <button mat-icon-button type="button" (click)="startEdit(t)" matTooltip="Modifica" aria-label="Modifica" [appHasRole]="['Admin']"><mat-icon>edit</mat-icon></button>
                <button mat-icon-button type="button" (click)="remove(t)" matTooltip="Elimina" aria-label="Elimina" [appHasRole]="['Admin']"><mat-icon>delete</mat-icon></button>
              </td>
            </tr>
          } @empty {
            <tr><td colspan="3" style="padding: 1rem; color: var(--app-muted);">Nessun tipo di atto.</td></tr>
          }
        </tbody>
      </table>
    </div>
  `,
})
export class ActTypesComponent implements OnInit {
  private fb = inject(FormBuilder);
  private service = inject(ActService);
  private dialog = inject(MatDialog);
  private toast = inject(ToastService);

  types: ActType[] = [];
  editing = false;
  saving = false;
  error: string | null = null;
  private editingId: number | null = null;

  form = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(150)]],
    sort_order: [0 as number | null],
  });

  ngOnInit(): void {
    this.reload();
  }

  reload(): void {
    this.service.types().subscribe(types => this.types = types);
  }

  startEdit(t?: ActType): void {
    this.editing = true;
    this.error = null;
    this.editingId = t?.id ?? null;
    const next = (this.types.reduce((m, x) => Math.max(m, x.sort_order), 0) || 0) + 10;
    this.form.reset({name: t?.name ?? '', sort_order: t?.sort_order ?? next});
  }

  cancel(): void {
    this.editing = false;
    this.editingId = null;
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const payload = {name: (v.name ?? '').trim(), sort_order: Number(v.sort_order ?? 0)};
    this.saving = true;
    const req = this.editingId ? this.service.updateType(this.editingId, payload) : this.service.createType(payload);
    req.subscribe({
      next: () => {
        this.saving = false;
        this.cancel();
        this.reload();
      },
      error: (err: HttpErrorResponse) => {
        this.saving = false;
        this.error = err.error?.message ?? 'Salvataggio non riuscito.';
      },
    });
  }

  remove(t: ActType): void {
    this.dialog.open<ConfirmDialogComponent, ConfirmDialogData, boolean>(ConfirmDialogComponent, {
      width: '350px',
      data: {title: 'Elimina tipo di atto', message: `Eliminare il tipo «${t.name}»?`, confirmLabel: 'Elimina', danger: true},
    }).afterClosed().subscribe(confirmed => {
      if (!confirmed) return;
      this.service.deleteType(t.id).subscribe({
        next: () => this.reload(),
        error: (err: HttpErrorResponse) => this.toast.add({
          severity: 'error', summary: 'Eliminazione non riuscita', detail: err.error?.message ?? 'Errore imprevisto.',
        }),
      });
    });
  }
}
