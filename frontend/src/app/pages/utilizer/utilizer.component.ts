import {Component} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {InputTextModule} from 'primeng/inputtext';
import {ButtonModule} from 'primeng/button';
import {TableModule} from 'primeng/table';
import {ToastModule} from 'primeng/toast';
import {MessageService} from 'primeng/api';
import {AbstractComponent} from '../../core/components/abstract.component';
import {Utilizer} from './entity/utilizer.entity';
import {UtilizerService} from './utilizer.service';
import {DataTableUtilizerComponent} from './data-table-utilizer.component';
import {SearchUtilizerComponent} from './search-utilizer.component';

@Component({
  selector: 'app-utilizer-grant',
  standalone: true,
  providers: [MessageService],
  imports: [
    CommonModule,
    FormsModule,
    InputTextModule,
    ButtonModule,
    TableModule,
    ToastModule,
    DataTableUtilizerComponent,
    SearchUtilizerComponent,
  ],
  templateUrl: './utilizer.component.html',
})
export class UtilizerComponent extends AbstractComponent<Utilizer> {
  creationResult?: { success: boolean; message?: string };

  constructor(protected override service: UtilizerService) {
    super();
    this.qsearchFields = ['name', 'description'];
  }

  protected override getEntityIdentifier(entity: Utilizer): string {
    return entity.name ?? '';
  }

  // protected override entityToPayload(entity: Utilizer): Partial<Utilizer> {
  //   return {
  //     user_name: entity.user_name,
  //     asset_id_fk: entity.asset_id_fk,
  //     concession_act: entity.concession_act,
  //     usage_type: entity.usage_type,
  //     expire_date: entity.expire_date,
  //     utilities_to_be_taken_over: entity.utilities_to_be_taken_over,
  //     created_by_user_id: this.userId,
  //     updated_by_user_id: this.userId,
  //   };
  // }

  override onCreate(entity: Utilizer) {
    this.service.create(this.entityToPayload(entity)).subscribe({
      next: (item: Utilizer) => {
        this.list.push(item);
        this.messageService.add({
          severity: 'success',
          summary: 'Utilizzatore creato',
          detail: this.getEntityIdentifier(item),
          key: 'global',
        });
        this.creationResult = {success: true, message: 'Utilizzatore creato con successo'};
        this.loadAll();
      },
      error: (err: any) => {
        this.handleError(err, 'Errore generico nella creazione utilizzatore');
        this.creationResult = {success: false};
      },
    });
  }
}
