import {Component, ChangeDetectionStrategy} from '@angular/core';
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

  constructor(protected override service: ContractsService) {
    super();
  }

  protected override getEntityIdentifier(entity: Contract): string {
    return entity.cig_contract ?? 'CIG non specificato';
  }

  protected override entityLabel(): string {
    return 'Contratto';
  }
}
