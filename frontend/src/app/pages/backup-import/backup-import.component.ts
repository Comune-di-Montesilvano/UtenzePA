import { Component, OnDestroy, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog } from '@angular/material/dialog';
import { ToastService } from '../../core/services/toast.service';
import { BackupService, BackupInfo } from './backup.service';
import { ImportService } from './import.service';
import { GeocodeService, RegeocodeAllStatus } from './geocode.service';
import { RestoreConfirmDialogComponent, RestoreConfirmDialogData } from './restore-confirm-dialog.component';

// Poll piu' rado di quanto Nominatim possa mai completare una singola
// geocodifica (throttle 1.1s + eventuali retry su 429) — non ha senso
// interrogare lo stato piu' spesso del ritmo con cui puo' cambiare.
const STATUS_POLL_MS = 3000;

interface EntityTypeOption {
  label: string;
  value: string;
}

@Component({
  selector: 'app-backup-import',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatTabsModule,
    MatTableModule,
    MatButtonModule,
    MatFormFieldModule,
    MatSelectModule,
    MatProgressSpinnerModule,
    MatCheckboxModule,
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './backup-import.component.html',
})
export class BackupImportComponent implements OnDestroy {
  private backupService = inject(BackupService);
  private importService = inject(ImportService);
  private geocodeService = inject(GeocodeService);
  private toastService = inject(ToastService);
  private dialog = inject(MatDialog);

  backups: BackupInfo[] = [];
  backupColumns = ['filename', 'size', 'createdAt', 'actions'];
  loadingBackups = false;
  creatingBackup = false;

  restoreFile: File | null = null;
  restoring = false;

  entityTypes: EntityTypeOption[] = [
    { label: 'Immobili', value: 'immobili' },
    { label: 'Aggregati immobili', value: 'aggregati-immobili' },
    { label: 'Aggregati utenze', value: 'aggregati-utenze' },
    { label: 'Capitoli di spesa', value: 'capitoli-di-spesa' },
    { label: 'Fornitori', value: 'fornitori' },
    { label: 'Utilizzatori', value: 'utilizzatori' },
    { label: 'Concessioni', value: 'concessioni' },
    { label: 'Utenze', value: 'utenze' },
    { label: 'Fatture', value: 'fatture' },
  ];
  selectedEntityType: string | null = null;
  importFile: File | null = null;
  importing = false;
  importResult: Record<string, unknown> | null = null;

  geocodeStatus: RegeocodeAllStatus | null = null;
  geocodeForceAll = false;
  private geocodePollHandle: ReturnType<typeof setInterval> | null = null;

  ngOnInit() {
    this.loadBackups();
    this.refreshGeocodeStatus();
  }

  ngOnDestroy(): void {
    this.stopGeocodePolling();
  }

  private refreshGeocodeStatus(): void {
    this.geocodeService.getStatus().subscribe({
      next: (status) => {
        this.geocodeStatus = status;
        if (status.running) {
          this.startGeocodePolling();
        } else {
          this.stopGeocodePolling();
        }
      },
      error: () => {
        // Silenzioso: e' un poll di stato in background, non un'azione
        // esplicita dell'utente — un toast di errore ad ogni tick sarebbe
        // rumore, non segnale.
      },
    });
  }

  private startGeocodePolling(): void {
    if (this.geocodePollHandle) return;
    this.geocodePollHandle = setInterval(() => this.refreshGeocodeStatus(), STATUS_POLL_MS);
  }

  private stopGeocodePolling(): void {
    if (!this.geocodePollHandle) return;
    clearInterval(this.geocodePollHandle);
    this.geocodePollHandle = null;
  }

  startRegeocodeAll(): void {
    this.geocodeService.startAll(this.geocodeForceAll).subscribe({
      next: (status) => {
        this.geocodeStatus = status;
        if (status.running) {
          this.startGeocodePolling();
          this.toastService.add({ severity: 'success', summary: 'Rigeocodifica avviata' });
        } else {
          // running=false in risposta immediata: un job era gia' in corso
          // ed e' finito nell'istante tra la richiesta e la risposta, oppure
          // (piu' raro) non c'erano asset da processare.
          this.toastService.add({ severity: 'success', summary: 'Rigeocodifica completata' });
        }
      },
      error: (err: any) => {
        const detail = err?.error?.message ?? 'Errore nell\'avvio della rigeocodifica';
        this.toastService.add({ severity: 'error', summary: 'Errore', detail });
      },
    });
  }

  loadBackups() {
    this.loadingBackups = true;
    this.backupService.list().subscribe({
      next: (list) => {
        this.backups = list;
        this.loadingBackups = false;
      },
      error: () => {
        this.loadingBackups = false;
        this.toastService.add({ severity: 'error', summary: 'Errore nel caricamento dei backup' });
      },
    });
  }

  createBackup() {
    this.creatingBackup = true;
    this.backupService.create().subscribe({
      next: () => {
        this.creatingBackup = false;
        this.toastService.add({ severity: 'success', summary: 'Backup creato' });
        this.loadBackups();
      },
      error: () => {
        this.creatingBackup = false;
        this.toastService.add({ severity: 'error', summary: 'Errore nella creazione del backup' });
      },
    });
  }

  deleteBackup(filename: string) {
    this.backupService.remove(filename).subscribe({
      next: () => {
        this.toastService.add({ severity: 'success', summary: 'Backup eliminato' });
        this.loadBackups();
      },
      error: () => {
        this.toastService.add({ severity: 'error', summary: 'Errore nella cancellazione del backup' });
      },
    });
  }

  downloadBackup(filename: string) {
    this.backupService.download(filename).subscribe({
      next: (blob: Blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        window.URL.revokeObjectURL(url);
      },
      error: () => {
        this.toastService.add({ severity: 'error', summary: 'Errore nel download del backup' });
      },
    });
  }

  onRestoreFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    this.restoreFile = input.files?.[0] ?? null;
    if (!this.restoreFile) return;

    this.dialog.open<RestoreConfirmDialogComponent, RestoreConfirmDialogData, string | undefined>(
      RestoreConfirmDialogComponent,
      { width: '450px', data: { fileName: this.restoreFile.name } }
    ).afterClosed().subscribe(password => {
      if (password) {
        this.confirmRestore(password);
      } else {
        this.restoreFile = null;
      }
      input.value = '';
    });
  }

  private confirmRestore(password: string) {
    if (!this.restoreFile) return;

    this.restoring = true;
    this.backupService.restore(this.restoreFile, password).subscribe({
      next: () => {
        this.restoring = false;
        this.restoreFile = null;
        this.toastService.add({ severity: 'success', summary: 'Ripristino completato' });
        this.loadBackups();
      },
      error: (err: any) => {
        this.restoring = false;
        this.restoreFile = null;
        const detail = err?.error?.message ?? 'Errore nel ripristino';
        this.toastService.add({ severity: 'error', summary: 'Errore', detail });
      },
    });
  }

  onImportFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    this.importFile = input.files?.[0] ?? null;
  }

  runImport() {
    if (!this.selectedEntityType || !this.importFile) return;

    this.importing = true;
    this.importResult = null;
    this.importService.import(this.selectedEntityType, this.importFile).subscribe({
      next: (result) => {
        this.importing = false;
        this.importResult = result;
        this.toastService.add({ severity: 'success', summary: 'Import completato' });
      },
      error: (err: any) => {
        this.importing = false;
        const detail = err?.error?.message ?? 'Errore nell\'import';
        this.toastService.add({ severity: 'error', summary: 'Errore', detail });
      },
    });
  }
}
