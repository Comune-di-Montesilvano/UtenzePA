import {ChangeDetectionStrategy, Component, inject, OnInit} from '@angular/core';
import {DatePipe} from '@angular/common';
import {Router} from '@angular/router';
import {MatButtonModule} from '@angular/material/button';
import {MatDialog} from '@angular/material/dialog';
import {MatIconModule} from '@angular/material/icon';
import {MatProgressSpinnerModule} from '@angular/material/progress-spinner';
import {forkJoin} from 'rxjs';
import {AuthService} from '../../services/auth.service';
import {ToastService} from '../../core/services/toast.service';
import {isEditorRole} from '../../core/components/entity-sheet/sheet-utils';
import {ConfirmDialogComponent} from '../../core/components/confirm-dialog.component';
import {InvoicePatternsService} from './invoice-patterns.service';
import type {InvoicePatternRow, UnknownStructure} from './pattern-rules.model';

// Strutture di fattura ancora da mappare (per fornitore) e pattern esistenti.
@Component({
  selector: 'app-invoice-patterns-tab',
  standalone: true,
  imports: [DatePipe, MatButtonModule, MatIconModule, MatProgressSpinnerModule],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <div class="ip">
      <p>
        Un pattern dice da quali campi dell'XML leggere utenza, importi, periodi e consumi delle fatture di un
        fornitore con una certa struttura. Le fatture con una struttura senza pattern restano in attesa.
      </p>
      @if (loading) {
        <mat-spinner diameter="32"></mat-spinner>
      } @else {
        <h3>Strutture da mappare</h3>
        @if (unknown.length) {
          <table class="ip-table">
            <thead><tr><th>Fornitore</th><th class="num">Fatture</th><th></th></tr></thead>
            <tbody>
              @for (u of unknown; track u.supplier_id + u.structure_key) {
                <tr>
                  <td>{{ u.supplier }}</td>
                  <td class="num">{{ u.count }}</td>
                  <td class="act">
                    <button mat-stroked-button (click)="openEditor(u.message_ids[0])">
                      {{ canEdit ? 'Mappa' : 'Vedi' }}
                    </button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        } @else {
          <p class="muted">Nessuna struttura da mappare.</p>
        }

        <h3>Pattern</h3>
        @if (patterns.length) {
          <table class="ip-table">
            <thead>
              <tr><th>Nome</th><th>Fornitore</th><th class="num">Fatture importate</th><th>Ultima modifica</th><th></th></tr>
            </thead>
            <tbody>
              @for (p of patterns; track p.id) {
                <tr>
                  <td>
                    {{ p.name }}
                    @if (p.ignored) { <span class="badge tone-off">Ignorata</span> }
                  </td>
                  <td>{{ p.supplier }}</td>
                  <td class="num">{{ p.ignored ? '' : p.extracted }}</td>
                  <td>{{ p.update_date | date: 'dd/MM/yyyy HH:mm' }}</td>
                  <td class="act">
                    @if (!p.ignored && p.sample_message_id) {
                      <button mat-icon-button [attr.aria-label]="canEdit ? 'Modifica' : 'Vedi'"
                              (click)="openEditor(p.sample_message_id, p.id)">
                        <mat-icon>{{ canEdit ? 'edit' : 'visibility' }}</mat-icon>
                      </button>
                    }
                    @if (canEdit) {
                      <button mat-icon-button aria-label="Elimina" (click)="remove(p)"><mat-icon>delete</mat-icon></button>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        } @else {
          <p class="muted">Nessun pattern.</p>
        }
      }
    </div>
  `,
  styles: [`
    .ip { display: flex; flex-direction: column; gap: 0.5rem; padding: 1rem 0; max-width: 960px; }
    .ip h3 { margin: 1rem 0 0.25rem; }
    .ip-table { width: 100%; border-collapse: collapse; }
    .ip-table th, .ip-table td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--app-border); }
    .ip-table .num { text-align: right; }
    .ip-table .act { text-align: right; white-space: nowrap; }
    .badge { display: inline-block; margin-left: 6px; padding: 1px 8px; border-radius: 10px; font-size: 0.75rem; }
    .tone-off { background: var(--tone-off-bg); color: var(--tone-off-fg); }
    .muted { color: var(--app-muted); margin: 0; }
  `],
})
export class InvoicePatternsTabComponent implements OnInit {
  private service = inject(InvoicePatternsService);
  private router = inject(Router);
  private dialog = inject(MatDialog);
  private toast = inject(ToastService);
  readonly canEdit = isEditorRole(inject(AuthService).getCurrentUser()?.role);

  loading = true;
  unknown: UnknownStructure[] = [];
  patterns: InvoicePatternRow[] = [];

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    forkJoin({unknown: this.service.unknown(), patterns: this.service.list()}).subscribe({
      next: r => {
        this.unknown = r.unknown;
        this.patterns = r.patterns;
        this.loading = false;
      },
      error: err => {
        this.loading = false;
        this.toast.add({severity: 'error', summary: 'Pattern non disponibili', detail: err?.error?.message ?? ''});
      },
    });
  }

  openEditor(messageId: number, patternId?: number): void {
    this.router.navigate(['/invoice-import/editor', messageId], patternId ? {queryParams: {pattern: patternId}} : {});
  }

  remove(p: InvoicePatternRow): void {
    this.dialog
      .open(ConfirmDialogComponent, {
        data: {
          title: p.ignored ? 'Non ignorare più la struttura?' : 'Eliminare il pattern?',
          message: p.ignored
            ? `Le fatture di ${p.supplier} con questa struttura torneranno da mappare.`
            : `Le fatture già importate con «${p.name}» restano; le nuove con questa struttura torneranno da mappare.`,
          confirmLabel: 'Elimina',
          danger: true,
        },
      })
      .afterClosed()
      .subscribe(ok => {
        if (!ok) return;
        this.service.remove(p.id).subscribe({
          next: () => {
            this.toast.add({severity: 'success', summary: 'Pattern eliminato', detail: ''});
            this.load();
          },
          error: err => this.toast.add({severity: 'error', summary: 'Pattern non eliminato', detail: err?.error?.message ?? ''}),
        });
      });
  }
}
