import {Component} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {InputTextModule} from 'primeng/inputtext';
import {ButtonModule} from 'primeng/button';
import {TableModule} from 'primeng/table';
import {DataTableConsipAgreementComponent} from './data-table-consip-agreement.component';
import {MessageService} from 'primeng/api';
import {ToastModule} from 'primeng/toast';
import {ConsipAgreementService} from './consip-agreement.service';
import {AbstractComponent} from '../../core/components/abstract.component';
import {ConsipAgreement} from './entity/consip-agreement.entity';
import {SearchConsipAgreement} from './search-consip-agreement.component';

@Component({
             selector: 'app-consip-agreement',
             standalone: true,
             providers: [MessageService],
             imports: [
               CommonModule,
               FormsModule,
               InputTextModule,
               ButtonModule,
               TableModule,
               DataTableConsipAgreementComponent,
               ToastModule,
               SearchConsipAgreement
             ],
             templateUrl: './consip-agreement.component.html'
           })
export class ConsipAgreementComponent extends AbstractComponent<ConsipAgreement> {
  creationResult?: { success: boolean, message?: string };

  constructor(protected override service: ConsipAgreementService) {
    super();
    this.qsearchFields = ['name', 'description', 'cig_master'];
  }

  protected override getEntityIdentifier(entity: ConsipAgreement): string {
    return `${entity.name}`;
  }

  protected override entityToPayload(entity: ConsipAgreement): Partial<ConsipAgreement> {
    return {
      supplier_id: entity.supplier_id,
      name: entity.name,
      description: entity.description,
      cig_master: entity.cig_master,
      safeguard: entity.safeguard,
      expiration_date: entity.expiration_date,
      created_by_user_id: this.userId,
      updated_by_user_id: this.userId
    };
  }

  override onCreate(entity: ConsipAgreement) {
    this.service.create(entity).subscribe(
      {
        next: (item: ConsipAgreement) => {
          this.list.push(item);
          this.messageService.add(
            {
              severity: 'success',
              summary: 'Elemento creato',
              detail: this.getEntityIdentifier(item),
              key: 'global'
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
