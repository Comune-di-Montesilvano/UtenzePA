import {ChangeDetectionStrategy, Component} from '@angular/core';
import {MatChipsModule} from '@angular/material/chips';
import {AbstractComponent} from '../../core/components/abstract.component';
import {partyName} from '../../core/helpers/party-name.helper';
import {ThirdParty} from './entity/third-party.entity';
import {ThirdPartiesService} from './third-parties.service';
import {PartyRole, ROLE_LABEL} from './third-party.model';
import {DataTableThirdPartiesComponent} from './data-table-third-parties.component';
import {SearchThirdPartiesComponent} from './search-third-parties.component';

@Component({
  selector: 'app-third-parties',
  standalone: true,
  imports: [MatChipsModule, DataTableThirdPartiesComponent, SearchThirdPartiesComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './third-parties.component.html',
})
export class ThirdPartiesComponent extends AbstractComponent<ThirdParty> {
  readonly chips = [PartyRole.SUPPLIER, PartyRole.LESSOR, PartyRole.TENANT, PartyRole.UNLINKED]
    .map(role => ({role, label: ROLE_LABEL[role]}));
  selectedRoles: PartyRole[] = [];
  private dialogFilters: Record<string, unknown> = {};

  constructor(protected override service: ThirdPartiesService) {
    super();
  }

  // Chip in OR, combinate con i filtri del dialog; nessuna chip = tutti.
  onRolesChange(roles: PartyRole[]): void {
    this.selectedRoles = roles ?? [];
    this.applyFilters();
  }

  // La ricerca rapida resta lato client; qsearch non va mai al backend
  // (parametro sconosciuto = 400).
  onDialogSearch(filters: Record<string, unknown>): void {
    if (Object.keys(filters).length === 1 && 'qsearch' in filters) {
      this.onSearch(filters);
      return;
    }
    const {qsearch: _ignored, ...rest} = filters;
    this.dialogFilters = rest;
    this.applyFilters();
  }

  private applyFilters(): void {
    const filters: Record<string, unknown> = {...this.dialogFilters};
    if (this.selectedRoles.length) filters['roles'] = this.selectedRoles.join(',');
    this.onSearch(filters);
  }

  protected override getEntityIdentifier(entity: ThirdParty): string {
    return partyName(entity);
  }

  protected override entityLabel(): string {
    return 'Soggetto';
  }
}
