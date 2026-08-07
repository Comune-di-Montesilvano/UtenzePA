import {Component} from '@angular/core';
import {UtilityTypesService} from './utility-types.service';
import {AbstractComponent} from '../../core/components/abstract.component';
import {UtilityType} from './entity/utility-type.entity';
import {DataTableUtilityTypesComponent} from './data-table-utility-types.component';
import {SearchFormUtilityTypes} from './search-utility-types.component';

@Component({
  selector: 'app-utilityTypes',
  standalone: true,
  imports: [
    DataTableUtilityTypesComponent,
    SearchFormUtilityTypes
  ],
  templateUrl: './utility-types.component.html'
})
export class UtilityTypesComponent extends AbstractComponent<UtilityType> {

  constructor(protected override service: UtilityTypesService) {
    super();
    this.qsearchFields = ['name', 'description'];
  }

  protected override getEntityIdentifier(entity: UtilityType): string {
    return `${entity.name}`;
  }

  protected override entityToPayload(entity: UtilityType): Partial<UtilityType> {
    return {
      name: entity.name,
      description: entity.description,
      hard_type: entity.hard_type,
      purposes: entity.purposes,
      created_by_user_id: this.userId,
      updated_by_user_id: this.userId
    };
  }

  override onCreate(entity: UtilityType) {
    const payload = this.entityToPayload(entity);
    this.service.create(payload).subscribe({
      next: (item: UtilityType) => {
        this.list.push(item);
        this.messageService.add({
          severity: 'success',
          summary: 'Tipologia Uso Contatore creata',
          detail: this.getEntityIdentifier(item),
          key: 'global'
        });
        this.loadAll();
      },
      error: (err: any) => {
        this.handleError(err, 'Errore generico nella creazione anagrafica');
      }
    });
  }
}
