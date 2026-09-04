import {Routes} from "@angular/router";
import {MainLayoutComponent} from "./layout/main-layout.component";
import {LoginComponent} from "./pages/login/login.component";
import {AuthGuard} from "./guards/auth.guard";
import {SystemUsersComponent} from "./pages/system-users/system-users.component";
import {UtilityTypesComponent} from "./pages/utility-types/utility-types.component";
import {SuppliersComponent} from "./pages/suppliers/suppliers.component";
import {AssetAggregatorsComponent} from "./pages/asset-aggregator/asset-aggregator.component";
import {UtilityAggregatorsComponent} from "./pages/utility-aggregator/utility-aggregators.component";
import {BudgetChaptersComponent} from "./pages/budget-chapters/budget-chapters.component";
import {AssetsComponent} from "./pages/assets/assets.component";
import {UtilizerGrantComponent} from "./pages/utilizer-grant/utilizer-grant.component";
import {UtilitiesComponent} from "./pages/utilities/utilities.component";
import {MaintenanceManagersComponent} from "./pages/maintenance-managers/maintenance-managers.component";
import {InvoicesComponent} from "./pages/invoices/invoices.component";
import {ContractsComponent} from "./pages/contracts/contracts.component";
import {DashboardComponent} from "./pages/dashboard/dashboard.component";
import {MapComponent} from "./pages/map/map.component";
import {ConsipAgreementComponent} from './pages/consip-agreement/consip-agreement.component';
import {PurposeComponent} from './pages/purpose/purpose.component';
import {UtilizerComponent} from './pages/utilizer/utilizer.component';
import {SetupComponent} from "./pages/setup/setup.component";
import {SetupGuard} from "./guards/setup.guard";
import {RedirectToSetupGuard} from "./guards/redirect-to-setup.guard";
import {BackupImportComponent} from './pages/backup-import/backup-import.component';
import {BrandingSettingsComponent} from "./pages/branding-settings/branding-settings.component";

export const routes: Routes = [
  {
    path: '',
    component: MainLayoutComponent,
    canActivate: [AuthGuard],
    canActivateChild: [AuthGuard],
    children: [
      {path: '', redirectTo: 'dashboard', pathMatch: 'full'},
      {path: 'system-users', component: SystemUsersComponent},
      {path: 'backup-import', component: BackupImportComponent},
      {path: 'branding', component: BrandingSettingsComponent},
      {path: 'utility-types', component: UtilityTypesComponent},
      {path: 'suppliers', component: SuppliersComponent},
      {path: 'asset-aggregator', component: AssetAggregatorsComponent},
      {path: 'utility-aggregator', component: UtilityAggregatorsComponent},
      {path: 'budget-chapter', component: BudgetChaptersComponent},
      {path: 'building', component: AssetsComponent},
      {path: 'utilizer-grant', component: UtilizerGrantComponent},
      {path: 'utilities', component: UtilitiesComponent},
      {path: 'maintenance-managers', component: MaintenanceManagersComponent},
      {path: 'invoices', component: InvoicesComponent},
      {path: 'contracts', component: ContractsComponent},
      {path: 'consip-agreement', component: ConsipAgreementComponent},
      {path: 'purpose', component: PurposeComponent},
      {path: 'utilizer', component: UtilizerComponent},
      {path: 'utilizer-grant', component: UtilizerGrantComponent},
      {path: 'dashboard', component: DashboardComponent},
      {path: 'map', component: MapComponent},

    ]
  },
  {path: 'setup', component: SetupComponent, canActivate: [SetupGuard]},
  {path: 'login', component: LoginComponent, canActivate: [RedirectToSetupGuard]},
  {path: '**', redirectTo: '', pathMatch: 'full'}
];
