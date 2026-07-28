import {Component} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {InputTextModule} from 'primeng/inputtext';
import {ButtonModule} from 'primeng/button';
import {TableModule} from 'primeng/table';
import {UtilityTypesService} from './utility-types.service';
import {MessageService} from 'primeng/api';
import {ToastModule} from 'primeng/toast';
import {AbstractComponent} from '../../core/components/abstract.component';
import {UtilityType} from './entity/utility-type.entity';
import {DataTableUtilityTypesComponent} from './data-table-utility-types.component';
import {SearchFormUtilityTypes} from './search-utility-types.component';

@Component({
             selector: 'app-utilityTypes',
             standalone: true,
             providers: [MessageService],
             imports: [
               CommonModule,
               FormsModule,
               InputTextModule,
               ButtonModule,
               TableModule,
               ToastModule,
               DataTableUtilityTypesComponent,
               SearchFormUtilityTypes
             ],
             templateUrl: './utility-types.component.html'
           })
export class UtilityTypesComponent extends AbstractComponent<UtilityType> {
  creationResult?: { success: boolean, message?: string };

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
      created_by_user_id: this.userId,
      updated_by_user_id: this.userId
    };
  }

  override onCreate(entity: UtilityType) {
    this.service.create(entity).subscribe(
      {
        next: (item: UtilityType) => {
          this.list.push(item);
          this.messageService.add(
            {
              severity: 'success',
              summary: 'Tipologia Uso Contatore creata',
              detail: this.getEntityIdentifier(item),
              key: 'global'
            });
          this.creationResult = {
            success: true,
            message: 'Tipologia Uso Contatore creata con successo'
          };
          this.loadAll();
        },
        error: err => {
          this.handleError(err, 'Errore generico nella creazione anagrafica');
        }
      });
  }
}
