import {ChangeDetectionStrategy, Component, inject, Input, OnInit, EventEmitter, Output} from '@angular/core';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {forkJoin} from 'rxjs';
import {InvoicesService} from '../invoices/invoices.service';
import {Invoice} from '../invoices/entity/invoice.entity';
import {SpendingService} from '../spending/spending.service';
import type {YearSpending} from '../spending/spending.model';
import {EntityNavigatorService} from '../../core/services/entity-navigator.service';
import {DateHelper} from '../../core/helpers/date.helper';
import {InvoicesTabComponent} from '../invoices/invoices-tab.component';

interface Row {
  invoiceId: number;
  number: string;
  iso: string;
  period: string;
  consumption: number | null;
  amount: number;
  chapter: string;
}

type ChapterRef = {chapter_code?: string | null; article?: number | string | null} | null | undefined;
const chapterCode = (c: ChapterRef): string => (c?.chapter_code ? `${c.chapter_code}/${c.article ?? 0}` : '');

const dateIt = (iso: string | null | undefined): string => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');
const eur = (n: number): string => n.toLocaleString('it-IT', {style: 'currency', currency: 'EUR'});

// Data fattura come 'AAAA-MM-GG': stringa così com'è, oppure il giorno locale
// del Date creato da class-transformer (mezzanotte UTC = stesso giorno in Italia).
const isoOf = (v: Date | string | null | undefined): string =>
  !v ? '' : typeof v === 'string' ? v.slice(0, 10) : (DateHelper.toLocalIsoString(v) ?? '');

// Tab "Fatture" della scheda utenza: una riga per fattura, periodo e capitolo (le righe
// della stessa bolletta, es. energia, trasporto, oneri e imposte, sommate) e totale per anno.
// Nessuna riga sull'utenza: le fatture dei suoi contratti (es. canoni di contratto).
@Component({
  selector: 'app-utility-invoices-tab',
  standalone: true,
  imports: [MatButtonModule, MatIconModule, InvoicesTabComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    @if (canEdit) {
      <div class="invoices-actions">
        <button mat-stroked-button type="button" (click)="newInvoice()"><mat-icon>add</mat-icon> Nuova fattura</button>
      </div>
    }
    @if (years.length && rows.length) {
      <p class="spending-years">
        @for (y of years; track y.year) {
          <span><strong>{{ y.year }}</strong>: {{ eur(y.total) }} ({{ y.invoices }} {{ y.invoices === 1 ? 'fattura' : 'fatture' }})</span>
        }
      </p>
    }
    @if (!rows.length) {
      @if (loaded && contractIds.length) {
        <app-invoices-tab [contractIds]="contractIds" [showContract]="contractIds.length > 1"
                          intro="Nessuna fattura intestata a questa utenza: ecco le fatture del contratto."
                          emptyText="Nessuna fattura su questa utenza né sul suo contratto."
                          (countChange)="countChange.emit($event)"></app-invoices-tab>
      } @else if (loaded) {
        <p class="sheet-empty">Nessuna fattura su questa utenza.</p>
      }
    } @else {
      <table class="sheet-table">
        <thead><tr><th>Data</th><th>Numero</th><th>Periodo</th><th>Consumo</th><th>Importo</th><th>Capitolo</th></tr></thead>
        <tbody>
          @for (r of rows; track $index) {
            <tr class="row-clickable" (click)="open(r.invoiceId)">
              <td>{{ dateIt(r.iso) }}</td>
              <td>{{ r.number }}</td>
              <td>{{ r.period }}</td>
              <td>{{ r.consumption === null ? '' : r.consumption.toLocaleString('it-IT') }}</td>
              <td>{{ eur(r.amount) }}</td>
              <td>{{ r.chapter }}</td>
            </tr>
          }
        </tbody>
      </table>
    }
  `,
  styles: [`
    .spending-years { display: flex; gap: 24px; flex-wrap: wrap; margin: 0 0 12px; }
    .invoices-actions { display: flex; justify-content: flex-end; margin-bottom: 8px; }
  `],
})
export class UtilityInvoicesTabComponent implements OnInit {
  @Input({required: true}) utilityId!: number;
  @Input() canEdit = false;
  // Contratto aperto dell'utenza (se uno solo): precompila la nuova fattura.
  @Input() contractId: number | null = null;
  // Tutti i contratti dell'utenza: le loro fatture se l'utenza non ne ha di proprie.
  @Input() contractIds: number[] = [];
  // Capitolo dell'utenza: per le fatture senza un'unica quota d'impegno.
  @Input() utilityChapter: ChapterRef = null;
  // Numero di fatture dell'utenza, per il conteggio sull'etichetta del tab.
  @Output() countChange = new EventEmitter<number>();

  private invoices = inject(InvoicesService);
  private spending = inject(SpendingService);
  private navigator = inject(EntityNavigatorService);

  rows: Row[] = [];
  loaded = false;
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
        const rows = (list as Invoice[])
          .flatMap(inv => {
            // Capitolo dalla quota d'impegno della fattura se unica, altrimenti dall'utenza.
            const shares = inv.commitmentShares ?? [];
            const share = shares.length === 1 ? shares[0] : null;
            const chapter = share?.commitment?.budgetChapter
              ? `${chapterCode(share.commitment.budgetChapter)} (${share.fiscal_year})`
              : chapterCode(this.utilityChapter);
            return (inv.lines ?? [])
              .filter(l => l.utility_id_fk === this.utilityId)
              .map(l => ({
                invoiceId: inv.id,
                number: inv.invoice_id,
                iso: isoOf(inv.invoice_date),
                period: l.period_start || l.period_end ? `${dateIt(l.period_start)} – ${dateIt(l.period_end)}` : '',
                consumption: l.consumption !== null && l.consumption !== undefined ? Number(l.consumption) : null,
                amount: Number(l.amount),
                chapter,
              }));
          });
        const grouped = new Map<string, Row>();
        for (const r of rows) {
          const key = `${r.invoiceId}|${r.period}|${r.chapter}`;
          const same = grouped.get(key);
          if (!same) {
            grouped.set(key, {...r});
            continue;
          }
          same.amount = Math.round((same.amount + r.amount) * 100) / 100;
          if (r.consumption !== null) same.consumption = (same.consumption ?? 0) + r.consumption;
        }
        this.rows = [...grouped.values()].sort((a, b) => b.iso.localeCompare(a.iso));
        this.loaded = true;
        // Senza righe proprie il conteggio arriva dal tab delle fatture del contratto.
        if (this.rows.length || !this.contractIds.length) {
          this.countChange.emit(new Set(this.rows.map(r => r.invoiceId)).size);
        }
      });
  }

  newInvoice(): void {
    this.navigator.createInvoice({
      contratto_id_fk: this.contractId,
      lines: [{amount: 0, utility_id_fk: this.utilityId, period_start: null, period_end: null,
        consumption: null, supply_code: null, description: null}],
    }).subscribe(inv => {
      if (inv) this.load();
    });
  }

  open(id: number): void {
    this.navigator.openInvoice(id).subscribe(saved => {
      if (saved) this.load();
    });
  }
}
