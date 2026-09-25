import {Injectable} from '@angular/core';
import {environment} from '../../../environments/environment';
import {AbstractService} from '../../core/services/abstract.service';
import {AssetFunction} from './entity/asset-function.entity';

@Injectable({providedIn: 'root'})
export class AssetFunctionsService extends AbstractService<AssetFunction> {
  protected override readonly BASE_URL = environment.apiUrl + '/asset-functions';
  protected override readonly entityClass = AssetFunction;
}
