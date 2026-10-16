import { Component, OnDestroy, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { ToastService } from '../../core/services/toast.service';
import { BackupService, BackupInfo, BackupJobStatus } from './backup.service';
import { GeocodeService, RegeocodeAllStatus } from './geocode.service';
import { UtilityConsumptionService } from '../utilities/consumptions/utility-consumption.service';
import { RestoreConfirmDialogComponent, RestoreConfirmDialogData, RestoreConfirmDialogResult } from './restore-confirm-dialog.component';

// Poll piu' rado di quanto Nominatim possa mai completare una singola
// geocodifica (throttle 1.1s + eventuali retry su 429) — non ha senso
// interrogare lo stato piu' spesso del ritmo con cui puo' cambiare.
const STATUS_POLL_MS = 3000;

@Component({
  selector: 'app-backup-import',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatTabsModule,
    MatTableModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatCheckboxModule,
    MatProgressBarModule,
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './backup-import.component.html',
})
export class BackupImportComponent implements OnDestroy {
  private backupService = inject(BackupService);
  private geocodeService = inject(GeocodeService);
  private consumptionService = inject(UtilityConsumptionService);
  private toastService = inject(ToastService);
  private dialog = inject(MatDialog);
  private router = inject(Router);

  backups: BackupInfo[] = [];
  backupColumns = ['filename', 'size', 'createdAt', 'actions'];
  loadingBackups = false;
  creatingBackup = false;
  // Solo sui backup manuali (mai sullo schedulato, lato backend) — genera
  // un .tar.gz (dump.sql + foto) invece del solo .sql.
  includePhotosInBackup = false;
  includeAttachmentsInBackup = false;

  restoreFile: File | null = null;
  restoring = false;
  // Percentuale del file caricato (upload a pezzi): con backup da GB dura minuti.
  uploadPercent = 0;

  // Creazione e ripristino girano in background sul server.
  jobStatus: BackupJobStatus | null = null;
  private jobPollHandle: ReturnType<typeof setInterval> | null = null;

  geocodeStatus: RegeocodeAllStatus | null = null;
  geocodeForceAll = false;
  recalcRunning = false;
  recalcResult: {processed: number; failed: number; at: Date} | null = null;
  private geocodePollHandle: ReturnType<typeof setInterval> | null = null;

  ngOnInit() {
    this.loadBackups();
    this.refreshGeocodeStatus();
    this.refreshJobStatus();
  }

  ngOnDestroy(): void {
    this.stopGeocodePolling();
    this.stopJobPolling();
  }

  private refreshJobStatus(): void {
    this.backupService.status().subscribe({
      next: (status) => this.applyJobStatus(status),
      error: () => {
        // Silenzioso come il poll della geocodifica.
      },
    });
  }

  private applyJobStatus(status: BackupJobStatus): void {
    const wasCreating = this.creatingBackup;
    this.jobStatus = status;
    this.creatingBackup = status.creating !== null;
    if (this.creatingBackup) {
      if (!this.jobPollHandle) {
        this.jobPollHandle = setInterval(() => this.refreshJobStatus(), STATUS_POLL_MS);
      }
      return;
    }
    this.stopJobPolling();
    if (wasCreating) {
      if (status.lastCreate?.error) {
        this.toastService.add({
          severity: 'error',
          summary: 'Errore nella creazione del backup',
          detail: status.lastCreate.error,
        });
      } else {
        this.toastService.add({ severity: 'success', summary: 'Backup creato' });
      }
      this.loadBackups();
    }
  }

  private stopJobPolling(): void {
    if (!this.jobPollHandle) return;
    clearInterval(this.jobPollHandle);
    this.jobPollHandle = null;
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

  // Sincrono: poche centinaia di utenze, qualche secondo.
  startConsumptionRecalc(): void {
    this.recalcRunning = true;
    this.consumptionService.recalcAll().subscribe({
      next: (res) => {
        this.recalcRunning = false;
        this.recalcResult = { ...res, at: new Date() };
        this.toastService.add({
          severity: res.failed ? 'warn' : 'success',
          summary: 'Ricalcolo consumi completato',
          detail: `${res.processed} utenze aggiornate` + (res.failed ? `, ${res.failed} errori` : ''),
        });
      },
      error: (err: any) => {
        this.recalcRunning = false;
        const detail = err?.error?.message ?? 'Errore nel ricalcolo dei consumi';
        this.toastService.add({ severity: 'error', summary: 'Errore', detail });
      },
    });
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
    this.backupService.create(this.includePhotosInBackup, this.includeAttachmentsInBackup).subscribe({
      next: (status) => this.applyJobStatus(status),
      error: (err: any) => {
        this.creatingBackup = false;
        const detail = err?.error?.message;
        this.toastService.add({ severity: 'error', summary: 'Errore nella creazione del backup', detail });
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
    this.backupService.downloadUrl(filename).subscribe({
      // Download diretto del browser, in streaming: niente Blob in memoria.
      next: (url: string) => {
        window.location.href = url;
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

    this.dialog.open<RestoreConfirmDialogComponent, RestoreConfirmDialogData, RestoreConfirmDialogResult | undefined>(
      RestoreConfirmDialogComponent,
      { width: '450px', data: { fileName: this.restoreFile.name } }
    ).afterClosed().subscribe(result => {
      if (result) {
        this.confirmRestore(result);
      } else {
        this.restoreFile = null;
      }
      input.value = '';
    });
  }

  private confirmRestore(result: RestoreConfirmDialogResult) {
    if (!this.restoreFile) return;

    this.restoring = true;
    this.uploadPercent = 0;
    this.backupService.restore(this.restoreFile, result.password, {
      excludeUsers: result.excludeUsers,
      excludeBranding: result.excludeBranding,
    }, (sent, total) => {
      this.uploadPercent = total > 0 ? Math.floor((sent / total) * 100) : 100;
    }).subscribe({
      // Ripristino avviato in background: l'app è in manutenzione per tutti,
      // anche per chi l'ha avviato. La pagina di cortesia riporta al login.
      next: () => {
        this.restoring = false;
        this.restoreFile = null;
        void this.router.navigate(['/manutenzione']);
      },
      error: (err: any) => {
        this.restoring = false;
        this.restoreFile = null;
        const detail = err?.error?.message ?? 'Errore nel ripristino';
        this.toastService.add({ severity: 'error', summary: 'Errore', detail });
      },
    });
  }
}
