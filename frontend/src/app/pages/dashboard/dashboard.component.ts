import {Component, Inject, OnInit} from '@angular/core';
import {CommonModule} from '@angular/common';
import {MatCardModule} from '@angular/material/card';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {UtilityService} from '../utilities/utility.service';
import {Router} from '@angular/router';
import {AssetService} from '../assets/asset.service';
import {Utility} from '../utilities/entity/utility.entity';
import {SuppliersService} from '../suppliers/suppliers.service';
import {InvoicesService} from '../invoices/invoices.service';
import {plainToInstance} from 'class-transformer';
import {UtilityType} from '../utility-types/entity/utility-type.entity';
import {HardType} from '../utility-types/enum/hard-type.enum';

/** Colore badge/tag: mappato su classi CSS locali (vedi dashboard.component.css), non più sulle severity PrimeNG. */
type Severity = 'info' | 'success' | 'warn' | 'danger' | 'secondary' | 'contrast';

@Component({
             selector: 'app-dashboard',
             standalone: true,
             imports: [CommonModule, MatCardModule, MatButtonModule, MatIconModule],
             templateUrl: './dashboard.component.html',
             styleUrls: ['./dashboard.component.css']
           })
export class DashboardComponent implements OnInit {

  today: Date = new Date();
  expiringItems: Utility[] = [];
  expireDays: number = 60;
  futureDate: Date | null = null;
  suppliersCount: number = 0;
  utilitiesCount: number = 0;
  assetsCount: number = 0;
  safeGuardedUtilitiesList: Utility[] = [];
  invoiceCosts: number = 0;

  scroll(el: HTMLElement) {
    el.scrollIntoView({behavior: 'smooth'});
  }

  constructor(
    @Inject(UtilityService) private utilityService: UtilityService,
    private router: Router,
    private readonly suppliersService: SuppliersService,
    private readonly assetService: AssetService,
    private readonly invoiceService: InvoicesService,
    private utilitiesService: UtilityService,
  ) {
  }

  loadAllUtilities() {
    this.futureDate = new Date();
    this.futureDate.setDate(this.futureDate.getDate() + this.expireDays);
    const from: string = this.today.toISOString();
    const to: string = this.futureDate.toISOString();
    this.utilitiesService.search({supply_expiry_date_range: [from, to]}).subscribe((utilities: Utility[]) => {
      this.expiringItems = plainToInstance(Utility, utilities)
        .map(utility => {
          const giorniRimanenti = utility.daysUntilExpiry;
          const dataScadenzaFormatted = utility.supply_expiry_date
            ? new Date(utility.supply_expiry_date).toLocaleDateString('it-IT')
            : 'N/D';
          utility.remainingDays = utility.daysUntilExpiry;
          return utility;

          // return {
          //   codice: utility.utility_id || 'N/D',
          //   tipo: utility.utilityType?.name || 'Sconosciuto',
          //   dataScadenza: dataScadenzaFormatted,
          //   giorniRimanenti: giorniRimanenti ?? 0,
          // } as Scadenza;
        })
        .filter(s => s.remainingDays >= 0)
        .sort((a, b) => a.remainingDays - b.remainingDays);
    });
  }


  // deadlines: Scadenza[] = [];
  cols: any[] = [];

  ngOnInit() {

    this.loadAllUtilities();
    this.suppliersService.count().subscribe(c => this.suppliersCount = c);
    this.utilityService.count().subscribe(c => this.utilitiesCount = c);
    this.assetService.count().subscribe(c => this.assetsCount = c);
    this.utilityService.getSafeGuardedUtilities().subscribe(utilities => this.safeGuardedUtilitiesList = utilities);
    this.invoiceService.getMonthlyCosts().subscribe(costs => this.invoiceCosts = costs);

    this.cols = [
      {field: 'codice', header: 'Codice'},
      {field: 'tipo', header: 'Tipo Utenza'},
      {field: 'dataScadenza', header: 'Scadenza'},
      {field: 'giorniRimanenti', header: 'Giorni'}
    ];
  }

  getSeverity(giorni: number): Severity {
    if (giorni <= 20) return 'danger';
    if (giorni <= 40) return 'warn';
    return 'success';
  }

  navigateToSafeguard() {
    this.router.navigate(['/utilities'], {queryParams: {safeguard: true}});
  }

  navigateToExpiringUtilities(): void {
    const today = new Date();
    let futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + this.expireDays);

    const queryParams = {
      supply_expiry_date_range: [today.toISOString(), futureDate.toISOString()],
    };

    this.router.navigate(['/utilities'], {queryParams: queryParams});
  }

  getUtenzaSeverity(type: UtilityType): Severity {
    switch (type.hard_type) {
      case HardType.GAS:
        return 'info';
      case HardType.INTERNET:
        return 'success';
      case HardType.LIGHT:
        return 'warn';
      case HardType.WATER:
        return 'secondary';
      default:
        return 'contrast';
    }
  }
}
