import {ChangeDetectionStrategy, Component, EventEmitter, inject, Input, OnChanges, Output} from '@angular/core';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {forkJoin, Observable, of} from 'rxjs';
import {InvoicesService} from './invoices.service';
import {Invoice} from './entity/invoice.entity';
import {SDI_STATUS_LABELS, SdiStatus} from './sdi-status';
import {EntityNavigatorService} from '../../core/services/entity-navigator.service';
import {DateHelper} from '../../core/helpers/date.helper';
import {groupByYear, keepOpen, SheetGroup, SheetGroupsComponent} from '../../core/components/entity-sheet/sheet-groups.component';

interface Row {
  id: number;
  number: string;
  iso: string;
  contract: string;
  period: string;
  total: number;
  rejected: boolean;
  status: string;
}

// Totale dell'anno: le rifiutate non contano.
const yearSummary = (rows: Row[]): string =>
  eur(Math.round(rows.filter(r => !r.rejected).reduce((sum, r) => sum + r.total, 0) * 100) / 100);

const dateIt = (iso: string | null | undefined): string => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');
const eur = (n: number): string => n.toLocaleString('it-IT', {style: 'currency', currency: 'EUR'});
const isoOf = (v: Date | string | null | undefined): string =>
  !v ? '' : typeof v === 'string' ? v.slice(0, 10) : (DateHelper.toLocalIsoString(v) ?? '');

// Totale della fattura: quello del documento, altrimenti la somma delle righe.
const totalOf = (inv: Invoice): number =>
  inv.total_amount !== null && inv.total_amount !== undefined
    ? Number(inv.total_amount)
    : Math.round(Number(inv.lines_total ?? 0) * 100) / 100;

// Periodo della fattura: dal primo inizio all'ultima fine delle righe (dall'elenco leggero).
const periodOf = (inv: Invoice): string =>
  inv.period_start || inv.period_end ? `${dateIt(inv.period_start)} – ${dateIt(inv.period_end)}` : '';

// Tab "Fatture" per contratto di fornitura, fornitore o contratti di un'utenza: una riga
// per fattura (anche senza righe sulle utenze, es. canoni) e totale per anno della fattura.
@Component({
  selector: 'app-invoices-tab',
  standalone: true,
  imports: [MatButtonModule, MatIconModule, SheetGroupsComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    @if (canEdit && newInvoice) {
      <div class="invoices-actions">
        <button mat-stroked-button type="button" (click)="create()"><mat-icon>add</mat-icon> Nuova fattura</button>
      </div>
    }
    @if (intro && rows.length) {
      <p class="invoices-intro">{{ intro }}</p>
    }
    @if (!rows.length) {
      <p class="sheet-empty">{{ emptyText }}</p>
    } @else {
      <app-sheet-groups [groups]="groups">
        <ng-template let-rows>
          <table class="sheet-table">
            <thead>
              <tr>
                <th>Data</th><th>Numero</th>
                @if (showContract) { <th>Contratto</th> }
                <th>Periodo</th><th>Totale</th><th>Stato SDI</th>
              </tr>
            </thead>
            <tbody>
              @for (r of rows; track r.id) {
                <tr class="row-clickable" [class.invoice-rejected]="r.rejected" (click)="open(r.id)">
                  <td>{{ dateIt(r.iso) }}</td>
                  <td>{{ r.number }}</td>
                  @if (showContract) { <td>{{ r.contract }}</td> }
                  <td>{{ r.period }}</td>
                  <td>{{ eur(r.total) }}</td>
                  <td>{{ r.status }}</td>
                </tr>
              }
            </tbody>
          </table>
        </ng-template>
      </app-sheet-groups>
    }
  `,
  styles: [`
    .invoices-actions { display: flex; justify-content: flex-end; margin-bottom: 8px; }
    .invoices-intro { margin: 0 0 12px; color: var(--app-muted); }
    .invoice-rejected td { text-decoration: line-through; color: var(--app-muted); }
  `],
})
export class InvoicesTabComponent implements OnChanges {
  // Fatture di questi contratti (testata) oppure di questo fornitore.
  @Input() contractIds: number[] = [];
  @Input() supplierId: number | null = null;
  @Input() canEdit = false;
  // Dati iniziali della nuova fattura (null = niente bottone).
  @Input() newInvoice: Partial<Invoice> | null = null;
  @Input() showContract = false;
  @Input() intro: string | null = null;
  @Input() emptyText = 'Nessuna fattura.';
  @Output() countChange = new EventEmitter<number>();

  private invoices = inject(InvoicesService);
  private navigator = inject(EntityNavigatorService);

  rows: Row[] = [];
  // Fatture per anno della fattura; in intestazione il totale (rifiutate escluse).
  groups: SheetGroup<Row>[] = [];
  readonly eur = eur;
  readonly dateIt = dateIt;

  ngOnChanges(): void {
    this.load();
  }

  load(): void {
    const requests: Observable<Invoice[]>[] = this.supplierId
      ? [this.invoices.list({supplier_id_fk: this.supplierId})]
      : this.contractIds.map(id => this.invoices.list({contratto_id_fk: id}));
    (requests.length ? forkJoin(requests) : of([] as Invoice[][])).subscribe(lists => {
      const byId = new Map<number, Invoice>();
      lists.flat().forEach(inv => byId.set(inv.id, inv));
      this.rows = [...byId.values()]
        .map(inv => ({
          id: inv.id,
          number: inv.invoice_id,
          iso: isoOf(inv.invoice_date),
          contract: inv.contratto?.cig_contract?.trim() || (inv.contratto ? `#${inv.contratto.id}` : ''),
          period: periodOf(inv),
          total: totalOf(inv),
          rejected: inv.sdi_status === SdiStatus.REJECTED,
          status: inv.sdi_status ? SDI_STATUS_LABELS[inv.sdi_status] : '',
        }))
        .sort((a, b) => b.iso.localeCompare(a.iso));
      this.groups = keepOpen(groupByYear(this.rows, r => (r.iso ? Number(r.iso.slice(0, 4)) : null), yearSummary), this.groups);
      this.countChange.emit(this.rows.length);
    });
  }

  create(): void {
    this.navigator.createInvoice(this.newInvoice ?? {}).subscribe(inv => {
      if (inv) this.load();
    });
  }

  open(id: number): void {
    this.navigator.openInvoice(id).subscribe(saved => {
      if (saved) this.load();
    });
  }
}
