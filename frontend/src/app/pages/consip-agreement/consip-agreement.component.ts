import {Component, ChangeDetectionStrategy, inject} from '@angular/core';
import {ActivatedRoute} from '@angular/router';
import {DataTableConsipAgreementComponent} from './data-table-consip-agreement.component';
import {ListFiltersComponent} from '../../core/components/list/list-filters.component';
import {consipAgreementFilters} from './consip-agreement-filters';
import {ConsipAgreementService} from './consip-agreement.service';
import {AbstractComponent} from '../../core/components/abstract.component';
import {ConsipAgreement} from './entity/consip-agreement.entity';

@Component({
  selector: 'app-consip-agreement',
  standalone: true,
  imports: [
    DataTableConsipAgreementComponent,
    ListFiltersComponent
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './consip-agreement.component.html'
})
export class ConsipAgreementComponent extends AbstractComponent<ConsipAgreement> {

  constructor(protected override service: ConsipAgreementService) {
    super();
    this.qsearchFields = ['name', 'description', 'cig_master'];
  }

  override filterDefs = consipAgreementFilters();
  private route = inject(ActivatedRoute);

  override ngOnInit(): void {
    this.initFromRoute(this.route);
  }

  protected override entityLabel(): string {
    return 'Convenzione';
  }

  protected override getEntityIdentifier(entity: ConsipAgreement): string {
    return `${entity.name}`;
  }

  protected override entityToPayload(entity: ConsipAgreement): Partial<ConsipAgreement> {
    return {...ConsipAgreement.toPayload(entity), created_by_user_id: this.userId, updated_by_user_id: this.userId};
  }
}
