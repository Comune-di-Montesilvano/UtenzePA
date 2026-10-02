import {Injectable} from '@angular/core';
import {environment} from '../../../environments/environment';
import {AbstractService} from '../../core/services/abstract.service';
import {ThirdParty} from './entity/third-party.entity';

@Injectable({providedIn: 'root'})
export class ThirdPartiesService extends AbstractService<ThirdParty> {
  protected override readonly BASE_URL = environment.apiUrl + '/third-parties';
  protected override readonly entityClass = ThirdParty;
}
