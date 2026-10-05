import {ChangeDetectionStrategy, Component, inject} from '@angular/core';
import {ActivatedRoute} from '@angular/router';
import {AbstractComponent} from '../../core/components/abstract.component';
import {partyName} from '../../core/helpers/party-name.helper';
import {ThirdParty} from './entity/third-party.entity';
import {ThirdPartiesService} from './third-parties.service';
import {DataTableThirdPartiesComponent} from './data-table-third-parties.component';
import {ListFiltersComponent} from '../../core/components/list/list-filters.component';
import {thirdPartyFilters} from './third-parties-filters';

@Component({
  selector: 'app-third-parties',
  standalone: true,
  imports: [DataTableThirdPartiesComponent, ListFiltersComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './third-parties.component.html',
})
export class ThirdPartiesComponent extends AbstractComponent<ThirdParty> {
  override filterDefs = thirdPartyFilters();
  private route = inject(ActivatedRoute);

  constructor(protected override service: ThirdPartiesService) {
    super();
  }

  override ngOnInit(): void {
    this.initFromRoute(this.route);
  }

  protected override getEntityIdentifier(entity: ThirdParty): string {
    return partyName(entity);
  }

  protected override entityLabel(): string {
    return 'Soggetto';
  }
}
