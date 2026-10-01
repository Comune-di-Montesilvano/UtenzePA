import {Component, ChangeDetectionStrategy, ViewChild} from '@angular/core';
import {ActivatedRoute} from '@angular/router';
import {DataTableContractsComponent} from './data-table-contracts.component';
import {SearchContractsComponent} from './search-contracts.component';
import {ContractsService} from './contract.service';
import {AbstractComponent} from '../../core/components/abstract.component';
import {Contract} from './entity/contract.entity';

@Component({
  selector: 'app-contracts',
  standalone: true,
  imports: [DataTableContractsComponent, SearchContractsComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './contracts.component.html'
})
export class ContractsComponent extends AbstractComponent<Contract> {

  @ViewChild('dataTable') dataTable?: DataTableContractsComponent;

  constructor(protected override service: ContractsService, private route: ActivatedRoute) {
    super();
  }

  // Link dalla card anomalie della dashboard: ?missing_cig=true filtra i
  // contratti senza CIG (non esclusi), ?selectedId=N apre il contratto.
  override ngOnInit(): void {
    this.route.queryParams.subscribe(params => {
      const selectedId = params['selectedId'] ? Number(params['selectedId']) : null;
      this.lastFilters = params['missing_cig'] === 'true' ? {missing_cig: true} : {};
      if (params['supply_expiry_date_range']) {
        this.lastFilters = {supply_expiry_date_range: params['supply_expiry_date_range']};
      }
      this.loading = true;
      this.service.search(this.lastFilters).subscribe(result => {
        this.list = this.service.fromPlain(result);
        this.allItems = [...this.list];
        this.loading = false;
        if (params['missing_cig'] === 'true') {
          this.messageService.add({severity: 'info', summary: 'Filtro applicato', detail: 'Contratti senza CIG.'});
        }
        if (params['supply_expiry_date_range']) {
          this.messageService.add({severity: 'info', summary: 'Filtro applicato', detail: 'Contratti in scadenza.'});
        }
        const selected = selectedId ? this.list.find(c => c.id === selectedId) : undefined;
        if (selected) setTimeout(() => this.dataTable?.openEditDialog(selected));
      });
    });
  }

  protected override getEntityIdentifier(entity: Contract): string {
    return entity.cig_contract ?? 'CIG non specificato';
  }

  protected override entityLabel(): string {
    return 'Contratto';
  }
}
