import {Injectable} from '@angular/core';
import {environment} from '../../../environments/environment';
import {AbstractService} from '../../core/services/abstract.service';
import {UtilityAggregator} from './entity/utility-aggregator.entity';

@Injectable({
  providedIn: 'root'
})
export class UtilityAggregatorsService extends AbstractService<UtilityAggregator> {
  protected override readonly BASE_URL = environment.apiUrl + '/utility-aggregators';
  protected override readonly entityClass = UtilityAggregator;
}
