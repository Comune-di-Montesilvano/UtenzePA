import {Component} from '@angular/core';
import {CommonModule} from '@angular/common';
import {Router, RouterModule} from '@angular/router';
import {AuthService} from '../../services/auth.service';

interface MenuItem {
  label: string;
  icon: string;
  route?: string;
  submenu?: MenuItem[];
  open?: boolean;
}

@Component({
             selector: 'app-sidebar',
             standalone: true,
             imports: [CommonModule, RouterModule],
             templateUrl: './sidebar.component.html',
             styleUrls: ['./sidebar.components.scss']
           })
export class SidebarComponent {
  menu: MenuItem[] = [
    {label: 'Dashboard', icon: 'pi pi-home', route: '/dashboard'},
    {
      label: 'Immobili',
      icon: 'pi pi-building',
      route: '/building',
    },
    {
      label: 'Utenze',
      icon: 'pi pi-bolt',
      route: '/utilities',
    },
    {
      label: 'Concessioni',
      icon: 'pi pi-verified',
      route: '/utilizer-grant',
    },
    {label: 'Fornitori', icon: 'pi pi-truck', route: '/suppliers'},
    {label: 'Capitoli di Spesa', icon: 'pi pi-dollar', route: '/budget-chapter'},
    {label: 'Fatture', icon: 'pi pi-receipt', route: '/invoices'},
    {label: 'Impostazioni', icon: 'pi pi-cog', submenu: [
        {label: 'Aggregati Utenze', icon: 'pi pi-bars', route: '/utility-aggregator'},
        {label: 'Aggregati Immobili', icon: 'pi pi-bars', route: '/asset-aggregator'},
        {label: 'Fornitori Manutenzione', icon: 'pi pi-sliders-h', route: '/maintenance-managers'},
        {label: 'Tipologie uso contatore', icon: 'pi pi-tag', route: '/utility-types'},
        {label: 'Convenzioni CONSIP', icon: 'fa fa-handshake-o', route: '/consip-agreement'},
        {label: 'Finalità d\'uso', icon: 'fa fa-dot-circle-o', route: '/purpose'},
        {label: 'Utilizzatori', icon: 'pi pi-user-plus', route: '/utilizer'},
        {label: 'Backup e Importazione', icon: 'pi pi-database', route: '/backup-import'},
      ]},
    {label: 'Utenti e ruoli', icon: 'pi pi-users', route: '/system-users'},
  ];

  toggleSubmenu(item: MenuItem) {
    if (item.submenu) {
      item.open = !item.open;
    }
  }

  onSubmenuItemClick(parent: MenuItem) {
    this.menu.forEach(m => {
      if (m !== parent) {
        m.open = false;
      }
    });
    parent.open = true;
  }

  constructor(private router: Router, private authService: AuthService) {
  }

  logout() {
    this.authService.logout();
    this.router.navigate(['/login']);
  }

  onMainItemClick() {
    this.menu.forEach(m => m.open = false);
  }
}
