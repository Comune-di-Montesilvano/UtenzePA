import {Component, ChangeDetectionStrategy} from '@angular/core';
import {DataTableConsipAgreementComponent} from './data-table-consip-agreement.component';
import {SearchConsipAgreementComponent} from './search-consip-agreement.component';
import {ConsipAgreementService} from './consip-agreement.service';
import {AbstractComponent} from '../../core/components/abstract.component';
import {ConsipAgreement} from './entity/consip-agreement.entity';

@Component({
  selector: 'app-consip-agreement',
  standalone: true,
  imports: [
    DataTableConsipAgreementComponent,
    SearchConsipAgreementComponent
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './consip-agreement.component.html'
})
export class ConsipAgreementComponent extends AbstractComponent<ConsipAgreement> {

  constructor(protected override service: ConsipAgreementService) {
    super();
    this.qsearchFields = ['name', 'description', 'cig_master'];
  }

  protected override entityLabel(): string {
    return 'Convenzione';
  }

  protected override getEntityIdentifier(entity: ConsipAgreement): string {
    return `${entity.name}`;
  }

  protected override entityToPayload(entity: ConsipAgreement): Partial<ConsipAgreement> {
    return {
      supplier_id: entity.supplier_id,
      name: entity.name,
      description: entity.description,
      cig_master: entity.cig_master,
      safeguard: entity.safeguard,
      expiration_date: entity.expiration_date,
      created_by_user_id: this.userId,
      updated_by_user_id: this.userId
    };
  }
}
