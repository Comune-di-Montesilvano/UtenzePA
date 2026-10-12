import {
  ChangeDetectionStrategy, Component, EventEmitter, inject, Input, OnChanges, Output,
} from '@angular/core';
import {HttpErrorResponse} from '@angular/common/http';
import {MatIconModule} from '@angular/material/icon';
import {LinkedColumn, LinkedTableComponent} from '../../core/components/entity-sheet/linked-table.component';
import {EntityNavigatorService} from '../../core/services/entity-navigator.service';
import {ToastService} from '../../core/services/toast.service';
import {TOption} from '../../core/types/option.interface';
import {AttachmentsComponent} from '../attachments/attachments.component';
import {ActService} from './act.service';
import {Act, actTitle, LINK_IDS_FIELD} from './act.model';
import type {ActLinkEntity} from './act.model';

// Tab «Documenti» di una scheda: allegati dell'entità (file senza scheda) e
// atti collegati (delibere, determine…, con o senza testo).
@Component({
  selector: 'app-entity-documents',
  standalone: true,
  imports: [AttachmentsComponent, LinkedTableComponent, MatIconModule],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <div class="sheet-section-title"><mat-icon>attach_file</mat-icon>Allegati</div>
    <app-attachments [entityType]="entity" [entityId]="entityId" [readOnly]="readOnly"
                     (countChange)="files = $event; emitCount()"></app-attachments>

    <div class="sheet-section-title"><mat-icon>gavel</mat-icon>Atti collegati</div>
    <app-linked-table
      [columns]="columns"
      [rows]="acts"
      [addOptions]="readOnly ? null : options"
      addLabel="Collega atto"
      itemLabel="l'atto"
      [unlinkable]="!readOnly"
      emptyText="Nessun atto collegato."
      [createLabel]="readOnly ? null : 'Nuovo atto'"
      (create)="create()"
      (add)="link($event)"
      (unlink)="unlink($event)"
      (open)="open($event.id)"></app-linked-table>
  `,
})
export class EntityDocumentsComponent implements OnChanges {
  @Input({required: true}) entity!: ActLinkEntity;
  @Input({required: true}) entityId!: number;
  @Input() readOnly = false;
  @Output() countChange = new EventEmitter<number>();

  private service = inject(ActService);
  private navigator = inject(EntityNavigatorService);
  private toast = inject(ToastService);

  acts: Act[] = [];
  options: TOption[] = [];
  files = 0;

  readonly columns: LinkedColumn<Act>[] = [
    {label: 'Atto', value: a => actTitle(a)},
    {label: 'Oggetto', value: a => a.subject},
    {label: 'File', value: a => String(a.file_count)},
  ];

  ngOnChanges(): void {
    if (this.entityId) this.reload();
  }

  emitCount(): void {
    this.countChange.emit(this.files + this.acts.length);
  }

  reload(): void {
    this.service.byEntity(this.entity, this.entityId).subscribe(rows => {
      this.acts = rows;
      this.emitCount();
      if (!this.readOnly) this.loadOptions();
    });
  }

  private loadOptions(): void {
    const linked = new Set(this.acts.map(a => a.id));
    this.service.list().subscribe(all => this.options = all
      .filter(a => !linked.has(a.id))
      .map(a => ({value: a.id, label: actTitle(a), sublabel: a.subject, searchText: `${actTitle(a)} ${a.subject}`})));
  }

  link(actId: number): void {
    this.service.link(actId, this.entity, this.entityId).subscribe({next: () => this.reload(), error: e => this.fail(e)});
  }

  unlink(actId: number): void {
    this.service.unlink(actId, this.entity, this.entityId).subscribe({next: () => this.reload(), error: e => this.fail(e)});
  }

  // L'atto nasce già collegato a questa entità.
  create(): void {
    this.navigator.createAct({[LINK_IDS_FIELD[this.entity]]: [this.entityId]}).subscribe(a => {
      if (a) this.reload();
    });
  }

  open(id: number): void {
    this.navigator.openAct(id).subscribe(() => this.reload());
  }

  private fail(err: HttpErrorResponse): void {
    this.toast.add({severity: 'error', summary: 'Operazione non riuscita', detail: err.error?.message ?? 'Errore imprevisto.'});
  }
}
