import {FilterDef} from '../../core/components/list/filter-def';
import {SYSTEM_USER_ROLE_OPTIONS, SYSTEM_USER_STATUS_OPTIONS} from './system-user-edit-dialog.component';

// Filtri dell'elenco utenti (nessun ripristino: niente filtro eliminati).
export function systemUserFilters(): FilterDef[] {
  return [
    {key: 'role', label: 'Ruolo', type: 'select', inline: true, options: SYSTEM_USER_ROLE_OPTIONS},
    {key: 'status', label: 'Stato', type: 'select', inline: true, options: SYSTEM_USER_STATUS_OPTIONS},
    {key: 'email', label: 'Nome o email', type: 'text'},
  ];
}
