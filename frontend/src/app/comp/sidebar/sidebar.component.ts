import {Component} from '@angular/core';
import {CommonModule} from '@angular/common';
import {Router, RouterModule} from '@angular/router';
import {MatIconModule} from '@angular/material/icon';
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
             imports: [CommonModule, RouterModule, MatIconModule],
             templateUrl: './sidebar.component.html',
             styleUrls: ['./sidebar.components.scss']
           })
export class SidebarComponent {
  menu: MenuItem[] = [
    {label: 'Dashboard', icon: 'home', route: '/dashboard'},
    {
      label: 'Immobili',
      icon: 'apartment',
      route: '/building',
    },
    {
      label: 'Utenze',
      icon: 'bolt',
      route: '/utilities',
    },
    {
      label: 'Concessioni',
      icon: 'verified',
      route: '/utilizer-grant',
    },
    {label: 'Fornitori', icon: 'local_shipping', route: '/suppliers'},
    {label: 'Capitoli di Spesa', icon: 'attach_money', route: '/budget-chapter'},
    {label: 'Fatture', icon: 'receipt_long', route: '/invoices'},
    {label: 'Impostazioni', icon: 'settings', submenu: [
        {label: 'Aggregati Utenze', icon: 'list', route: '/utility-aggregator'},
        {label: 'Aggregati Immobili', icon: 'list', route: '/asset-aggregator'},
        {label: 'Fornitori Manutenzione', icon: 'tune', route: '/maintenance-managers'},
        {label: 'Tipologie uso contatore', icon: 'sell', route: '/utility-types'},
        {label: 'Convenzioni CONSIP', icon: 'handshake', route: '/consip-agreement'},
        {label: 'Finalità d\'uso', icon: 'radio_button_checked', route: '/purpose'},
        {label: 'Utilizzatori', icon: 'person_add', route: '/utilizer'},
        {label: 'Backup e Importazione', icon: 'storage', route: '/backup-import'},
      ]},
    {label: 'Utenti e ruoli', icon: 'group', route: '/system-users'},
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
