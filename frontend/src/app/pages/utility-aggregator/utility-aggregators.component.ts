import {Component} from '@angular/core';
import {UtilityAggregatorsService} from './utility-aggregator.service';
import {DataTableUtilityAggregatorsComponent} from './data-table-utility-aggregator.component';
import {SearchUtilityAggregators} from './search-utility-aggregator.component';
import {UtilityAggregator} from './entity/utility-aggregator.entity';
import {AbstractComponent} from '../../core/components/abstract.component';

@Component({
  selector: 'app-utility-aggregators',
  standalone: true,
  imports: [
    DataTableUtilityAggregatorsComponent,
    SearchUtilityAggregators
  ],
  templateUrl: './utility-aggregator.component.html'
})
export class UtilityAggregatorsComponent extends AbstractComponent<UtilityAggregator> {

  constructor(protected override service: UtilityAggregatorsService) {
    super();
  }

  protected override getEntityIdentifier(entity: UtilityAggregator): string {
    return entity.code;
  }

  protected override entityLabel(): string {
    return 'Aggregato Utenza';
  }
}
