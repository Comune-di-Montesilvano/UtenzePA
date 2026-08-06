import {Component} from '@angular/core';
import {AbstractComponent} from '../../core/components/abstract.component';
import {Utilizer} from './entity/utilizer.entity';
import {UtilizerService} from './utilizer.service';
import {DataTableUtilizerComponent} from './data-table-utilizer.component';
import {SearchUtilizerComponent} from './search-utilizer.component';

@Component({
  selector: 'app-utilizer',
  standalone: true,
  imports: [
    DataTableUtilizerComponent,
    SearchUtilizerComponent,
  ],
  templateUrl: './utilizer.component.html',
})
export class UtilizerComponent extends AbstractComponent<Utilizer> {

  constructor(protected override service: UtilizerService) {
    super();
    this.qsearchFields = ['name', 'description'];
  }

  protected override getEntityIdentifier(entity: Utilizer): string {
    return entity.name ?? '';
  }

  protected override entityLabel(): string {
    return 'Utilizzatore';
  }
}
