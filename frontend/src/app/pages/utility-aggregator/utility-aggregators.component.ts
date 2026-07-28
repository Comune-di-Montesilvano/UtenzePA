import {Component} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { UtilityAggregatorsService } from './utility-aggregator.service';
import { DataTableUtilityAggregatorsComponent } from './data-table-utility-aggregator.component';
import { SearchUtilityAggregators } from './search-utility-aggregator.component';
import { MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';
import { UtilityAggregator } from './entity/utility-aggregator.entity';
import { AbstractComponent } from '../../core/components/abstract.component';

@Component({
  selector: 'app-utility-aggregators',
  standalone: true,
  providers: [MessageService],
  imports: [
    CommonModule,
    FormsModule,
    InputTextModule,
    ButtonModule,
    TableModule,
    DataTableUtilityAggregatorsComponent,
    ToastModule,
    SearchUtilityAggregators
  ],
  templateUrl: './utility-aggregator.component.html'
})
export class UtilityAggregatorsComponent extends AbstractComponent<UtilityAggregator> {
  creationResult?: { success: boolean; message?: string };

  constructor(protected override service: UtilityAggregatorsService) {
    super();
  }

  protected override getEntityIdentifier(entity: UtilityAggregator): string {
    return entity.code;
  }

  override onCreate(entity: UtilityAggregator) {
    this.service.create(entity).subscribe({
      next: (item: UtilityAggregator) => {
        this.list.push(item);
        this.messageService.add({
          severity: 'success',
          summary: 'Aggregato Utenza creato',
          detail: this.getEntityIdentifier(item),
          key: 'global'
        });
        this.creationResult = { success: true, message: 'Aggregato Utenza creato con successo' };
        this.loadAll();
      },
      error: (err: any) => {
        this.handleError(err, 'Errore generico nella creazione aggregato');
        this.creationResult = { success: false };
      }
    });
  }
}
