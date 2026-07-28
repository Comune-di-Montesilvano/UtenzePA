import {Component} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {InputTextModule} from 'primeng/inputtext';
import {ButtonModule} from 'primeng/button';
import {TableModule} from 'primeng/table';
import {DataTableAggregatorsComponent} from './data-table-asset-aggregator.component';
import {SearchAggregators} from './search-asset-aggregator.component';
import {MessageService} from 'primeng/api';
import {ToastModule} from 'primeng/toast';
import {AssetAggregatorsService} from './asset-aggregator.service';
import {AbstractComponent} from '../../core/components/abstract.component';
import {AssetAggregator} from './entity/asset-aggregator.entity';

@Component({
  selector: 'app-asset-aggregators',
  standalone: true,
  providers: [MessageService],
  imports: [
    CommonModule,
    FormsModule,
    InputTextModule,
    ButtonModule,
    TableModule,
    DataTableAggregatorsComponent,
    ToastModule,
    SearchAggregators
  ],
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
