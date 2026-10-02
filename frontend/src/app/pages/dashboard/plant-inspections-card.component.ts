import {ChangeDetectionStrategy, Component, inject, OnInit} from '@angular/core';
import {Router} from '@angular/router';
import {MatCardModule} from '@angular/material/card';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {PlantService} from '../plants/plant.service';
import {PLANT_TYPE_ICON, PLANT_TYPE_LABEL, PlantSummary, PlantType} from '../plants/plant.model';

@Component({
  selector: 'app-plant-inspections-card',
  standalone: true,
  imports: [MatCardModule, MatButtonModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <mat-card>
      <mat-card-header style="padding: 1.25rem;">
        <mat-card-title style="font-size: 1.1rem;">Verifiche impianti</mat-card-title>
        <mat-card-subtitle>Verifiche periodiche scadute o in scadenza entro 60 giorni</mat-card-subtitle>
      </mat-card-header>
      <mat-card-content>
        @if (s) {
          <div style="display:flex; flex-wrap:wrap; gap:0.75rem;">
            <button mat-stroked-button (click)="open('overdue')" [disabled]="s.inspections_overdue === 0"
                    [style.color]="s.inspections_overdue > 0 ? '#b91c1c' : null">
              {{ s.inspections_overdue }} impianti con verifiche scadute
            </button>
            <button mat-stroked-button (click)="open('due_soon')" [disabled]="s.inspections_due_soon === 0"
                    [style.color]="s.inspections_due_soon > 0 ? '#92400e' : null">
              {{ s.inspections_due_soon }} in scadenza entro 60 giorni
            </button>
          </div>
          <div style="display:flex; flex-wrap:wrap; gap:1rem; margin-top:1rem; color:#4b5563; font-size:0.9rem;">
            @for (t of topTypes(); track t.type) {
              <span><mat-icon style="vertical-align: middle; font-size: 18px; height: 18px; width: 18px;">{{ icon[t.type] }}</mat-icon>
                {{ t.count }} {{ label[t.type].toLowerCase() }}</span>
            }
          </div>
        }
      </mat-card-content>
    </mat-card>
  `,
})
export class PlantInspectionsCardComponent implements OnInit {
  private service = inject(PlantService);
  private router = inject(Router);

  readonly icon = PLANT_TYPE_ICON;
  readonly label = PLANT_TYPE_LABEL;
  s: PlantSummary | null = null;

  ngOnInit(): void {
    this.service.summary().subscribe({
      next: s => this.s = s,
      error: err => console.error('Errore riepilogo impianti:', err),
    });
  }

  topTypes(): {type: PlantType; count: number}[] {
    return Object.entries(this.s?.by_type ?? {})
      .map(([type, count]) => ({type: type as PlantType, count: count ?? 0}))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }

  open(inspection: 'overdue' | 'due_soon'): void {
    this.router.navigate(['/plants'], {queryParams: {inspection}});
  }
}
