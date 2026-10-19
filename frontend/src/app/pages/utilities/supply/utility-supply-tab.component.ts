import {ChangeDetectionStrategy, Component, EventEmitter, inject, Input, OnInit, Output} from '@angular/core';
import {MatDialog} from '@angular/material/dialog';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatTooltipModule} from '@angular/material/tooltip';
import {catchError, map, Observable, of, tap} from 'rxjs';
import {ConfirmDialogComponent, ConfirmDialogData} from '../../../core/components/confirm-dialog.component';
import {dateIt} from '../../../core/components/entity-sheet/sheet-utils';
import {EntityNavigatorService} from '../../../core/services/entity-navigator.service';
import {ToastService} from '../../../core/services/toast.service';
import {partyName} from '../../../core/helpers/party-name.helper';
import type {TOption} from '../../../core/types/option.interface';
import {ThirdPartiesService} from '../../third-parties/third-parties.service';
import {SupplyService} from './supply.service';
import {SUPPLY_EVENT_LABEL, SupplyEvent, SupplyEventsList} from './supply.model';
import {errorText, SupplyEventDialogComponent, SupplyEventDialogData} from './supply-event-dialog.component';

// Riga della tabella: campi cache calcolati al caricamento.
interface Row {
  event: SupplyEvent;
  type: string;
  holder: string;
  requested: string;
  effective: string;
  cancelled: string;
  pending: boolean;
  automatic: boolean;
}

const isPending = (e: SupplyEvent): boolean => !e.cancelled_on && !e.effective_on && !e.date_unknown;

// Tab «Attivazioni e volture» della scheda utenza: storico dei cambiamenti
// (attivazioni, cessazioni, volture, reintestazioni). Ogni modifica emette
// `changed`: la scheda ricarica l'utenza per stato e Riepilogo.
@Component({
  selector: 'app-utility-supply-tab',
  standalone: true,
  imports: [MatButtonModule, MatIconModule, MatTooltipModule],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    @for (w of warnings; track w) {
      <div class="sheet-alert tone-warn supply-warning"><mat-icon>warning</mat-icon><span>{{ w }}</span></div>
    }
    @if (canEdit) {
      <div class="supply-actions">
        <button mat-stroked-button type="button" (click)="edit(null)"><mat-icon>add</mat-icon> Nuovo cambiamento</button>
      </div>
    }
    @if (!rows.length) {
      <p class="sheet-empty">Nessun cambiamento registrato.</p>
    } @else {
      <table class="sheet-table">
        <thead>
          <tr>
            <th>Tipo</th><th>Intestatario</th><th>Richiesta</th><th>Effettiva</th><th>Note</th><th>Contratto</th>
            @if (canEdit) { <th></th> }
          </tr>
        </thead>
        <tbody>
          @for (r of rows; track r.event.id) {
            <tr [class.row-warning]="r.pending" [class.row-cancelled]="!!r.cancelled">
              <td><span class="struck">{{ r.type }}</span></td>
              <td><span class="struck">{{ r.holder }}</span></td>
              <td><span class="struck">{{ r.requested }}</span></td>
              <td>
                <span class="struck">{{ r.effective }}</span>
                @if (r.cancelled) {
                  <div class="sheet-hint">annullato il {{ r.cancelled }}</div>
                }
              </td>
              <td class="notes"><span class="struck">{{ r.event.notes || '' }}</span></td>
              <td>
                @if (r.event.utilizer_grant_id_fk; as grantId) {
                  <a href="javascript:void(0)" (click)="openGrant(grantId)" matTooltip="Apri il contratto immobiliare">{{ r.event.grant_label || ('Contratto #' + grantId) }}</a>
                }
              </td>
              @if (canEdit) {
                <td class="row-actions">
                  @if (!r.cancelled) {
                    <button mat-icon-button type="button" aria-label="Modifica cambiamento" matTooltip="Modifica" (click)="edit(r.event)"><mat-icon>edit</mat-icon></button>
                    @if (r.automatic) {
                      <span class="sheet-hint">Gestita dal contratto</span>
                    } @else {
                      @if (r.pending) {
                        <button mat-icon-button type="button" aria-label="Annulla cambiamento" matTooltip="Annulla" (click)="cancelEvent(r)"><mat-icon>block</mat-icon></button>
                      }
                      <button mat-icon-button type="button" aria-label="Elimina cambiamento" matTooltip="Elimina" (click)="remove(r)"><mat-icon>delete</mat-icon></button>
                    }
                  } @else if (!r.automatic) {
                    <button mat-icon-button type="button" aria-label="Elimina cambiamento" matTooltip="Elimina" (click)="remove(r)"><mat-icon>delete</mat-icon></button>
                  }
                </td>
              }
            </tr>
          }
        </tbody>
      </table>
    }
  `,
  styles: [`
    .supply-actions { display: flex; justify-content: flex-end; margin-bottom: 8px; }
    .supply-warning { display: flex; align-items: center; gap: 8px; }
    .supply-warning mat-icon { flex: none; }
    .row-actions { white-space: nowrap; text-align: right; }
    .row-actions .sheet-hint { margin-left: 4px; }
    td.notes { white-space: pre-wrap; }
    tr.row-cancelled .struck { text-decoration: line-through; color: var(--sheet-muted); }
  `],
})
export class UtilitySupplyTabComponent implements OnInit {
  @Input({required: true}) utilityId!: number;
  @Input() canEdit = false;
  // Dopo ogni modifica: la scheda ricarica l'utenza.
  @Output() changed = new EventEmitter<void>();
  // Cambiamenti in sospeso, per il badge sull'etichetta del tab.
  @Output() pendingCount = new EventEmitter<number>();

  private supply = inject(SupplyService);
  private thirdParties = inject(ThirdPartiesService);
  private navigator = inject(EntityNavigatorService);
  private dialog = inject(MatDialog);
  private toast = inject(ToastService);

  rows: Row[] = [];
  warnings: string[] = [];
  private holderOptions: TOption[] | null = null;

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.supply.events(this.utilityId).subscribe({
      next: list => this.apply(list),
      error: err => console.error('Errore nel caricamento dello storico utenza:', err),
    });
  }

  private apply(list: SupplyEventsList): void {
    this.warnings = list.warnings ?? [];
    this.rows = list.events.map(e => ({
      event: e,
      type: SUPPLY_EVENT_LABEL[e.type] ?? e.type,
      holder: e.type === 'TRANSFER' ? (e.third_party_name ?? '') : e.type === 'RETURN' ? 'Comune' : '',
      requested: dateIt(e.requested_on),
      effective: e.date_unknown ? 'data non nota' : dateIt(e.effective_on),
      cancelled: dateIt(e.cancelled_on),
      pending: isPending(e),
      automatic: e.utilizer_grant_id_fk != null,
    }));
    this.pendingCount.emit(this.rows.filter(r => r.pending).length);
  }

  private afterChange(list: SupplyEventsList | null): void {
    if (list) this.apply(list);
    else this.load();
    this.changed.emit();
  }

  // Soggetti terzi caricati alla prima apertura del dialog.
  private loadHolderOptions(): Observable<TOption[]> {
    if (this.holderOptions) return of(this.holderOptions);
    return this.thirdParties.search({deleted: false}).pipe(
      map(list => list
        .map(tp => ({value: tp.id, label: partyName(tp)}))
        .sort((a, b) => a.label.localeCompare(b.label))),
      tap(options => (this.holderOptions = options)),
      catchError(err => {
        console.error('Errore caricamento soggetti terzi:', err);
        return of([] as TOption[]);
      }),
    );
  }

  edit(event: SupplyEvent | null): void {
    this.loadHolderOptions().subscribe(holderOptions => {
      // La voltura in modifica mostra il suo intestatario anche se cancellato.
      const options = event?.third_party_id_fk != null && !holderOptions.some(o => o.value === event.third_party_id_fk)
        ? [{value: event.third_party_id_fk, label: event.third_party_name ?? `#${event.third_party_id_fk}`}, ...holderOptions]
        : holderOptions;
      this.dialog.open<SupplyEventDialogComponent, SupplyEventDialogData, SupplyEventsList | undefined>(SupplyEventDialogComponent, {
        width: '560px', maxWidth: '95vw', data: {utilityId: this.utilityId, event, holderOptions: options},
      }).afterClosed().subscribe(list => {
        if (list) this.afterChange(list);
      });
    });
  }

  private describe(r: Row): string {
    const parts = [r.type.toLowerCase(), r.holder ? `a ${r.holder}` : '', r.effective || (r.requested ? `richiesta il ${r.requested}` : '')];
    return parts.filter(Boolean).join(' ');
  }

  cancelEvent(r: Row): void {
    this.confirm({
      title: 'Annulla cambiamento',
      message: `Annullare ${this.describe(r)}? Resta nello storico come annullato.`,
      confirmLabel: 'Annulla cambiamento',
      danger: true,
    }, () => this.supply.cancel(r.event.id).subscribe({
      next: list => this.afterChange(list),
      error: err => this.toast.add({severity: 'error', summary: 'Cambiamento non annullato', detail: errorText(err)}),
    }));
  }

  remove(r: Row): void {
    this.confirm({
      title: 'Elimina cambiamento',
      message: `Eliminare ${this.describe(r)}? Sparisce dallo storico.`,
      confirmLabel: 'Elimina',
      danger: true,
    }, () => this.supply.remove(r.event.id).subscribe({
      next: () => this.afterChange(null),
      error: err => this.toast.add({severity: 'error', summary: 'Cambiamento non eliminato', detail: errorText(err)}),
    }));
  }

  private confirm(data: ConfirmDialogData, then: () => void): void {
    this.dialog.open<ConfirmDialogComponent, ConfirmDialogData, boolean>(ConfirmDialogComponent, {data})
      .afterClosed().subscribe(ok => {
        if (ok) then();
      });
  }

  openGrant(id: number): void {
    this.navigator.openGrant(id).subscribe(saved => {
      // Il contratto può aver cambiato le righe automatiche.
      if (saved) this.afterChange(null);
    });
  }
}
