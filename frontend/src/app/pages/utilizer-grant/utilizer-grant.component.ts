import {Component} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {InputTextModule} from 'primeng/inputtext';
import {ButtonModule} from 'primeng/button';
import {TableModule} from 'primeng/table';
import {ToastModule} from 'primeng/toast';
import {MessageService} from 'primeng/api';
import {AbstractComponent} from '../../core/components/abstract.component';
import {UtilizerGrant} from './entity/utilizer-grant.entity';
import {UtilizerGrantService} from './utilizer-grant.service';
import {DataTableUtilizerGrantComponent} from './data-table-utilizer-grant.component';
import {SearchUtilizerGrantComponent} from './search-utilizer-grant.component';

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
    DataTableUtilizerGrantComponent,
    SearchUtilizerGrantComponent,
  ],
  templateUrl: './utilizer-grant.component.html',
})
export class UtilizerGrantComponent extends AbstractComponent<UtilizerGrant> {
  creationResult?: { success: boolean; message?: string };

  constructor(protected override service: UtilizerGrantService) {
    super();
    this.qsearchFields = ['concession_act', 'usage_type'];
  }

  protected override getEntityIdentifier(entity: UtilizerGrant): string {
    return entity.concession_act ?? '';
  }

  protected override entityToPayload(entity: UtilizerGrant): Partial<UtilizerGrant> {
    return {
      asset_id_fk: entity.asset_id_fk,
      utilizer_id_fk: entity.utilizer_id_fk,
      concession_act: entity.concession_act,
      usage_type: entity.usage_type,
      grant_date: entity.grant_date,
      expire_date: entity.expire_date,
      utilities_to_be_taken_over: entity.utilities_to_be_taken_over,
      created_by_user_id: this.userId,
      updated_by_user_id: this.userId,
    };
  }

  override onCreate(entity: UtilizerGrant) {
    this.service.create(this.entityToPayload(entity)).subscribe({
      next: (item: UtilizerGrant) => {
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
