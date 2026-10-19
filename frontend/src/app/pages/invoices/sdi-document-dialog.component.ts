import {ChangeDetectionStrategy, Component, inject, OnDestroy, OnInit} from '@angular/core';
import {HttpErrorResponse} from '@angular/common/http';
import {DomSanitizer, SafeResourceUrl} from '@angular/platform-browser';
import {MAT_DIALOG_DATA, MatDialogModule} from '@angular/material/dialog';
import {MatButtonModule} from '@angular/material/button';
import {MatProgressSpinnerModule} from '@angular/material/progress-spinner';
import {Observable} from 'rxjs';
import {InvoicesService} from './invoices.service';

export interface SdiDocumentDialogData {
  invoiceId?: number;
  type: 'xml' | 'pdf';
  title: string;
  // Documento da un'altra fonte (es. messaggio PEC nell'editor dei pattern) al posto della fattura.
  source?: Observable<Blob>;
}

// XML o PDF della fattura riletti al momento dalla PEC dello SDI: niente file
// salvati, il PDF passa da un object URL revocato alla chiusura.
@Component({
  selector: 'app-sdi-document-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, MatProgressSpinnerModule],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content class="sdi-document">
      @if (loading) {
        <div class="center"><mat-spinner diameter="40"></mat-spinner></div>
      } @else if (error) {
        <p class="sdi-error">{{ error }}</p>
      } @else if (xml !== null) {
        <pre>{{ xml }}</pre>
      } @else if (pdfUrl) {
        <iframe [src]="pdfUrl" title="PDF della fattura"></iframe>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-stroked-button mat-dialog-close>Chiudi</button>
    </mat-dialog-actions>
  `,
  styles: [`
    .sdi-document { min-height: 200px; }
    .center { display: flex; justify-content: center; padding: 2rem; }
    .sdi-error { color: var(--app-error); }
    pre { white-space: pre-wrap; word-break: break-all; font-size: 0.8rem; margin: 0; }
    iframe { width: 100%; height: 70vh; border: 0; }
  `],
})
export class SdiDocumentDialogComponent implements OnInit, OnDestroy {
  protected data = inject<SdiDocumentDialogData>(MAT_DIALOG_DATA);
  private invoicesService = inject(InvoicesService);
  private sanitizer = inject(DomSanitizer);

  loading = true;
  error: string | null = null;
  xml: string | null = null;
  pdfUrl: SafeResourceUrl | null = null;
  private objectUrl: string | null = null;

  ngOnInit(): void {
    (this.data.source ?? this.invoicesService.sdiDocument(this.data.invoiceId!, this.data.type)).subscribe({
      next: async (blob) => {
        if (this.data.type === 'xml') {
          this.xml = await blob.text();
        } else {
          this.objectUrl = URL.createObjectURL(new Blob([blob], {type: 'application/pdf'}));
          this.pdfUrl = this.sanitizer.bypassSecurityTrustResourceUrl(this.objectUrl);
        }
        this.loading = false;
      },
      error: async (err: HttpErrorResponse) => {
        this.error = await messageOf(err);
        this.loading = false;
      },
    });
  }

  ngOnDestroy(): void {
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
  }
}

// Con responseType 'blob' anche il corpo dell'errore 400 arriva come Blob.
async function messageOf(err: HttpErrorResponse): Promise<string> {
  try {
    const body = err.error instanceof Blob ? JSON.parse(await err.error.text()) : err.error;
    if (body?.message) return Array.isArray(body.message) ? body.message.join(' ') : body.message;
  } catch {
    // corpo non JSON
  }
  return 'Documento non disponibile.';
}
