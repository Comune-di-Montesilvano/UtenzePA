import {ChangeDetectionStrategy, Component, inject, ViewChild} from '@angular/core';
import {ActivatedRoute} from '@angular/router';
import {AbstractComponent} from '../../core/components/abstract.component';
import {partyName} from '../../core/helpers/party-name.helper';
import {ThirdParty} from './entity/third-party.entity';
import {ThirdPartiesService} from './third-parties.service';
import {DataTableThirdPartiesComponent} from './data-table-third-parties.component';
import {ListFiltersComponent} from '../../core/components/list/list-filters.component';
import {thirdPartyFilters, THIRD_PARTY_SIGNALS} from './third-parties-filters';
import {ListSignalsComponent} from '../../core/components/list/list-signals.component';

@Component({
  selector: 'app-third-parties',
  standalone: true,
  imports: [DataTableThirdPartiesComponent, ListFiltersComponent, ListSignalsComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './third-parties.component.html',
})
export class ThirdPartiesComponent extends AbstractComponent<ThirdParty> {
  @ViewChild('dataTable') dataTable?: DataTableThirdPartiesComponent;
  override filterDefs = thirdPartyFilters();
  readonly signals = THIRD_PARTY_SIGNALS;
  private route = inject(ActivatedRoute);

  constructor(protected override service: ThirdPartiesService) {
    super();
  }

  override ngOnInit(): void {
    this.initFromRoute(this.route, item => this.dataTable?.openEditDialog(item));
  }

  protected override getEntityIdentifier(entity: ThirdParty): string {
    return partyName(entity);
  }

  protected override entityLabel(): string {
    return 'Soggetto';
  }
}
