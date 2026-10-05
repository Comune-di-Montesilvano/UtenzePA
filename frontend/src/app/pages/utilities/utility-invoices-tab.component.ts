import {ChangeDetectionStrategy, Component, inject, Input, OnInit} from '@angular/core';
import {forkJoin} from 'rxjs';
import {InvoicesService} from '../invoices/invoices.service';
import {Invoice} from '../invoices/entity/invoice.entity';
import {SpendingService} from '../spending/spending.service';
import type {YearSpending} from '../spending/spending.model';
import {EntityNavigatorService} from '../../core/services/entity-navigator.service';
import {DateHelper} from '../../core/helpers/date.helper';

interface Row {
  invoiceId: number;
  number: string;
  iso: string;
  period: string;
  consumption: string;
  amount: number;
  chapter: string;
}

const dateIt = (iso: string | null | undefined): string => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');
const eur = (n: number): string => n.toLocaleString('it-IT', {style: 'currency', currency: 'EUR'});

// Data fattura come 'AAAA-MM-GG': stringa così com'è, oppure il giorno locale
// del Date creato da class-transformer (mezzanotte UTC = stesso giorno in Italia).
const isoOf = (v: Date | string | null | undefined): string =>
  !v ? '' : typeof v === 'string' ? v.slice(0, 10) : (DateHelper.toLocalIsoString(v) ?? '');

// Tab "Fatture" della scheda utenza: righe di fattura dell'utenza e totale per anno.
@Component({
  selector: 'app-utility-invoices-tab',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    @if (years.length) {
      <p class="spending-years">
        @for (y of years; track y.year) {
          <span><strong>{{ y.year }}</strong>: {{ eur(y.total) }} ({{ y.invoices }} {{ y.invoices === 1 ? 'fattura' : 'fatture' }})</span>
        }
      </p>
    }
    @if (!rows.length) {
      <p class="sheet-empty">Nessuna fattura su questa utenza.</p>
    } @else {
      <table class="sheet-table">
        <thead><tr><th>Data</th><th>Numero</th><th>Periodo</th><th>Consumo</th><th>Importo</th><th>Impegno</th></tr></thead>
        <tbody>
          @for (r of rows; track $index) {
            <tr class="row-clickable" (click)="open(r.invoiceId)">
              <td>{{ dateIt(r.iso) }}</td>
              <td>{{ r.number }}</td>
              <td>{{ r.period }}</td>
              <td>{{ r.consumption }}</td>
              <td>{{ eur(r.amount) }}</td>
              <td>{{ r.chapter }}</td>
            </tr>
          }
        </tbody>
      </table>
    }
  `,
  styles: [`.spending-years { display: flex; gap: 24px; flex-wrap: wrap; margin: 0 0 12px; }`],
})
export class UtilityInvoicesTabComponent implements OnInit {
  @Input({required: true}) utilityId!: number;

  private invoices = inject(InvoicesService);
  private spending = inject(SpendingService);
  private navigator = inject(EntityNavigatorService);

  rows: Row[] = [];
  years: YearSpending[] = [];
  readonly eur = eur;
  readonly dateIt = dateIt;

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    forkJoin([this.invoices.search({utility_id: this.utilityId} as never), this.spending.utility(this.utilityId)])
      .subscribe(([list, years]) => {
        this.years = years;
        this.rows = (list as Invoice[])
          .flatMap(inv => (inv.lines ?? [])
            .filter(l => l.utility_id_fk === this.utilityId)
            .map(l => ({
              invoiceId: inv.id,
              number: inv.invoice_id,
              iso: isoOf(inv.invoice_date),
              period: l.period_start || l.period_end ? `${dateIt(l.period_start)} – ${dateIt(l.period_end)}` : '',
              consumption: l.consumption !== null && l.consumption !== undefined ? Number(l.consumption).toLocaleString('it-IT') : '',
              amount: Number(l.amount),
              chapter: l.commitment?.budgetChapter
                ? `${l.commitment.budgetChapter.chapter_code}/${l.commitment.budgetChapter.article ?? 0} (${l.commitment.fiscal_year})`
                : '',
            })))
          .sort((a, b) => b.iso.localeCompare(a.iso));
      });
  }

  open(id: number): void {
    this.navigator.openInvoice(id).subscribe(saved => {
      if (saved) this.load();
    });
  }
}
