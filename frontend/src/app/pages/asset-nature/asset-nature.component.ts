import {ChangeDetectionStrategy, Component} from '@angular/core';
import {AbstractComponent} from '../../core/components/abstract.component';
import {AssetNature} from './entity/asset-nature.entity';
import {AssetNaturesService} from './asset-nature.service';
import {DataTableAssetNatureComponent} from './data-table-asset-nature.component';
import {SearchAssetNatureComponent} from './search-asset-nature.component';

@Component({
  selector: 'app-asset-nature',
  standalone: true,
  imports: [DataTableAssetNatureComponent, SearchAssetNatureComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './asset-nature.component.html'
})
export class AssetNatureComponent extends AbstractComponent<AssetNature> {
  constructor(protected override service: AssetNaturesService) {
    super();
    this.qsearchFields = ['name'];
  }

  protected override getEntityIdentifier(entity: AssetNature): string {
    return entity.name ?? '';
  }

  protected override entityLabel(): string {
    return 'Tipologia';
  }

  protected override entityToPayload(entity: AssetNature): Partial<AssetNature> {
    return {
      name: entity.name,
      icon: entity.icon,
      function_ids: entity.function_ids ?? [],
      created_by_user_id: this.userId,
      updated_by_user_id: this.userId,
    };
  }
}
