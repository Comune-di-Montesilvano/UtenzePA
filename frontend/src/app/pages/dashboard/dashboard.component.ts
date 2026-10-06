import {noCigLabel} from '../contracts/contract-kind';
import {Component, Inject, OnInit, ChangeDetectionStrategy} from '@angular/core';
import {CommonModule} from '@angular/common';
import {MatCardModule} from '@angular/material/card';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {UtilityService} from '../utilities/utility.service';
import {Router} from '@angular/router';
import {AssetService} from '../assets/asset.service';
import {Utility} from '../utilities/entity/utility.entity';
import {ThirdPartiesService} from '../third-parties/third-parties.service';
import {PartyRole} from '../third-parties/third-party.model';
import {partyName} from '../../core/helpers/party-name.helper';
import {InvoicesService} from '../invoices/invoices.service';
import {plainToInstance} from 'class-transformer';
import {UtilityType} from '../utility-types/entity/utility-type.entity';
import {HardType} from '../utility-types/enum/hard-type.enum';
import {AnomaliesCardComponent} from './anomalies-card.component';
import {RealEstateContractsCardComponent} from './real-estate-contracts-card.component';
import {PlantInspectionsCardComponent} from './plant-inspections-card.component';
import {ContractsService} from '../contracts/contract.service';
import {Contract} from '../contracts/entity/contract.entity';

/** Colore badge/tag: mappato su classi CSS locali (vedi dashboard.component.css), non più sulle severity PrimeNG. */
type Severity = 'info' | 'success' | 'warn' | 'danger' | 'secondary' | 'contrast';

@Component({
             selector: 'app-dashboard',
             standalone: true,
             imports: [CommonModule, MatCardModule, MatButtonModule, MatIconModule, AnomaliesCardComponent, RealEstateContractsCardComponent, PlantInspectionsCardComponent],
             templateUrl: './dashboard.component.html',
             changeDetection: ChangeDetectionStrategy.Eager,
             styleUrls: ['./dashboard.component.css']
           })
export class DashboardComponent implements OnInit {
  readonly noCigLabel = noCigLabel;
  readonly partyName = partyName;

  today: Date = new Date();
  // Contratti in scadenza: è il contratto che scade, le utenze sono solo
  // quelle che copre.
  expiringContracts: {contract: Contract; days: number}[] = [];
  // Alert contratti in scadenza: finestra di 4 mesi di calendario.
  readonly expireMonths = 4;
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
    private readonly thirdPartiesService: ThirdPartiesService,
    private readonly assetService: AssetService,
    private readonly invoiceService: InvoicesService,
    private utilitiesService: UtilityService,
    private readonly contractsService: ContractsService,
  ) {
  }

  private isoDate(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  loadExpiringContracts(): void {
    this.futureDate = this.expiryWindowEnd();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    this.contractsService.search({supply_expiry_date_range: [this.isoDate(today), this.isoDate(this.futureDate)]} as never)
      .subscribe((contracts: Contract[]) => {
        this.expiringContracts = contracts
          .filter(c => c.supply_expiry_date)
          .map(c => {
            const expiry = new Date(c.supply_expiry_date as unknown as string);
            expiry.setHours(0, 0, 0, 0);
            return {contract: c, days: Math.round((expiry.getTime() - today.getTime()) / 86_400_000)};
          })
          .filter(x => x.days >= 0)
          .sort((a, b) => a.days - b.days);
      });
  }

  utilitiesPreview(contract: Contract): string {
    const codes = (contract.utilities ?? []).map(u => u.utility_id);
    return codes.length > 3 ? `${codes.slice(0, 3).join(', ')} e altre ${codes.length - 3}` : codes.join(', ');
  }

  openContract(id: number): void {
    this.router.navigate(['/contracts'], {queryParams: {selectedId: id}});
  }



  // deadlines: Scadenza[] = [];
  cols: any[] = [];

  ngOnInit() {

    this.loadExpiringContracts();
    this.thirdPartiesService.search({roles: PartyRole.SUPPLIER} as never).subscribe(list => this.suppliersCount = list.length);
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

  private expiryWindowEnd(): Date {
    const end = new Date();
    end.setMonth(end.getMonth() + this.expireMonths);
    return end;
  }

  getSeverity(giorni: number): Severity {
    if (giorni <= 30) return 'danger';
    if (giorni <= 60) return 'warn';
    return 'success';
  }

  navigateToSafeguard() {
    this.router.navigate(['/utilities'], {queryParams: {safeguard: true}});
  }

  navigateToExpiringContracts(): void {
    const today = new Date();
    this.router.navigate(['/contracts'], {
      queryParams: {supply_expiry_date_range: [this.isoDate(today), this.isoDate(this.expiryWindowEnd())].join(',')},
    });
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
