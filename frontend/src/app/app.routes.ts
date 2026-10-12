import {Routes} from "@angular/router";
import {MainLayoutComponent} from "./layout/main-layout.component";
import {LoginComponent} from "./pages/login/login.component";
import {AuthGuard} from "./guards/auth.guard";
import {SystemUsersComponent} from "./pages/system-users/system-users.component";
import {UtilityTypesComponent} from "./pages/utility-types/utility-types.component";
import {AssetNatureComponent} from './pages/asset-nature/asset-nature.component';
import {AssetFunctionComponent} from './pages/asset-function/asset-function.component';
import {BudgetChaptersComponent} from "./pages/budget-chapters/budget-chapters.component";
import {AssetsComponent} from "./pages/assets/assets.component";
import {UtilizerGrantComponent} from "./pages/utilizer-grant/utilizer-grant.component";
import {PlantsComponent} from './pages/plants/plants.component';
import {ComplexesComponent} from './pages/complexes/complexes.component';
import {ActTypesComponent} from './pages/act-types/act-types.component';
import {ActsComponent} from './pages/acts/acts.component';
import {UtilitiesComponent} from "./pages/utilities/utilities.component";
import {InvoicesComponent} from "./pages/invoices/invoices.component";
import {ContractsComponent} from "./pages/contracts/contracts.component";
import {DashboardComponent} from "./pages/dashboard/dashboard.component";
import {MapComponent} from "./pages/map/map.component";
import {ConsipAgreementComponent} from './pages/consip-agreement/consip-agreement.component';
import {ThirdPartiesComponent} from './pages/third-parties/third-parties.component';
import {SetupComponent} from "./pages/setup/setup.component";
import {SetupGuard} from "./guards/setup.guard";
import {RedirectToSetupGuard} from "./guards/redirect-to-setup.guard";
import {BackupImportComponent} from './pages/backup-import/backup-import.component';
import {BrandingSettingsComponent} from "./pages/branding-settings/branding-settings.component";
import {AuditLogPageComponent} from "./pages/audit-log/audit-log-page.component";
import {GuidaComponent} from "./pages/guida/guida.component";

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
      {path: 'act-types', component: ActTypesComponent},
      {path: 'third-parties', component: ThirdPartiesComponent},
      {path: 'asset-nature', component: AssetNatureComponent},
      {path: 'asset-function', component: AssetFunctionComponent},
      {path: 'budget-chapter', component: BudgetChaptersComponent},
      {path: 'building', component: AssetsComponent},
      {path: 'complexes', component: ComplexesComponent},
      {path: 'acts', component: ActsComponent},
      {path: 'utilizer-grant', component: UtilizerGrantComponent},
      {path: 'utilities', component: UtilitiesComponent},
      {path: 'plants', component: PlantsComponent},
      {path: 'invoices', component: InvoicesComponent},
      {path: 'contracts', component: ContractsComponent},
      {path: 'consip-agreement', component: ConsipAgreementComponent},
      {path: 'utilizer-grant', component: UtilizerGrantComponent},
      {path: 'dashboard', component: DashboardComponent},
      {path: 'map', component: MapComponent},
      {path: 'audit-log', component: AuditLogPageComponent},
      {path: 'guida', component: GuidaComponent},

    ]
  },
  {path: 'setup', component: SetupComponent, canActivate: [SetupGuard]},
  {path: 'login', component: LoginComponent, canActivate: [RedirectToSetupGuard]},
  {path: '**', redirectTo: '', pathMatch: 'full'}
];
