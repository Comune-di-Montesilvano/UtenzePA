import {Injectable} from '@angular/core';
import {NativeDateAdapter} from '@angular/material/core';

/**
 * DateAdapter custom per il parsing italiano nei campi `matDatepicker`.
 *
 * `NativeDateAdapter` di default usa `Date.parse()` per interpretare il
 * testo digitato dall'utente, che è US/ISO-centrico (mese/giorno), non
 * italiano (giorno/mese). Con giorno <= 12 questo porta a corruzione
 * silenziosa dei dati (es. "05/06/2027", inteso come 5 giugno, viene
 * interpretato come 6 maggio senza nessun errore di validazione).
 *
 * Questo adapter accetta SOLO il formato `dd/mm/yyyy` (con separatori
 * `/`, `-` o `.`), rifiuta esplicitamente qualsiasi altro formato (niente
 * fallback a `Date.parse()`) e valida che giorno/mese/anno risultanti
 * combacino esattamente con quanto digitato (rifiuta es. 32/13, 31/02).
 */
@Injectable()
export class ItDateAdapter extends NativeDateAdapter {
  override parse(value: unknown): Date | null {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return null;
      const match = trimmed.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
      if (!match) return this.invalid();
      const day = Number(match[1]);
      const month = Number(match[2]);
      const year = Number(match[3]);
      const date = new Date(year, month - 1, day);
      const isExactMatch = date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
      return isExactMatch ? date : this.invalid();
    }
    return super.parse(value);
  }
}
