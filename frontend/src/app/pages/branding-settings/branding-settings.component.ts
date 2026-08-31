import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { LocationMapComponent } from '../../core/components/location-map.component';
import { BrandingService } from '../../services/branding.service';
import { AuthService } from '../../services/auth.service';
import { ToastService } from '../../core/services/toast.service';

@Component({
  selector: 'app-branding-settings',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    LocationMapComponent,
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './branding-settings.component.html',
})
export class BrandingSettingsComponent {
  private fb = inject(FormBuilder);
  private brandingService = inject(BrandingService);
  private authService = inject(AuthService);
  private toastService = inject(ToastService);

  current = this.brandingService.current();
  logoPreview: string | null = this.current.logo;
  faviconPreview: string | null = this.current.favicon;
  saving = false;

  form = this.fb.group({
    entity_name: [this.current.entity_name, Validators.required],
    entity_type: [this.current.entity_type, Validators.required],
    default_latitude: [this.current.default_latitude],
    default_longitude: [this.current.default_longitude],
  });

  constructor() {
    const role = this.authService.getCurrentUser()?.role;
    if (role !== 'Admin') this.form.disable();
  }

  onPositionSelected(coords: { lat: string; lng: string }): void {
    this.form.patchValue({ default_latitude: coords.lat, default_longitude: coords.lng });
  }

  onLogoSelected(event: Event): void {
    this.readFileAsDataUri(event, (dataUri) => (this.logoPreview = dataUri));
  }

  onFaviconSelected(event: Event): void {
    this.readFileAsDataUri(event, (dataUri) => (this.faviconPreview = dataUri));
  }

  private readFileAsDataUri(event: Event, onLoaded: (dataUri: string) => void): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onLoaded(reader.result as string);
    reader.readAsDataURL(file);
  }

  removeLogo(): void {
    this.logoPreview = null;
  }

  removeFavicon(): void {
    this.faviconPreview = null;
  }

  save(): void {
    if (!this.form.valid) return;
    this.saving = true;

    const raw = this.form.getRawValue();
    this.brandingService
      .update({
        entity_name: raw.entity_name ?? undefined,
        entity_type: raw.entity_type ?? undefined,
        default_latitude: raw.default_latitude ?? undefined,
        default_longitude: raw.default_longitude ?? undefined,
        logo: this.logoPreview !== this.current.logo ? (this.logoPreview ?? undefined) : undefined,
        removeLogo: this.logoPreview === null && this.current.logo !== null,
        favicon:
          this.faviconPreview !== this.current.favicon ? (this.faviconPreview ?? undefined) : undefined,
        removeFavicon: this.faviconPreview === null && this.current.favicon !== null,
      })
      .subscribe({
        next: (branding) => {
          this.current = branding;
          this.saving = false;
          this.toastService.add({ severity: 'success', summary: 'Branding aggiornato' });
        },
        error: (err) => {
          this.saving = false;
          this.toastService.add({
            severity: 'error',
            summary: 'Errore nel salvataggio',
            detail: err?.error?.message,
          });
        },
      });
  }
}
