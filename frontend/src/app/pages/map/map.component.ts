import { Component, OnInit, AfterViewInit, OnDestroy, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormControl } from '@angular/forms';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog } from '@angular/material/dialog';
import * as L from 'leaflet';
import 'leaflet.markercluster';
import { MapService } from './map.service';
import { MapPoint, UngeolocatedItem, UNGEOLOCATED_REASON_LABELS } from './map-point.entity';
import { FilterableSelectComponent } from '../../core/components/filterable-select.component';
import { AssetAggregatorsService } from '../asset-aggregator/asset-aggregator.service';
import { UtilityTypesService } from '../utility-types/utility-types.service';
import { AssetService } from '../assets/asset.service';
import { UtilityService } from '../utilities/utility.service';
import { AssetEditDialogComponent } from '../assets/asset-edit-dialog.component';
import { UtilityEditDialogComponent } from '../utilities/utility-edit-dialog.component';
import { TOption } from '../../core/types/option.interface';

const ICON_COLORS: Record<MapPoint['source'], string> = {
  gps: '#1565c0',
  geocoded: '#ef6c00',
};

// Width dialog edit: la mappa apre gli stessi AssetEditDialogComponent/
// UtilityEditDialogComponent usati dalle tabelle — stesso valore del default
// AbstractDataTableComponent.editDialogWidth() (MatDialog clampa a 560px se
// non passato esplicitamente, vedi CLAUDE.md).
const EDIT_DIALOG_WIDTH = '1150px';

@Component({
  selector: 'app-map',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatCheckboxModule, FilterableSelectComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './map.component.html',
  styleUrls: ['./map.component.scss'],
})
export class MapComponent implements OnInit, AfterViewInit, OnDestroy {
  private mapService = inject(MapService);
  private dialog = inject(MatDialog);
  private assetAggregatorsService = inject(AssetAggregatorsService);
  private utilityTypesService = inject(UtilityTypesService);
  private assetService = inject(AssetService);
  private utilityService = inject(UtilityService);

  private map: L.Map | null = null;
  private clusterGroup: L.MarkerClusterGroup | null = null;

  showAssets = new FormControl(true, { nonNullable: true });
  showUtilities = new FormControl(true, { nonNullable: true });
  assetAggregatorId = new FormControl<number | null>(null);
  utilityTypeId = new FormControl<number | null>(null);

  assetAggregatorOptions: TOption[] = [];
  utilityTypeOptions: TOption[] = [];
  ungeolocated: UngeolocatedItem[] = [];
  reasonLabels = UNGEOLOCATED_REASON_LABELS;

  ngOnInit(): void {
    this.assetAggregatorsService.search({ deleted: false }).subscribe({
      next: (data) => (this.assetAggregatorOptions = data.map((a) => ({ label: a.code ?? '', value: a.id }))),
    });
    this.utilityTypesService.search({ deleted: false }).subscribe({
      next: (data) => (this.utilityTypeOptions = data.map((t) => ({ label: t.name, value: t.id }))),
    });

    this.showAssets.valueChanges.subscribe(() => this.reload());
    this.showUtilities.valueChanges.subscribe(() => this.reload());
    this.assetAggregatorId.valueChanges.subscribe(() => this.reload());
    this.utilityTypeId.valueChanges.subscribe(() => this.reload());
  }

  ngAfterViewInit(): void {
    this.map = L.map('map-canvas').setView([42.5083, 14.15], 13); // Montesilvano
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(this.map);
    this.clusterGroup = L.markerClusterGroup();
    this.map.addLayer(this.clusterGroup);
    this.reload();
  }

  ngOnDestroy(): void {
    this.map?.remove();
  }

  private reload(): void {
    this.mapService
      .getPoints({
        showAssets: this.showAssets.value,
        showUtilities: this.showUtilities.value,
        assetAggregatorId: this.assetAggregatorId.value,
        utilityTypeId: this.utilityTypeId.value,
      })
      .subscribe({
        next: (response) => {
          this.renderPoints(response.points);
          this.ungeolocated = response.ungeolocated;
        },
        error: (err) => console.error('Errore nel caricamento dei punti mappa:', err),
      });
  }

  private renderPoints(points: MapPoint[]): void {
    if (!this.clusterGroup) return;
    this.clusterGroup.clearLayers();

    for (const point of points) {
      const lat = parseFloat(point.lat);
      const lng = parseFloat(point.lng);
      if (Number.isNaN(lat) || Number.isNaN(lng)) continue;

      const icon = L.divIcon({
        className: '',
        html: `<span class="map-pin map-pin--${point.type}" style="background:${ICON_COLORS[point.source]}"></span>`,
        iconSize: [24, 24],
      });

      const marker = L.marker([lat, lng], { icon });
      marker.on('click', () => this.openDetail(point));
      this.clusterGroup.addLayer(marker);
    }
  }

  openDetail(point: MapPoint | UngeolocatedItem): void {
    if (point.type === 'asset') {
      this.assetService.getById(point.id).subscribe((asset) => {
        this.dialog.open(AssetEditDialogComponent, {
          width: EDIT_DIALOG_WIDTH,
          maxWidth: EDIT_DIALOG_WIDTH,
          data: { mode: 'edit', item: asset },
        });
      });
    } else {
      this.utilityService.getById(point.id).subscribe((utility) => {
        this.dialog.open(UtilityEditDialogComponent, {
          width: EDIT_DIALOG_WIDTH,
          maxWidth: EDIT_DIALOG_WIDTH,
          data: { mode: 'edit', item: utility },
        });
      });
    }
  }
}
