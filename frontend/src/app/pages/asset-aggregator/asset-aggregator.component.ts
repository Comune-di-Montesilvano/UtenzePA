import {Component, ChangeDetectionStrategy} from '@angular/core';
import {DataTableAggregatorsComponent} from './data-table-asset-aggregator.component';
import {SearchAggregators} from './search-asset-aggregator.component';
import {AssetAggregatorsService} from './asset-aggregator.service';
import {AbstractComponent} from '../../core/components/abstract.component';
import {AssetAggregator} from './entity/asset-aggregator.entity';

@Component({
  selector: 'app-asset-aggregators',
  standalone: true,
  imports: [
    DataTableAggregatorsComponent,
    SearchAggregators
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './asset-aggregator.component.html'
})
export class AssetAggregatorsComponent extends AbstractComponent<AssetAggregator> {

  constructor(protected override service: AssetAggregatorsService) {
    super();
    this.qsearchFields = ['description', 'code'];
  }

  protected override getEntityIdentifier(entity: AssetAggregator): string {
    return entity.code ?? '';
  }

  protected override entityToPayload(entity: AssetAggregator): Partial<AssetAggregator> {
    return {
      description: entity.description,
      code: entity.code,
      created_by_user_id: this.userId,
      updated_by_user_id: this.userId
    };
  }
}
