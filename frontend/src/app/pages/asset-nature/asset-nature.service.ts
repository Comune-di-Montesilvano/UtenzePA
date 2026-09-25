import {Injectable} from '@angular/core';
import {environment} from '../../../environments/environment';
import {AbstractService} from '../../core/services/abstract.service';
import {AssetNature} from './entity/asset-nature.entity';

@Injectable({providedIn: 'root'})
export class AssetNaturesService extends AbstractService<AssetNature> {
  protected override readonly BASE_URL = environment.apiUrl + '/asset-natures';
  protected override readonly entityClass = AssetNature;
}
