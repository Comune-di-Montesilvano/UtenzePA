import {AccountingStateService} from '../../../core/services/accounting-state.service';
import {ChangeDetectionStrategy, Component, EventEmitter, inject, Input, OnChanges, OnInit, Output, SimpleChanges} from '@angular/core';
import {MatIconModule} from '@angular/material/icon';
import {MatTooltipModule} from '@angular/material/tooltip';
import {forkJoin} from 'rxjs';
import {LinkedColumn, LinkedTableComponent} from '../../../core/components/entity-sheet/linked-table.component';
import type {StatusInfo} from '../../../core/helpers/entity-status';
import {EntityNavigatorService} from '../../../core/services/entity-navigator.service';
import {ToastService} from '../../../core/services/toast.service';
import type {TOption} from '../../../core/types/option.interface';
import {chapterLabel, Commitment, competenceLabel} from '../../commitments/commitment.model';
import {CommitmentService} from '../../commitments/commitment.service';
import {SpendingService} from '../../spending/spending.service';
import type {ChapterSummary} from '../../spending/spending.model';

const eur = (n: number | null | undefined): string =>
  n === null || n === undefined ? '—' : n.toLocaleString('it-IT', {style: 'currency', currency: 'EUR'});

// Tab "Impegni e capitoli" della scheda contratto di fornitura: riepilogo per
// capitolo (calcolato) e impegni collegati (N-N, si aprono nella loro scheda).
@Component({
  selector: 'app-contract-commitments-tab',
  standalone: true,
  imports: [MatIconModule, MatTooltipModule, LinkedTableComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <h3 class="sheet-section-title">Capitoli</h3>
    @if (!summary.length) {
      <p class="sheet-empty">Nessuna utenza attiva né impegno su questo contratto.</p>
    } @else {
      <table class="sheet-table">
        <thead><tr><th>Capitolo</th><th>Utenze attive</th><th>Impegnato</th><th>Speso da fatture</th></tr></thead>
        <tbody>
          @for (row of summary; track row.budget_chapter_id) {
            <tr [class.row-warning]="uncommitted(row)">
              <td>
                {{ label(row) }}
                @if (uncommitted(row)) {
                  <mat-icon class="inline-icon" matTooltip="Capitolo delle utenze senza impegno sul contratto">warning</mat-icon>
                }
              </td>
              <td>{{ row.utilities }}</td>
              <td>{{ committedText(row) }}</td>
              <td>{{ spentText(row) }}</td>
            </tr>
          }
        </tbody>
      </table>
    }

    <h3 class="sheet-section-title" style="margin-top: 20px;">Impegni</h3>
    <app-linked-table [columns]="columns" [rows]="commitments" [rowStatus]="status"
                      [addOptions]="canEdit ? addOptions : null" addLabel="Collega impegno"
                      [unlinkable]="canEdit" itemLabel="l'impegno"
                      [createLabel]="canEdit && !accountingActive ? 'Nuovo impegno' : null" (create)="create()"
                      (add)="link($event)" (unlink)="unlink($event)" (open)="open($event)"
                      emptyText="Nessun impegno collegato."></app-linked-table>
  `,
})
export class ContractCommitmentsTabComponent implements OnInit, OnChanges {
  // Import della contabilità acceso: impegni e capitoli solo dalla contabilità.
  accountingActive = false;
  private accountingSub = inject(AccountingStateService).active$.subscribe(a => (this.accountingActive = a));
  @Input({required: true}) contractId!: number;
  @Input() supplierId: number | null = null;
  @Input() canEdit = false;
  @Output() changed = new EventEmitter<number>();

  private commitmentService = inject(CommitmentService);
  private spending = inject(SpendingService);
  private navigator = inject(EntityNavigatorService);
  private toast = inject(ToastService);

  // Campi cache (vedi LinkedTableComponent): aggiornati solo su evento.
  commitments: Commitment[] = [];
  addOptions: TOption[] = [];
  summary: ChapterSummary[] = [];

  readonly columns: LinkedColumn<Commitment>[] = [
    {label: 'Numero', value: c => c.label},
    {label: 'Competenza', value: c => competenceLabel(c)},
    {label: 'Capitolo', value: c => c.chapter_label},
    {label: 'Importo', value: c => (c.amount === null ? 'senza importo' : eur(c.amount))},
    {label: 'Rimanenza', value: c => eur(c.remaining)},
  ];

  readonly status = (c: Commitment): StatusInfo | null =>
    c.remaining !== null && c.remaining < 0 ? {tone: 'danger', label: 'Sforato', icon: 'report'} : null;

  ngOnInit(): void {
    this.load();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['supplierId'] && !changes['supplierId'].firstChange) this.loadOptions();
  }

  load(): void {
    forkJoin([this.commitmentService.byContract(this.contractId), this.spending.contractChapters(this.contractId)])
      .subscribe(([commitments, summary]) => {
        this.commitments = commitments.filter(c => !c.deleted);
        this.summary = summary;
        this.changed.emit(this.commitments.length);
        this.loadOptions();
      });
  }

  // Collegabili: impegni del fornitore del contratto non ancora collegati.
  private loadOptions(): void {
    if (!this.canEdit || !this.supplierId) {
      this.addOptions = [];
      return;
    }
    const linked = new Set(this.commitments.map(c => c.id));
    this.commitmentService.search({supplier_id: this.supplierId, deleted: false} as never).subscribe({
      next: list => this.addOptions = list
        .filter(c => !linked.has(c.id))
        .map(c => ({label: `${c.label} · competenza ${competenceLabel(c)}`, value: c.id, sublabel: c.chapter_label})),
      error: err => console.error('Errore nel caricamento degli impegni del fornitore:', err),
    });
  }

  label(row: ChapterSummary): string {
    return chapterLabel(row);
  }

  // Capitolo delle utenze del contratto senza alcun impegno censito.
  uncommitted(row: ChapterSummary): boolean {
    return row.budget_chapter_id !== null && row.utilities > 0 && !row.committed.length;
  }

  committedText(row: ChapterSummary): string {
    return row.committed.length
      ? row.committed.map(c => `${c.year}${c.amount !== null ? ': ' + eur(c.amount) : ''}`).join(' · ')
      : '—';
  }

  spentText(row: ChapterSummary): string {
    return row.spent.length ? row.spent.map(s => `${s.year}: ${eur(s.total)}`).join(' · ') : '—';
  }

  create(): void {
    this.navigator.createCommitment({contract_ids: [this.contractId], supplier_id_fk: this.supplierId}).subscribe(c => {
      if (c) this.load();
    });
  }

  open(c: Commitment): void {
    this.navigator.openCommitment(c.id).subscribe(saved => {
      if (saved) this.load();
    });
  }

  link(id: number): void {
    this.commitmentService.getById(id).subscribe(c => this.saveContracts(c, [...c.contract_ids, this.contractId]));
  }

  unlink(id: number): void {
    const c = this.commitments.find(x => x.id === id);
    if (c) this.saveContracts(c, c.contract_ids.filter(x => x !== this.contractId));
  }

  private saveContracts(c: Commitment, contractIds: number[]): void {
    this.commitmentService.update(c.id, {contract_ids: [...new Set(contractIds)]} as Partial<Commitment>).subscribe({
      next: () => this.load(),
      error: err => this.toast.add({severity: 'error', summary: 'Impegno non aggiornato', detail: err?.error?.message}),
    });
  }
}
