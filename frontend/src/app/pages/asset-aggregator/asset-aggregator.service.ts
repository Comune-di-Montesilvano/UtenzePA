import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { AssetAggregator } from './entity/asset-aggregator.entity';
import { AbstractService } from '../../core/services/abstract.service';

@Injectable({
  providedIn: 'root'
})
export class AssetAggregatorsService extends AbstractService<AssetAggregator> {
  protected override readonly BASE_URL = environment.apiUrl + '/asset-aggregators';
  protected override readonly entityClass = AssetAggregator;
}
