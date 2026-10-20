import {Injectable} from '@angular/core';
import {map, Observable} from 'rxjs';
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

  // Immobili ancora col vecchio "tipo immobile": banner "da riclassificare".
  legacyCount(): Observable<number> {
    return this.http
      .get<{count: number}>(`${this.BASE_URL}/legacy-count`, {headers: this.getAuthHeaders()})
      .pipe(map(r => r.count));
  }

  categoryOptions(): TOption[] {
    return [
      {label: 'A/1 - Abitazioni di tipo signorile', value: 'A/1'},
      {label: 'A/2 - Abitazioni di tipo civile', value: 'A/2'},
      {label: 'A/3 - Abitazioni di tipo economico', value: 'A/3'},
      {label: 'A/4 - Abitazioni di tipo popolare', value: 'A/4'},
      {label: 'A/5 - Abitazioni di tipo ultrapopolare', value: 'A/5'},
      {label: 'A/6 - Abitazioni di tipo rurale', value: 'A/6'},
      {label: 'A/7 - Abitazioni in villini', value: 'A/7'},
      {label: 'A/8 - Abitazioni in ville', value: 'A/8'},
      {label: 'A/9 - Castelli, palazzi di eminenti pregi artistici o storici', value: 'A/9'},
      {label: 'A/10 - Uffici e studi privati', value: 'A/10'},
      {label: 'A/11 - Abitazioni ed alloggi tipici dei luoghi', value: 'A/11'},
      {label: 'B/1 - Collegi, convitti, ricoveri, orfanotrofi, conventi, caserme', value: 'B/1'},
      {label: 'B/2 - Case di cura e ospedali (senza fine di lucro)', value: 'B/2'},
      {label: 'B/3 - Prigioni e riformatori', value: 'B/3'},
      {label: 'B/4 - Uffici pubblici', value: 'B/4'},
      {label: 'B/5 - Scuole e laboratori scientifici', value: 'B/5'},
      {label: 'B/6 - Biblioteche, pinacoteche, musei, gallerie, accademie', value: 'B/6'},
      {label: 'B/7 - Cappelle e oratori non destinati al culto pubblico', value: 'B/7'},
      {label: 'B/8 - Magazzini sotterranei per depositi di derrate', value: 'B/8'},
      {label: 'C/1 - Negozi e botteghe', value: 'C/1'},
      {label: 'C/2 - Magazzini e locali di deposito', value: 'C/2'},
      {label: 'C/3 - Laboratori per arti e mestieri', value: 'C/3'},
      {label: 'C/4 - Fabbricati e locali per esercizi sportivi (senza fine di lucro)', value: 'C/4'},
      {label: 'C/5 - Stabilimenti balneari e di acque curative (senza fine di lucro)', value: 'C/5'},
      {label: 'C/6 - Stalle, scuderie, rimesse, autorimesse', value: 'C/6'},
      {label: 'C/7 - Tettoie chiuse o aperte', value: 'C/7'},
      {label: 'D/1 - Opifici', value: 'D/1'},
      {label: 'D/2 - Alberghi e pensioni', value: 'D/2'},
      {label: 'D/3 - Teatri, cinematografi, sale per concerti e spettacoli', value: 'D/3'},
      {label: 'D/4 - Case di cura e ospedali (con fine di lucro)', value: 'D/4'},
      {label: 'D/5 - Istituti di credito, cambio e assicurazione', value: 'D/5'},
      {label: 'D/6 - Fabbricati e locali per esercizi sportivi (con fine di lucro)', value: 'D/6'},
      {label: "D/7 - Fabbricati per speciali esigenze di un'attività industriale", value: 'D/7'},
      {label: "D/8 - Fabbricati per speciali esigenze di un'attività commerciale", value: 'D/8'},
      {label: 'D/9 - Edifici galleggianti o sospesi, ponti privati soggetti a pedaggio', value: 'D/9'},
      {label: 'D/10 - Fabbricati per funzioni produttive connesse alle attività agricole', value: 'D/10'},
      {label: 'E/1 - Stazioni per servizi di trasporto terrestri, marittimi e aerei', value: 'E/1'},
      {label: 'E/2 - Ponti comunali e provinciali soggetti a pedaggio', value: 'E/2'},
      {label: 'E/3 - Costruzioni e fabbricati per speciali esigenze pubbliche', value: 'E/3'},
      {label: 'E/4 - Recinti chiusi per speciali esigenze pubbliche', value: 'E/4'},
      {label: 'E/5 - Fabbricati costituenti fortificazioni', value: 'E/5'},
      {label: "E/6 - Fari, semafori, torri per l'orologio comunale", value: 'E/6'},
      {label: "E/7 - Fabbricati destinati all'esercizio pubblico dei culti", value: 'E/7'},
      {label: 'E/8 - Fabbricati e costruzioni nei cimiteri', value: 'E/8'},
      {label: 'E/9 - Edifici a destinazione particolare non compresi nelle precedenti', value: 'E/9'},
      {label: 'F/1 - Area urbana', value: 'F/1'},
      {label: 'F/2 - Unità collabenti', value: 'F/2'},
      {label: 'F/3 - Unità in corso di costruzione', value: 'F/3'},
      {label: 'F/4 - Unità in corso di definizione', value: 'F/4'},
      {label: 'F/5 - Lastrico solare', value: 'F/5'},
      {label: 'F/6 - Fabbricato in attesa di dichiarazione', value: 'F/6'},
      {label: 'F/7 - Infrastrutture di reti pubbliche di comunicazione', value: 'F/7'},
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
