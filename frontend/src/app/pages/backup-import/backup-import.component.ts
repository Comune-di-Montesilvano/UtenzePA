import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TabsModule } from 'primeng/tabs';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { SelectModule } from 'primeng/select';
import { DialogModule } from 'primeng/dialog';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { BackupService, BackupInfo } from './backup.service';
import { ImportService } from './import.service';

interface EntityTypeOption {
  label: string;
  value: string;
}

@Component({
  selector: 'app-backup-import',
  standalone: true,
  providers: [MessageService],
  imports: [
    CommonModule,
    FormsModule,
    TabsModule,
    TableModule,
    ButtonModule,
    InputTextModule,
    PasswordModule,
    SelectModule,
    DialogModule,
    ToastModule,
  ],
  templateUrl: './backup-import.component.html',
})
export class BackupImportComponent {
  private backupService = inject(BackupService);
  private importService = inject(ImportService);
  private messageService = inject(MessageService);

  backups: BackupInfo[] = [];
  loadingBackups = false;
  creatingBackup = false;

  restoreFile: File | null = null;
  restoreDialogVisible = false;
  restorePassword = '';
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

  ngOnInit() {
    this.loadBackups();
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
        this.messageService.add({ severity: 'error', summary: 'Errore nel caricamento dei backup' });
      },
    });
  }

  createBackup() {
    this.creatingBackup = true;
    this.backupService.create().subscribe({
      next: () => {
        this.creatingBackup = false;
        this.messageService.add({ severity: 'success', summary: 'Backup creato' });
        this.loadBackups();
      },
      error: () => {
        this.creatingBackup = false;
        this.messageService.add({ severity: 'error', summary: 'Errore nella creazione del backup' });
      },
    });
  }

  deleteBackup(filename: string) {
    this.backupService.remove(filename).subscribe({
      next: () => {
        this.messageService.add({ severity: 'success', summary: 'Backup eliminato' });
        this.loadBackups();
      },
      error: () => {
        this.messageService.add({ severity: 'error', summary: 'Errore nella cancellazione del backup' });
      },
    });
  }

  downloadUrl(filename: string): string {
    return this.backupService.downloadUrl(filename);
  }

  onRestoreFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    this.restoreFile = input.files?.[0] ?? null;
    if (this.restoreFile) {
      this.restoreDialogVisible = true;
    }
  }

  confirmRestore() {
    if (!this.restoreFile || !this.restorePassword) return;

    this.restoring = true;
    this.backupService.restore(this.restoreFile, this.restorePassword).subscribe({
      next: () => {
        this.restoring = false;
        this.restoreDialogVisible = false;
        this.restorePassword = '';
        this.restoreFile = null;
        this.messageService.add({ severity: 'success', summary: 'Ripristino completato' });
        this.loadBackups();
      },
      error: (err: any) => {
        this.restoring = false;
        const detail = err?.error?.message ?? 'Errore nel ripristino';
        this.messageService.add({ severity: 'error', summary: 'Errore', detail });
      },
    });
  }

  cancelRestore() {
    this.restoreDialogVisible = false;
    this.restorePassword = '';
    this.restoreFile = null;
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
        this.messageService.add({ severity: 'success', summary: 'Import completato' });
      },
      error: (err: any) => {
        this.importing = false;
        const detail = err?.error?.message ?? 'Errore nell\'import';
        this.messageService.add({ severity: 'error', summary: 'Errore', detail });
      },
    });
  }
}
