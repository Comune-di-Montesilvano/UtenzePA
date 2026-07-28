import {Injectable} from '@angular/core';
import {environment} from '../../../environments/environment';
import {Asset} from './entity/asset.entity';
import {AbstractService} from '../../core/services/abstract.service';
import {TOption} from '../../core/types/option.interface';

@Injectable(
  {
    providedIn: 'root',
  })
export class AssetService extends AbstractService<Asset> {
  protected override readonly BASE_URL = environment.apiUrl + '/building';
  protected override readonly entityClass = Asset;

  categoryOptions(): TOption[] {
    return [
      {label: 'A/1 - Abitazioni di tipo signorile', value: 'A/1'},
      {label: 'A/2 - Abitazioni di tipo civile', value: 'A/2'},
      {label: 'A/3 - Abitazioni di tipo economico', value: 'A/3'},
      {label: 'A/4 - Abitazioni di tipo popolare', value: 'A/4'},
      {label: 'A/5 - Abitazioni di tipo ultrapopolare', value: 'A/5'},
      {label: 'A/6 - Abitazioni rurali', value: 'A/6'},
      {label: 'A/7 - Villini', value: 'A/7'},
      {label: 'A/8 - Ville', value: 'A/8'},
      {label: 'A/9 - Castelli e palazzi di pregio', value: 'A/9'},
      {label: 'A/10 - Uffici e studi privati', value: 'A/10'},
      {label: 'A/11 - Abitazioni varie', value: 'A/11'},
      {label: 'B/1 - Collegi e convitti', value: 'B/1'},
      {label: 'B/2 - Ospedali', value: 'B/2'},
      {label: 'B/3 - Prigioni', value: 'B/3'},
      {label: 'B/4 - Uffici pubblici', value: 'B/4'},
      {label: 'B/5 - Scuole, biblioteche e musei', value: 'B/5'},
      {label: 'B/6 - Caserme', value: 'B/6'},
      {label: 'B/7 - Laboratori scientifici', value: 'B/7'},
      {label: 'B/8 - Altri immobili collettivi', value: 'B/8'},
      {label: 'C/1 - Negozi e botteghe', value: 'C/1'},
      {label: 'C/2 - Magazzini', value: 'C/2'},
      {label: 'C/3 - Laboratori artigianali', value: 'C/3'},
      {label: 'C/4 - Autorimesse (box auto)', value: 'C/4'},
      {label: 'C/5 - Rimesse', value: 'C/5'},
      {label: 'C/6 - Tettoie', value: 'C/6'},
      {label: 'C/7 - Altri locali commerciali', value: 'C/7'},
      {label: 'D/1 - Opifici e stabilimenti industriali', value: 'D/1'},
      {label: 'D/2 - Alberghi', value: 'D/2'},
      {label: 'D/3 - Teatri', value: 'D/3'},
      {label: 'D/4 - Case di cura', value: 'D/4'},
      {label: 'D/5 - Banche', value: 'D/5'},
      {label: 'D/6 - Impianti sportivi a scopo di lucro', value: 'D/6'},
      {label: 'D/7 - Altri immobili speciali', value: 'D/7'},
      {label: 'E/1 - Stazioni e servizi di trasporto', value: 'E/1'},
      {label: 'E/2 - Ponti soggetti a pedaggio', value: 'E/2'},
      {label: 'E/3 - Chiese e luoghi di culto', value: 'E/3'},
      {label: 'E/4 - Fari', value: 'E/4'},
      {label: 'E/5 - Caserme particolari', value: 'E/5'},
      {label: 'E/6 - Altri immobili particolari', value: 'E/6'},
      {label: 'F/1 - Aree urbane', value: 'F/1'},
      {label: 'F/2 - Unità collabenti (fatiscenti)', value: 'F/2'},
      {label: 'F/3 - Unità in costruzione o definizione', value: 'F/3'},
      {label: 'F/4 - Altre categorie fittizie', value: 'F/4'},
    ];
  }

  toponymOptions(): TOption[] {
    return [
      {label: 'Contrada', value: 'Contrada'},
      {label: 'Corso', value: 'Corso'},
      {label: 'Largo', value: 'Largo'},
      {label: 'Piazza', value: 'Piazza'},
      {label: 'Strada', value: 'Strada'},
      {label: 'Via', value: 'Via'},
      {label: 'Viale', value: 'Viale'}
    ]
  }
}
