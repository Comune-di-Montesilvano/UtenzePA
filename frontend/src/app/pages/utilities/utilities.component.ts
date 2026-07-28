import {Component, ViewChild} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {InputTextModule} from 'primeng/inputtext';
import {ButtonModule} from 'primeng/button';
import {TableModule} from 'primeng/table';
import {UtilityService} from './utility.service';
import {DataTableUtilitiesComponent} from './data-table-utilities.component';
import {SearchUtilitiesComponent} from './search-utilities.component';
import {MessageService} from 'primeng/api';
import {ToastModule} from 'primeng/toast';
import {ActivatedRoute} from '@angular/router';
import {UtilityAggregatorsService} from '../utility-aggregator/utility-aggregator.service';
import {UtilityAggregator} from '../utility-aggregator/entity/utility-aggregator.entity';
import {Utility} from './entity/utility.entity';
import {AbstractComponent} from '../../core/components/abstract.component';
import {plainToInstance} from 'class-transformer';

@Component({
             selector: 'app-utilities',
             standalone: true,
             providers: [MessageService,],
             imports: [
               CommonModule,
               FormsModule,
               InputTextModule,
               ButtonModule,
               TableModule,
               DataTableUtilitiesComponent,
               ToastModule,
               SearchUtilitiesComponent
             ],
             templateUrl: './utilities.component.html'
           })
export class UtilitiesComponent extends AbstractComponent<Utility> {
  protected override getEntityIdentifier(entity: Utility): string {
    return `${entity.utility_id}`;
  }

  @ViewChild('dataTable') dataTable!: DataTableUtilitiesComponent;

  creationResult?: { success: boolean, message?: string };
  utilityAggregatorMap: { [key: number]: UtilityAggregator } = {};

  private selectedId?: number | null;

  get utilities(): Utility[] {
    return this.list;
  }

  constructor(
    protected override service: UtilityService,
    private utilitiesService: UtilityService,
    private route: ActivatedRoute,
    private utilityAggregatorService: UtilityAggregatorsService
  ) {
    super();
    const user = this.authService.getCurrentUser();
    this.userId = user?.id ?? undefined;
  }

  formatDateIt(date: Date | string): string {
    if (!date) return '';

    return new Date(date).toLocaleDateString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  }

  override ngOnInit() {
    this.route.queryParams.subscribe(params => {
      this.selectedId = params['selectedId'] ? Number(params['selectedId']) : null;

      if (this.selectedId) {
        this.loadAllUtilities();
      } else if (params['safeguard']) {
        this.loading = true;
        this.utilitiesService.search({safeguard: true}).subscribe(result => {
          this.list = plainToInstance(Utility, result);
          this.allItems = [...result];
          this.loading = false;
          this.messageService.add({
                                    key: 'global',
                                    severity: 'info',
                                    summary: 'Filtro applicato',
                                    detail: 'Utenze filtrate per salvaguardia.',
                                    sticky: true
                                  });
        });
      } else if (params['supply_expiry_date_range']) {
        const raw: string[] = params['supply_expiry_date_range'];
        const from = raw[0];
        const to = raw[1];

        this.loading = true;
        this.utilitiesService.search({supply_expiry_date_range: [from, to]}).subscribe(result => {
          this.list = plainToInstance(Utility, result);
          this.allItems = [...result];
          this.loading = false;
          this.messageService.add({
                                    key: 'global',
                                    severity: 'info',
                                    summary: 'Filtro applicato',
                                    detail: `Utenze filtrate per scadenza tra ${this.formatDateIt(from)} e ${this.formatDateIt(to)}.`,
                                    sticky: true,
                                  });
        });
      } else {
        this.loadAllUtilities();
      }
    });
    this.loadDependecies();
  }

  loadDependecies() {
    this.utilityAggregatorService.search({deleted: false}).subscribe(
      {
        next: (data: any[]) => {
          this.createUtilityAggregatorMap(data);
        },
        error: (err) => {
          console.error('Errore nel caricamento degli Asset:', err);
        }
      });
  }

  loadAllUtilities() {
    this.loading = true;
    this.utilitiesService.search({}).subscribe(result => {
      this.list = plainToInstance(Utility, result);
      this.allItems = [...result];
      this.loading = false;

      if (this.selectedId) {
        const utility = result.find(u => u.id === this.selectedId);
        if (utility) setTimeout(() => this.dataTable?.openEditDialog(utility));
      }
    });
  }

  createUtilityAggregatorMap(options: UtilityAggregator[]) {
    this.utilityAggregatorMap = options.reduce((map, item) => {
      map[item.id] = item;
      return map;
    }, {} as { [key: number]: UtilityAggregator });
  }
}
