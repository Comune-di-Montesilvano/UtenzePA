import {ChangeDetectionStrategy, Component, inject, OnInit} from '@angular/core';
import {FormBuilder, ReactiveFormsModule, Validators} from '@angular/forms';
import {HttpErrorResponse} from '@angular/common/http';
import {MatDialog} from '@angular/material/dialog';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatTooltipModule} from '@angular/material/tooltip';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatTabsModule} from '@angular/material/tabs';
import {MatCheckboxModule} from '@angular/material/checkbox';
import {HasRoleDirective} from '../../core/directives/has-role.directive';
import {ConfirmDialogComponent, ConfirmDialogData} from '../../core/components/confirm-dialog.component';
import {ToastService} from '../../core/services/toast.service';
import {DestinationSuggestion, SpendingDestination, SpendingDestinationService} from './spending-destination.service';

// Destinazioni di spesa: battezzano immobili e impianti; con la natura del
// capitolo decidono il capitolo delle utenze. Gestite dagli Admin.
@Component({
  selector: 'app-spending-destinations',
  standalone: true,
  imports: [ReactiveFormsModule, MatButtonModule, MatIconModule, MatTooltipModule, MatFormFieldModule, MatInputModule,
    MatTabsModule, MatCheckboxModule, HasRoleDirective],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <div style="padding: 1rem; max-width: 1000px;">
      <h1>Destinazioni di spesa</h1>
      <p class="list-subtitle">Ogni immobile (o impianto) è battezzato con una destinazione; ogni capitolo indica destinazione e
        natura (luce, gas, acqua). Il capitolo delle utenze si ricava da qui. Una destinazione in uso non si può eliminare.</p>

      <mat-tab-group animationDuration="0ms" mat-stretch-tabs="false" mat-align-tabs="start">
        <mat-tab label="Destinazioni" aria-label="Destinazioni">
          <div style="padding-top: 1rem;">
            @if (!editing) {
              <button mat-stroked-button type="button" (click)="startEdit()" [appHasRole]="['Admin']">
                <mat-icon>add</mat-icon> Nuova destinazione
              </button>
            } @else {
              <form [formGroup]="form" (ngSubmit)="save()"
                    style="border: 1px solid var(--app-border); border-radius: 6px; padding: 1rem; display: flex; flex-wrap: wrap; gap: 1rem; align-items: center;">
                <mat-form-field style="flex: 1 1 260px;">
                  <mat-label>Nome</mat-label>
                  <input matInput formControlName="name" maxlength="100">
                  <mat-error>Obbligatorio</mat-error>
                </mat-form-field>
                <mat-form-field style="flex: 2 1 300px;">
                  <mat-label>Note</mat-label>
                  <input matInput formControlName="notes">
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

            <div style="overflow-x: auto;">
              <table style="width: 100%; border-collapse: collapse; margin-top: 1rem; font-size: 0.875rem;">
                <thead>
                  <tr style="text-align: left; border-bottom: 1px solid var(--app-border);">
                    <th style="padding: 6px;">Nome</th>
                    <th style="padding: 6px;">Immobili</th>
                    <th style="padding: 6px;">Impianti</th>
                    <th style="padding: 6px;">Capitoli</th>
                    <th style="padding: 6px;">Utenze</th>
                    <th style="padding: 6px; width: 110px;"></th>
                  </tr>
                </thead>
                <tbody>
                  @for (d of destinations; track d.id) {
                    <tr style="border-bottom: 1px solid var(--app-surface-2);">
                      <td style="padding: 6px;">{{ d.name }}@if (d.notes) {<div class="sheet-hint">{{ d.notes }}</div>}</td>
                      <td style="padding: 6px;">{{ d.assets }}</td>
                      <td style="padding: 6px;">{{ d.plants }}</td>
                      <td style="padding: 6px;">{{ d.chapters }}</td>
                      <td style="padding: 6px;">{{ d.utilities }}</td>
                      <td style="padding: 6px; text-align: right; white-space: nowrap;">
                        <button mat-icon-button type="button" (click)="startEdit(d)" matTooltip="Modifica" aria-label="Modifica" [appHasRole]="['Admin']"><mat-icon>edit</mat-icon></button>
                        <button mat-icon-button type="button" (click)="remove(d)" matTooltip="Elimina" aria-label="Elimina" [appHasRole]="['Admin']"><mat-icon>delete</mat-icon></button>
                      </td>
                    </tr>
                  } @empty {
                    <tr><td colspan="6" style="padding: 1rem; color: var(--app-muted);">Nessuna destinazione.</td></tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        </mat-tab>

        <mat-tab label="Da battezzare" aria-label="Da battezzare">
          <div style="padding-top: 1rem;">
            <p class="list-subtitle">Immobili senza destinazione, con la proposta dalla destinazione dei capitoli attuali delle loro
              utenze (a pari merito nessuna proposta). Prima dare destinazione e natura ai capitoli.</p>
            <div style="display: flex; gap: 0.5rem; margin-bottom: 0.5rem;" [appHasRole]="['Admin', 'Operatore']">
              <button mat-flat-button type="button" [disabled]="!selected.size || assigning" (click)="assignSelected()">
                <mat-icon>done_all</mat-icon> Assegna le proposte selezionate ({{ selected.size }})
              </button>
            </div>
            <div style="overflow-x: auto;">
              <table style="width: 100%; border-collapse: collapse; font-size: 0.875rem;">
                <thead>
                  <tr style="text-align: left; border-bottom: 1px solid var(--app-border);">
                    <th style="padding: 6px; width: 40px;">
                      <mat-checkbox [checked]="allSelected" [indeterminate]="selected.size > 0 && !allSelected"
                                    (change)="toggleAll($event.checked)" aria-label="Seleziona tutti"></mat-checkbox>
                    </th>
                    <th style="padding: 6px;">Immobile</th>
                    <th style="padding: 6px;">Proposta</th>
                    <th style="padding: 6px;">Utenze</th>
                  </tr>
                </thead>
                <tbody>
                  @for (s of suggestions; track s.asset_id) {
                    <tr style="border-bottom: 1px solid var(--app-surface-2);">
                      <td style="padding: 6px;">
                        <mat-checkbox [checked]="selected.has(s.asset_id)" (change)="toggle(s.asset_id, $event.checked)"
                                      [attr.aria-label]="'Seleziona ' + s.label"></mat-checkbox>
                      </td>
                      <td style="padding: 6px;">{{ s.label }}</td>
                      <td style="padding: 6px;">{{ nameOf(s.destination_id) }}</td>
                      <td style="padding: 6px;">{{ s.utilities }}</td>
                    </tr>
                  } @empty {
                    <tr><td colspan="4" style="padding: 1rem; color: var(--app-muted);">Nessuna proposta.</td></tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        </mat-tab>
      </mat-tab-group>
    </div>
  `,
})
export class SpendingDestinationsComponent implements OnInit {
  private fb = inject(FormBuilder);
  private service = inject(SpendingDestinationService);
  private dialog = inject(MatDialog);
  private toast = inject(ToastService);

  destinations: SpendingDestination[] = [];
  suggestions: DestinationSuggestion[] = [];
  selected = new Set<number>();
  editing = false;
  saving = false;
  assigning = false;
  error: string | null = null;
  private editingId: number | null = null;

  form = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
    notes: [''],
  });

  get allSelected(): boolean {
    return this.suggestions.length > 0 && this.selected.size === this.suggestions.length;
  }

  ngOnInit(): void {
    this.reload();
  }

  reload(): void {
    this.service.list().subscribe(list => this.destinations = list);
    this.service.suggestions().subscribe(list => {
      this.suggestions = list;
      this.selected = new Set([...this.selected].filter(id => list.some(s => s.asset_id === id)));
    });
  }

  nameOf(id: number): string {
    return this.destinations.find(d => d.id === id)?.name ?? `#${id}`;
  }

  toggle(id: number, on: boolean): void {
    if (on) this.selected.add(id);
    else this.selected.delete(id);
  }

  toggleAll(on: boolean): void {
    this.selected = on ? new Set(this.suggestions.map(s => s.asset_id)) : new Set();
  }

  assignSelected(): void {
    const byDestination = new Map<number, number[]>();
    for (const s of this.suggestions) {
      if (!this.selected.has(s.asset_id)) continue;
      byDestination.set(s.destination_id, [...(byDestination.get(s.destination_id) ?? []), s.asset_id]);
    }
    const calls = [...byDestination];
    this.assigning = true;
    let assigned = 0;
    const next = (): void => {
      const call = calls.shift();
      if (!call) {
        this.assigning = false;
        this.selected.clear();
        this.toast.add({severity: 'success', summary: 'Destinazioni assegnate', detail: `${assigned} immobili battezzati.`});
        this.reload();
        return;
      }
      this.service.assignAssets(call[0], call[1]).subscribe({
        next: r => {
          assigned += r.assigned;
          next();
        },
        error: (err: HttpErrorResponse) => {
          this.assigning = false;
          this.toast.add({severity: 'error', summary: 'Assegnazione non riuscita', detail: err.error?.message ?? 'Errore imprevisto.'});
          this.reload();
        },
      });
    };
    next();
  }

  startEdit(d?: SpendingDestination): void {
    this.editing = true;
    this.error = null;
    this.editingId = d?.id ?? null;
    this.form.reset({name: d?.name ?? '', notes: d?.notes ?? ''});
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
    const payload = {name: (v.name ?? '').trim(), notes: (v.notes ?? '').trim() || null};
    this.saving = true;
    const req = this.editingId ? this.service.update(this.editingId, payload) : this.service.create(payload);
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

  remove(d: SpendingDestination): void {
    this.dialog.open<ConfirmDialogComponent, ConfirmDialogData, boolean>(ConfirmDialogComponent, {
      width: '350px',
      data: {title: 'Elimina destinazione', message: `Eliminare la destinazione «${d.name}»?`, confirmLabel: 'Elimina', danger: true},
    }).afterClosed().subscribe(confirmed => {
      if (!confirmed) return;
      this.service.remove(d.id).subscribe({
        next: () => this.reload(),
        error: (err: HttpErrorResponse) => this.toast.add({
          severity: 'error', summary: 'Eliminazione non riuscita', detail: err.error?.message ?? 'Errore imprevisto.',
        }),
      });
    });
  }
}
