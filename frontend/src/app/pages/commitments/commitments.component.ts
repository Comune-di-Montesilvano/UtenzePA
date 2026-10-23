import {ChangeDetectionStrategy, Component, ViewChild} from '@angular/core';
import {ActivatedRoute} from '@angular/router';
import {AbstractComponent} from '../../core/components/abstract.component';
import {ListFiltersComponent} from '../../core/components/list/list-filters.component';
import {ListSignalsComponent} from '../../core/components/list/list-signals.component';
import {Commitment} from './commitment.model';
import {CommitmentService} from './commitment.service';
import {COMMITMENT_SIGNALS, commitmentFilters} from './commitments-filters';
import {DataTableCommitmentsComponent} from './data-table-commitments.component';

@Component({
  selector: 'app-commitments',
  standalone: true,
  imports: [DataTableCommitmentsComponent, ListFiltersComponent, ListSignalsComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './commitments.component.html',
})
export class CommitmentsComponent extends AbstractComponent<Commitment> {
  @ViewChild('dataTable') dataTable?: DataTableCommitmentsComponent;

  override filterDefs = commitmentFilters();
  readonly signals = COMMITMENT_SIGNALS;

  constructor(protected override service: CommitmentService, private route: ActivatedRoute) {
    super();
  }

  // ?selectedId=N apre la scheda dell'impegno.
  override ngOnInit(): void {
    this.initFromRoute(this.route, item => this.dataTable?.openEditDialog(item));
  }

  protected override getEntityIdentifier(entity: Commitment): string {
    return entity.label && entity.label !== '—' ? entity.label : `${entity.fiscal_year} (senza numero)`;
  }

  protected override entityToPayload(entity: Commitment): Partial<Commitment> {
    return Commitment.toPayload(entity);
  }

  protected override entityLabel(): string {
    return 'Impegno';
  }
}
