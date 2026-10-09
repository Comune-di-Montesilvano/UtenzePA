import {Injectable, signal} from '@angular/core';

export type ThemePreference = 'light' | 'dark' | 'system';

// Stessa chiave letta dallo script inline di index.html (applica il tema
// prima del bootstrap, niente lampo bianco): tenerle allineate.
export const THEME_STORAGE_KEY = 'utenzepa-theme';

const CLASSES: Record<Exclude<ThemePreference, 'system'>, string> = {
  light: 'theme-light',
  dark: 'theme-dark',
};

function isPreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

/**
 * Preferenza di tema del browser (non dell'utente: niente backend).
 * "system" = nessuna classe su <html>, decide color-scheme: light dark.
 */
@Injectable({providedIn: 'root'})
export class ThemeService {
  private readonly pref = signal<ThemePreference>(ThemeService.read());
  readonly preference = this.pref.asReadonly();

  constructor() {
    this.apply(this.pref());
  }

  set(pref: ThemePreference): void {
    this.pref.set(pref);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, pref);
    } catch {
      // storage bloccato: la scelta vale fino alla ricarica
    }
    this.apply(pref);
  }

  private apply(pref: ThemePreference): void {
    const root = document.documentElement;
    root.classList.remove(CLASSES.light, CLASSES.dark);
    if (pref !== 'system') {
      root.classList.add(CLASSES[pref]);
    }
  }

  private static read(): ThemePreference {
    try {
      const value = localStorage.getItem(THEME_STORAGE_KEY);
      return isPreference(value) ? value : 'system';
    } catch {
      return 'system';
    }
  }
}
