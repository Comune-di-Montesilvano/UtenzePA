import {Component} from '@angular/core';
import {CommonModule} from '@angular/common';
import {AbstractComponent} from '../../core/components/abstract.component';
import {Utilizer} from './entity/utilizer.entity';
import {UtilizerService} from './utilizer.service';
import {DataTableUtilizerComponent} from './data-table-utilizer.component';
import {SearchUtilizerComponent} from './search-utilizer.component';

@Component({
  selector: 'app-utilizer',
  standalone: true,
  imports: [
    CommonModule,
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
}
