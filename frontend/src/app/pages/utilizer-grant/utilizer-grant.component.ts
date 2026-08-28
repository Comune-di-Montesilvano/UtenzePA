import {Component, ChangeDetectionStrategy} from '@angular/core';
import {DataTableUtilizerGrantComponent} from './data-table-utilizer-grant.component';
import {SearchUtilizerGrantComponent} from './search-utilizer-grant.component';
import {UtilizerGrantService} from './utilizer-grant.service';
import {AbstractComponent} from '../../core/components/abstract.component';
import {UtilizerGrant} from './entity/utilizer-grant.entity';

@Component({
  selector: 'app-utilizer-grant',
  standalone: true,
  imports: [
    DataTableUtilizerGrantComponent,
    SearchUtilizerGrantComponent
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './utilizer-grant.component.html',
})
export class UtilizerGrantComponent extends AbstractComponent<UtilizerGrant> {

  constructor(protected override service: UtilizerGrantService) {
    super();
    this.qsearchFields = ['concession_act', 'usage_type'];
  }

  protected override entityLabel(): string {
    return 'Concessione';
  }

  protected override getEntityIdentifier(entity: UtilizerGrant): string {
    return entity.concession_act ?? '';
  }

  protected override entityToPayload(entity: UtilizerGrant): Partial<UtilizerGrant> {
    return {
      asset_id_fk: entity.asset_id_fk,
      utilizer_id_fk: entity.utilizer_id_fk,
      concession_act: entity.concession_act,
      usage_type: entity.usage_type,
      grant_date: entity.grant_date,
      expire_date: entity.expire_date,
      utilities_to_be_taken_over: entity.utilities_to_be_taken_over,
      created_by_user_id: this.userId,
      updated_by_user_id: this.userId,
    };
  }
}
