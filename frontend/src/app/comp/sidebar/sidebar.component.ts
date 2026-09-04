import {Component, ChangeDetectionStrategy, OnInit} from '@angular/core';

import {Router, RouterModule} from '@angular/router';
import {MatIconModule} from '@angular/material/icon';
import {AuthService} from '../../services/auth.service';
import {VersionService} from '../../services/version.service';

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
             imports: [RouterModule, MatIconModule],
             templateUrl: './sidebar.component.html',
             changeDetection: ChangeDetectionStrategy.Eager,
             styleUrls: ['./sidebar.components.scss']
           })
export class SidebarComponent implements OnInit {
  appVersion = '';

  menu: MenuItem[] = [
    {label: 'Dashboard', icon: 'home', route: '/dashboard'},
    {label: 'Mappa', icon: 'map', route: '/map'},
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
    {label: 'Contratti', icon: 'description', route: '/contracts'},
    {label: 'Impostazioni', icon: 'settings', submenu: [
        {label: 'Aggregati Utenze', icon: 'list', route: '/utility-aggregator'},
        {label: 'Aggregati Immobili', icon: 'list', route: '/asset-aggregator'},
        {label: 'Fornitori Manutenzione', icon: 'tune', route: '/maintenance-managers'},
        {label: 'Tipologie uso contatore', icon: 'sell', route: '/utility-types'},
        {label: 'Convenzioni CONSIP', icon: 'handshake', route: '/consip-agreement'},
        {label: 'Finalità d\'uso', icon: 'radio_button_checked', route: '/purpose'},
        {label: 'Utilizzatori', icon: 'person_add', route: '/utilizer'},
        {label: 'Backup e Importazione', icon: 'storage', route: '/backup-import'},
        {label: 'Branding', icon: 'palette', route: '/branding'},
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

  // rif. publiccode.yml "url" — non letto a runtime dal frontend (file
  // servito solo per compliance AGID), duplicato qui come costante.
  repoUrl = 'https://github.com/Comune-di-Montesilvano/UtenzePA';

  constructor(private router: Router, private authService: AuthService, private versionService: VersionService) {
  }

  ngOnInit() {
    this.versionService.getVersion().then(v => this.appVersion = v);
  }

  logout() {
    this.authService.logout();
    this.router.navigate(['/login']);
  }

  onMainItemClick() {
    this.menu.forEach(m => m.open = false);
  }
}
