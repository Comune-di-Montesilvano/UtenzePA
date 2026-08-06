import {Component} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatButtonModule} from '@angular/material/button';
import {DataTablePurposeComponent} from './data-table-purpose.component';
import {SearchPurposeComponent} from './search-purpose.component';
import {PurposeService} from './purpose.service';
import {AbstractComponent} from '../../core/components/abstract.component';
import {Purpose} from './entity/purpose.entity';
import {UseTypeDescription} from './enum/use-type.enum';

@Component({
  selector: 'app-purpose',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    DataTablePurposeComponent,
    SearchPurposeComponent
  ],
  templateUrl: './purpose.component.html'
})
export class PurposeComponent extends AbstractComponent<Purpose> {
  creationResult?: { success: boolean, message?: string };

  constructor(protected override service: PurposeService) {
    super();
    this.qsearchFields = ['name', 'use_type'];
  }

  override onSearch(filters: any) {
    if (Object.keys(filters).length === 1 && filters.hasOwnProperty('qsearch') && filters.qsearch !== '') {
      const term = (filters.qsearch as string).toLowerCase();
      this.list = [...this.allItems].filter(item => {
        const nameMatch = item.name?.toLowerCase().includes(term);
        const useTypeRawMatch = item.use_type?.toLowerCase().includes(term);
        const useTypeDescMatch = UseTypeDescription[item.use_type]?.toLowerCase().includes(term);
        return nameMatch || useTypeRawMatch || useTypeDescMatch;
      });
      this.resetPagingCount++;
    } else {
      super.onSearch(filters);
    }
  }

  protected override getEntityIdentifier(entity: Purpose): string {
    return `${entity.name}`;
  }

  protected override entityToPayload(entity: Purpose): Partial<Purpose> {
    return {
      name: entity.name,
      use_type: entity.use_type,
      created_by_user_id: this.userId,
      updated_by_user_id: this.userId
    };
  }

  override onCreate(entity: Purpose) {
    this.service.create(entity).subscribe(
      {
        next: (item: Purpose) => {
          this.list.push(item);
          this.messageService.add(
            {
              severity: 'success',
              summary: 'Elemento creato',
              detail: this.getEntityIdentifier(item)
            });
          this.creationResult = {
            success: true,
            message: 'Elemento creato con successo'
          };
          this.loadAll();
        },
        error: (err: any) => {
          this.handleError(err, 'Errore generico nella creazione');
        }
      });
  }
}
