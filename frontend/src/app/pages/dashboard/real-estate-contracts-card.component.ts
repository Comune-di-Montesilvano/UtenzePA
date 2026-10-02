import {ChangeDetectionStrategy, Component, inject, OnInit} from '@angular/core';
import {Router} from '@angular/router';
import {MatCardModule} from '@angular/material/card';
import {MatButtonModule} from '@angular/material/button';
import {UtilizerGrantService} from '../utilizer-grant/utilizer-grant.service';
import {ContractAlert, ContractSummary, formatEuro} from '../utilizer-grant/real-estate-contract.model';

@Component({
  selector: 'app-real-estate-contracts-card',
  standalone: true,
  imports: [MatCardModule, MatButtonModule],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <mat-card>
      <mat-card-header style="padding: 1.25rem;">
        <mat-card-title style="font-size: 1.1rem;">Contratti immobiliari</mat-card-title>
        <mat-card-subtitle>Disdette, scadenze e canoni annui dei contratti attivi</mat-card-subtitle>
      </mat-card-header>
      <mat-card-content>
        @if (s) {
          <div style="display:flex; flex-wrap:wrap; gap:0.75rem;">
            @for (a of alerts; track a.key) {
              <button mat-stroked-button (click)="open(a.key)" [disabled]="s[a.count] === 0"
                      [style.color]="s[a.count] > 0 ? a.color : null">
                {{ s[a.count] }} {{ a.label }}
              </button>
            }
          </div>
          <div style="display:flex; gap:1.5rem; margin-top:1rem;">
            <span>Entrate annue: <strong>{{ euro(s.annual_income) }}</strong></span>
            <span>Uscite annue: <strong>{{ euro(s.annual_expense) }}</strong></span>
          </div>
        }
      </mat-card-content>
    </mat-card>
  `,
})
export class RealEstateContractsCardComponent implements OnInit {
  private service = inject(UtilizerGrantService);
  private router = inject(Router);

  readonly euro = formatEuro;
  readonly alerts: {key: ContractAlert; count: keyof ContractSummary; label: string; color: string}[] = [
    {key: 'notice', count: 'notice', label: 'disdette da inviare entro 60 giorni', color: '#b91c1c'},
    {key: 'expiring', count: 'expiring', label: 'in scadenza entro 4 mesi', color: '#92400e'},
    {key: 'expired_active', count: 'expired_active', label: 'scaduti ancora attivi', color: '#b91c1c'},
  ];
  s: ContractSummary | null = null;

  ngOnInit(): void {
    this.service.summary().subscribe({
      next: s => this.s = s,
      error: err => console.error('Errore riepilogo contratti immobiliari:', err),
    });
  }

  open(alert: ContractAlert): void {
    this.router.navigate(['/utilizer-grant'], {queryParams: {alert}});
  }
}
