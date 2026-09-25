import {ChangeDetectionStrategy, Component} from '@angular/core';
import {AbstractComponent} from '../../core/components/abstract.component';
import {AssetFunction} from './entity/asset-function.entity';
import {AssetFunctionsService} from './asset-function.service';
import {DataTableAssetFunctionComponent} from './data-table-asset-function.component';
import {SearchAssetFunctionComponent} from './search-asset-function.component';

@Component({
  selector: 'app-asset-function',
  standalone: true,
  imports: [DataTableAssetFunctionComponent, SearchAssetFunctionComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './asset-function.component.html'
})
export class AssetFunctionComponent extends AbstractComponent<AssetFunction> {
  constructor(protected override service: AssetFunctionsService) {
    super();
    this.qsearchFields = ['name'];
  }

  protected override getEntityIdentifier(entity: AssetFunction): string {
    return entity.name ?? '';
  }

  protected override entityLabel(): string {
    return 'Funzione';
  }

  protected override entityToPayload(entity: AssetFunction): Partial<AssetFunction> {
    return {name: entity.name, icon: entity.icon, created_by_user_id: this.userId, updated_by_user_id: this.userId};
  }
}
