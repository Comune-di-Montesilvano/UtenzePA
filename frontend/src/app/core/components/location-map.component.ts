import { Component, Input, Output, EventEmitter, AfterViewInit, OnChanges, OnDestroy, SimpleChanges, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import * as L from 'leaflet';
import { BrandingService } from '../../services/branding.service';

let instanceCounter = 0;

// Fallback usato se le coordinate di default salvate in branding sono
// malformate/non numeriche (es. DTO backend con un vecchio valore invalido) —
// stesse coordinate del seed di migrazione CreateAppSettings (Montesilvano).
const SAFE_DEFAULT_CENTER: L.LatLngExpression = [42.5083, 14.15];

// Icona di default di Leaflet (L.marker senza [icon]) referenzia
// marker-icon.png/marker-icon-2x.png/marker-shadow.png con URL relativo
// calcolato dal CSS — esbuild (build Angular) non li ricopia/risolve, quindi
// il marker prova a caricarli dall'origin dell'app e fallisce con 404. Stesso
// divIcon "a pallino" già usato in map.component.ts: nessuna immagine da
// bundlare, coerente visivamente con la pagina Mappa.
const LOCATION_PIN_ICON = L.divIcon({
  className: '',
  html: '<span class="location-map-pin"></span>',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

@Component({
  selector: 'app-location-map',
  standalone: true,
  imports: [CommonModule, MatButtonModule],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './location-map.component.html',
  styleUrls: ['./location-map.component.scss'],
})
export class LocationMapComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() latitude: string | null = null;
  @Input() longitude: string | null = null;
  @Input() previewOnly = false;
  @Output() positionSelected = new EventEmitter<{ lat: string; lng: string }>();
  @Output() positionCleared = new EventEmitter<void>();

  readonly canvasId = `location-map-${instanceCounter++}`;
  private map: L.Map | null = null;
  private marker: L.Marker | null = null;

  private brandingService = inject(BrandingService);

  private get DEFAULT_CENTER(): L.LatLngExpression {
    const branding = this.brandingService.current();
    const lat = parseFloat(branding.default_latitude);
    const lng = parseFloat(branding.default_longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return SAFE_DEFAULT_CENTER;
    return [lat, lng];
  }

  ngAfterViewInit(): void {
    this.map = L.map(this.canvasId).setView(this.currentLatLng() ?? this.DEFAULT_CENTER, this.currentLatLng() ? 16 : 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(this.map);

    this.renderMarker();

    if (!this.previewOnly) {
      this.map.on('click', (event: L.LeafletMouseEvent) => {
        this.positionSelected.emit({
          lat: event.latlng.lat.toFixed(6),
          lng: event.latlng.lng.toFixed(6),
        });
      });
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.map) return;
    if (changes['latitude'] || changes['longitude']) {
      this.renderMarker();
    }
  }

  ngOnDestroy(): void {
    this.map?.remove();
  }

  clearPosition(): void {
    this.positionCleared.emit();
  }

  private currentLatLng(): L.LatLngExpression | null {
    const lat = parseFloat(this.latitude ?? '');
    const lng = parseFloat(this.longitude ?? '');
    if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
    return [lat, lng];
  }

  private renderMarker(): void {
    if (!this.map) return;
    if (this.marker) {
      this.map.removeLayer(this.marker);
      this.marker = null;
    }
    const latLng = this.currentLatLng();
    if (!latLng) return;
    this.marker = L.marker(latLng, { icon: LOCATION_PIN_ICON }).addTo(this.map);
    this.map.setView(latLng, 16);
  }
}
