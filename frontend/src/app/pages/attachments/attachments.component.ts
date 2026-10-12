import {
  ChangeDetectionStrategy, Component, EventEmitter, inject, Input, OnChanges, OnInit, Output,
} from '@angular/core';
import {HttpErrorResponse} from '@angular/common/http';
import {MatDialog} from '@angular/material/dialog';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatTooltipModule} from '@angular/material/tooltip';
import {MatProgressBarModule} from '@angular/material/progress-bar';
import {catchError, concatMap, finalize, from, of} from 'rxjs';
import {AuthService} from '../../services/auth.service';
import {isEditorRole} from '../../core/components/entity-sheet/sheet-utils';
import {ConfirmDialogComponent, ConfirmDialogData} from '../../core/components/confirm-dialog.component';
import {AttachmentService} from './attachment.service';
import {ALLOWED_EXTENSIONS, Attachment, extensionOf, formatBytes, isPreviewable} from './attachment.model';
import type {AttachmentEntityType} from './attachment.model';

// Allegati di un'entità: trascina o scegli i file, nessun dato da compilare.
// Scaricamento solo per Admin e Operatore (dati personali negli atti).
@Component({
  selector: 'app-attachments',
  standalone: true,
  imports: [MatButtonModule, MatIconModule, MatTooltipModule, MatProgressBarModule],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    @if (!readOnly) {
      <div class="att-drop" [class.drag]="dragging"
           (dragover)="$event.preventDefault(); dragging = true"
           (dragleave)="dragging = false"
           (drop)="onDrop($event)">
        <mat-icon>upload_file</mat-icon>
        <span>Trascina qui i file o <button type="button" class="att-pick" (click)="picker.click()">scegli</button></span>
        <span class="att-hint">PDF, P7M, Office, OpenDocument, immagini, email · massimo {{ maxSizeMb }} MB</span>
        <input #picker type="file" multiple hidden [accept]="accept" (change)="onPick(picker)">
      </div>
    }
    @if (uploading) {
      <div class="att-progress">
        <span>Caricamento di «{{ uploading }}»…</span>
        <mat-progress-bar mode="indeterminate"></mat-progress-bar>
      </div>
    }
    @if (errors.length) {
      <div class="att-errors">
        @for (e of errors; track $index) {
          <div>{{ e }}</div>
        }
        <button mat-button type="button" (click)="errors = []">Chiudi</button>
      </div>
    }

    @if (rows.length === 0) {
      <p class="att-empty">Nessun allegato.</p>
    } @else {
      <table class="att-table">
        <tbody>
          @for (r of rows; track r.id) {
            <tr>
              <td class="att-icon"><mat-icon>{{ iconOf(r) }}</mat-icon></td>
              <td>
                <div class="att-name">{{ r.original_name }}</div>
                @if (r.inspection) {
                  <span class="att-tag">verifica: {{ r.inspection.kind }}</span>
                }
                @if (readOnly) {
                  @if (r.description) { <div class="att-desc">{{ r.description }}</div> }
                } @else {
                  <input class="att-desc-input" placeholder="Descrizione (facoltativa)" [value]="r.description ?? ''"
                         [attr.aria-label]="'Descrizione di ' + r.original_name"
                         (blur)="saveDescription(r, $any($event.target).value)">
                }
              </td>
              <td class="att-meta">{{ size(r.size_bytes) }}</td>
              <td class="att-meta">{{ uploadedBy(r) }}</td>
              <td class="att-actions">
                @if (canDownload) {
                  @if (previewable(r)) {
                    <button mat-icon-button type="button" (click)="open(r, true)" matTooltip="Apri" [attr.aria-label]="'Apri ' + r.original_name"><mat-icon>visibility</mat-icon></button>
                  }
                  <button mat-icon-button type="button" (click)="open(r, false)" matTooltip="Scarica" [attr.aria-label]="'Scarica ' + r.original_name"><mat-icon>download</mat-icon></button>
                } @else {
                  <mat-icon class="att-lock" matTooltip="Download riservato ad Amministratori e Operatori"
                            aria-label="Download riservato ad Amministratori e Operatori" role="img">lock</mat-icon>
                }
                @if (!readOnly) {
                  <button mat-icon-button type="button" (click)="remove(r)" matTooltip="Elimina" [attr.aria-label]="'Elimina ' + r.original_name"><mat-icon>delete</mat-icon></button>
                }
              </td>
            </tr>
          }
        </tbody>
      </table>
    }
  `,
  styles: [`
    :host { display: block; }
    .att-drop { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 1rem;
      border: 2px dashed var(--app-border); border-radius: 8px; color: var(--app-muted); text-align: center; }
    .att-drop.drag { border-color: var(--entity-act); background: var(--app-surface-2); }
    .att-pick { border: 0; background: none; padding: 0; font: inherit; color: var(--entity-act); text-decoration: underline; cursor: pointer; }
    .att-hint { font-size: 0.75rem; }
    .att-progress { margin-top: 0.5rem; font-size: 0.875rem; }
    .att-errors { margin-top: 0.5rem; color: var(--app-error); font-size: 0.875rem; }
    .att-empty { color: var(--app-muted); margin: 0.75rem 0; }
    .att-table { width: 100%; border-collapse: collapse; margin-top: 0.75rem; font-size: 0.875rem; }
    .att-table tr { border-bottom: 1px solid var(--app-surface-2); }
    .att-table td { padding: 6px; vertical-align: middle; }
    .att-icon { width: 32px; color: var(--app-muted); }
    .att-name { font-weight: 500; word-break: break-word; }
    .att-tag { font-size: 0.75rem; padding: 1px 6px; border-radius: 8px; background: var(--tone-info-bg); color: var(--tone-info-fg); }
    .att-desc { color: var(--app-muted); }
    .att-desc-input { width: 100%; border: 0; border-bottom: 1px dashed var(--app-border); background: transparent;
      color: inherit; font: inherit; padding: 2px 0; }
    .att-meta { color: var(--app-muted); white-space: nowrap; }
    .att-actions { text-align: right; white-space: nowrap; }
    .att-lock { color: var(--app-muted); vertical-align: middle; }
  `],
})
export class AttachmentsComponent implements OnChanges, OnInit {
  @Input({required: true}) entityType!: AttachmentEntityType;
  @Input({required: true}) entityId!: number;
  @Input() readOnly = false;
  @Output() countChange = new EventEmitter<number>();

  private service = inject(AttachmentService);
  private dialog = inject(MatDialog);
  readonly canDownload = isEditorRole(inject(AuthService).getCurrentUser()?.role);
  accept = ALLOWED_EXTENSIONS.map(e => '.' + e).join(',');
  private extensions = ALLOWED_EXTENSIONS;
  // Valore del server (ATTACHMENT_MAX_SIZE_MB); 50 finché non arriva.
  maxSizeMb = 50;
  readonly size = formatBytes;
  readonly previewable = isPreviewable;

  rows: Attachment[] = [];
  errors: string[] = [];
  uploading: string | null = null;
  dragging = false;

  ngOnChanges(): void {
    if (this.entityId) this.reload();
  }

  ngOnInit(): void {
    this.service.limits().subscribe({
      next: l => {
        this.maxSizeMb = l.max_size_mb;
        this.extensions = l.extensions;
        this.accept = l.extensions.map(e => '.' + e).join(',');
      },
      error: () => undefined, // restano i valori predefiniti
    });
  }

  reload(): void {
    this.service.list(this.entityType, this.entityId).subscribe({
      next: rows => {
        this.rows = rows;
        this.countChange.emit(rows.length);
      },
      error: err => console.error('Errore caricamento allegati:', err),
    });
  }

  iconOf(r: Attachment): string {
    if (r.mime_type === 'application/pdf') return 'picture_as_pdf';
    if (r.mime_type.startsWith('image/')) return 'image';
    return 'description';
  }

  uploadedBy(r: Attachment): string {
    const who = [r.created_by?.firstName, r.created_by?.lastName].filter(Boolean).join(' ');
    const when = r.create_date ? new Date(r.create_date).toLocaleDateString('it-IT') : '';
    return [who, when].filter(Boolean).join(' · ');
  }

  onDrop(e: DragEvent): void {
    e.preventDefault();
    this.dragging = false;
    this.addFiles(Array.from(e.dataTransfer?.files ?? []));
  }

  onPick(input: HTMLInputElement): void {
    this.addFiles(Array.from(input.files ?? []));
    input.value = '';
  }

  // Estensione controllata subito; il contenuto lo verifica il server.
  addFiles(files: File[]): void {
    if (this.readOnly || !files.length) return;
    const accepted = files.filter(f => {
      if (!this.extensions.includes(extensionOf(f.name))) {
        this.errors.push(`${f.name}: tipo di file non ammesso`);
      } else if (f.size === 0) {
        this.errors.push(`${f.name}: il file è vuoto`);
      } else if (f.size > this.maxSizeMb * 1024 * 1024) {
        this.errors.push(`${f.name}: file troppo grande (massimo ${this.maxSizeMb} MB)`);
      } else {
        return true;
      }
      return false;
    });
    if (!accepted.length) return;
    from(accepted).pipe(
      concatMap(f => {
        this.uploading = f.name;
        return this.service.upload(this.entityType, this.entityId, f).pipe(
          catchError((err: HttpErrorResponse) => {
            this.errors.push(`${f.name}: ${err.error?.message ?? 'caricamento non riuscito'}`);
            return of(null);
          }),
        );
      }),
      finalize(() => {
        this.uploading = null;
        this.reload();
      }),
    ).subscribe();
  }

  saveDescription(r: Attachment, value: string): void {
    const description = value.trim() || null;
    if (description === (r.description ?? null)) return;
    this.service.update(r.id, description).subscribe({
      next: saved => r.description = saved.description,
      error: (err: HttpErrorResponse) => this.errors.push(`${r.original_name}: ${err.error?.message ?? 'salvataggio non riuscito'}`),
    });
  }

  open(r: Attachment, inline: boolean): void {
    // Il token va nell'header: si scarica il blob e si apre un object URL. La
    // finestra si apre subito, prima della richiesta, per non farla bloccare.
    const win = inline ? window.open('', '_blank') : null;
    this.service.blob(r.id, inline).subscribe({
      next: blob => {
        const url = URL.createObjectURL(blob);
        if (win) {
          win.location.href = url;
        } else {
          const a = document.createElement('a');
          a.href = url;
          a.download = r.original_name;
          a.click();
        }
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      },
      error: async (err: HttpErrorResponse) => {
        win?.close();
        let message = 'File non disponibile.';
        try {
          if (err.error instanceof Blob) message = JSON.parse(await err.error.text()).message ?? message;
        } catch {
          // risposta non JSON
        }
        this.errors.push(`${r.original_name}: ${message}`);
      },
    });
  }

  remove(r: Attachment): void {
    this.dialog.open<ConfirmDialogComponent, ConfirmDialogData, boolean>(ConfirmDialogComponent, {
      width: '350px',
      data: {title: 'Elimina allegato', message: `Eliminare «${r.original_name}»?`, confirmLabel: 'Elimina', danger: true},
    }).afterClosed().subscribe(confirmed => {
      if (!confirmed) return;
      this.service.delete(r.id).subscribe({
        next: () => this.reload(),
        error: (err: HttpErrorResponse) => this.errors.push(`${r.original_name}: ${err.error?.message ?? 'eliminazione non riuscita'}`),
      });
    });
  }
}
