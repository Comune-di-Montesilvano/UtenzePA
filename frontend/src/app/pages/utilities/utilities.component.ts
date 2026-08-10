import {Component, ViewChild, ChangeDetectionStrategy} from '@angular/core';
import {ActivatedRoute} from '@angular/router';
import {plainToInstance} from 'class-transformer';
import {UtilityService} from './utility.service';
import {DataTableUtilitiesComponent} from './data-table-utilities.component';
import {SearchUtilitiesComponent} from './search-utilities.component';
import {AbstractComponent} from '../../core/components/abstract.component';
import {Utility} from './entity/utility.entity';

@Component({
  selector: 'app-utilities',
  standalone: true,
  imports: [DataTableUtilitiesComponent, SearchUtilitiesComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './utilities.component.html'
})
export class UtilitiesComponent extends AbstractComponent<Utility> {

  @ViewChild('dataTable') dataTable!: DataTableUtilitiesComponent;

  private selectedId?: number | null;

  constructor(
    protected override service: UtilityService,
    private route: ActivatedRoute
  ) {
    super();
  }

  protected override getEntityIdentifier(entity: Utility): string {
    return `${entity.utility_id}`;
  }

  protected override entityLabel(): string {
    return 'Utenza';
  }

  private formatDateIt(date: Date | string): string {
    return new Date(date).toLocaleDateString('it-IT', {day: '2-digit', month: '2-digit', year: 'numeric'});
  }

  // Logica di deep-link preservata dall'originale: /utilities?selectedId=<id> apre il dialog di
  // modifica di quell'utenza al caricamento; /utilities?safeguard=true e
  // /utilities?supply_expiry_date_range=<from>&<to> precaricano la lista già filtrata (usati da
  // link esterni, es. dalla dashboard) — NON è dead code, va mantenuta integralmente.
  override ngOnInit(): void {
    this.route.queryParams.subscribe(params => {
      this.selectedId = params['selectedId'] ? Number(params['selectedId']) : null;

      if (this.selectedId) {
        this.loadAllUtilities();
      } else if (params['safeguard']) {
        this.loading = true;
        this.service.search({safeguard: true}).subscribe(result => {
          this.list = plainToInstance(Utility, result);
          this.allItems = [...result];
          this.loading = false;
          this.messageService.add({
            severity: 'info',
            summary: 'Filtro applicato',
            detail: 'Utenze filtrate per salvaguardia.'
          });
        });
      } else if (params['supply_expiry_date_range']) {
        const raw: string[] = params['supply_expiry_date_range'];
        const from = raw[0];
        const to = raw[1];
        this.loading = true;
        this.service.search({supply_expiry_date_range: [from, to]}).subscribe(result => {
          this.list = plainToInstance(Utility, result);
          this.allItems = [...result];
          this.loading = false;
          this.messageService.add({
            severity: 'info',
            summary: 'Filtro applicato',
            detail: `Utenze filtrate per scadenza tra ${this.formatDateIt(from)} e ${this.formatDateIt(to)}.`
          });
        });
      } else {
        this.loadAllUtilities();
      }
    });
  }

  private loadAllUtilities(): void {
    this.loading = true;
    this.service.search({}).subscribe(result => {
      this.list = plainToInstance(Utility, result);
      this.allItems = [...result];
      this.loading = false;

      if (this.selectedId) {
        const utility = result.find(u => u.id === this.selectedId);
        if (utility) setTimeout(() => this.dataTable?.openEditDialog(utility));
      }
    });
  }
}
