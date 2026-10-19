import {ChangeDetectionStrategy, Component, inject} from '@angular/core';
import {ActivatedRoute, Router} from '@angular/router';
import {MatTabsModule} from '@angular/material/tabs';
import {InvoiceImportTabComponent} from './invoice-import-tab.component';
import {InvoicePatternsTabComponent} from './invoice-patterns-tab.component';

const TABS = ['motore', 'pattern'];

// Impostazioni → Import fatture: motore di lettura della PEC SDI e pattern per fornitore.
@Component({
  selector: 'app-invoice-import-page',
  standalone: true,
  imports: [MatTabsModule, InvoiceImportTabComponent, InvoicePatternsTabComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <div style="padding: 1rem;">
      <h2 style="margin: 0 0 0.5rem;">Import fatture</h2>
      <mat-tab-group [selectedIndex]="selected" (selectedIndexChange)="select($event)">
        <mat-tab label="Motore" aria-label="Motore">
          <ng-template matTabContent><app-invoice-import-tab></app-invoice-import-tab></ng-template>
        </mat-tab>
        <mat-tab label="Pattern" aria-label="Pattern">
          <ng-template matTabContent><app-invoice-patterns-tab></app-invoice-patterns-tab></ng-template>
        </mat-tab>
      </mat-tab-group>
    </div>
  `,
})
export class InvoiceImportPageComponent {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  selected = Math.max(0, TABS.indexOf(this.route.snapshot.queryParamMap.get('tab') ?? ''));

  select(index: number): void {
    this.selected = index;
    this.router.navigate([], {queryParams: {tab: TABS[index]}, replaceUrl: true});
  }
}
