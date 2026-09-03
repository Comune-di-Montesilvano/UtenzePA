import {
  Component,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  SimpleChanges,
  ChangeDetectionStrategy,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { from, concatMap, catchError, of, type Observable } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatDialog } from '@angular/material/dialog';
import { PhotosService } from '../../services/photos.service';
import { Photo } from '../entities/photo.entity';
import type { PhotoEntityType } from '../entities/photo.entity';
import { ConfirmDialogComponent, ConfirmDialogData } from './confirm-dialog.component';
import { HasRoleDirective } from '../directives/has-role.directive';
import { ToastService } from '../services/toast.service';

@Component({
  selector: 'app-photo-gallery',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule, MatTooltipModule, MatProgressBarModule, HasRoleDirective],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './photo-gallery.component.html',
  styleUrls: ['./photo-gallery.component.scss'],
})
export class PhotoGalleryComponent implements OnInit, OnChanges, OnDestroy {
  @Input({ required: true }) entityType!: PhotoEntityType;
  @Input({ required: true }) entityId!: number;

  private photosService = inject(PhotosService);
  private dialog = inject(MatDialog);
  private toast = inject(ToastService);

  photos: Photo[] = [];
  thumbnailUrls = new Map<number, string>();
  uploading = false;
  readonly maxPhotos = 10;

  ngOnInit(): void {
    this.load();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['entityId'] && !changes['entityId'].firstChange) {
      this.load();
    }
  }

  ngOnDestroy(): void {
    this.thumbnailUrls.forEach((url) => URL.revokeObjectURL(url));
  }

  onFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = input.files;
    if (!files || files.length === 0) return;

    const selected = Array.from(files);
    input.value = '';

    const remainingSlots = Math.max(0, this.maxPhotos - this.photos.length);
    const toUpload = selected.slice(0, remainingSlots);

    if (selected.length > toUpload.length) {
      this.toast.add({ severity: 'warn', summary: 'Limite raggiunto', detail: 'Massimo 10 foto per elemento.' });
    }
    if (toUpload.length === 0) return;

    this.uploading = true;
    from(toUpload)
      .pipe(concatMap((file) => this.upload(file)))
      .subscribe({
        complete: () => {
          this.uploading = false;
          this.load();
        },
      });
  }

  confirmDelete(photo: Photo): void {
    this.dialog
      .open<ConfirmDialogComponent, ConfirmDialogData, boolean>(ConfirmDialogComponent, {
        width: '350px',
        data: { title: 'Elimina foto', message: 'Eliminare questa foto?', confirmLabel: 'Elimina', danger: true },
      })
      .afterClosed()
      .subscribe((confirmed) => {
        if (confirmed) this.delete(photo);
      });
  }

  private load(): void {
    if (!this.entityId) return;
    this.photosService.list(this.entityType, this.entityId).subscribe({
      next: (photos) => {
        this.photos = photos;
        this.loadThumbnails();
      },
      error: () => this.toast.add({ severity: 'error', summary: 'Errore nel caricamento delle foto' }),
    });
  }

  private loadThumbnails(): void {
    for (const photo of this.photos) {
      if (this.thumbnailUrls.has(photo.id)) continue;
      this.photosService.getFileBlob(photo.id).subscribe({
        next: (blob) => this.thumbnailUrls.set(photo.id, URL.createObjectURL(blob)),
        error: () => {
          // Anteprima non caricata: la foto resta comunque elencata/eliminabile.
        },
      });
    }
  }

  private upload(file: File): Observable<Photo | null> {
    return this.photosService.upload(this.entityType, this.entityId, file).pipe(
      catchError((err) => {
        this.toast.add({
          severity: 'error',
          summary: 'Errore upload',
          detail: err?.error?.message ?? 'Riprova.',
        });
        return of(null);
      }),
    );
  }

  private delete(photo: Photo): void {
    this.photosService.delete(photo.id).subscribe({
      next: () => {
        const url = this.thumbnailUrls.get(photo.id);
        if (url) URL.revokeObjectURL(url);
        this.thumbnailUrls.delete(photo.id);
        this.load();
      },
      error: () => this.toast.add({ severity: 'error', summary: 'Errore durante l\'eliminazione' }),
    });
  }
}
