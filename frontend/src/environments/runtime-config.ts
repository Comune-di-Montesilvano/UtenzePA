// Config iniettata a runtime dall'entrypoint nginx (vedi nginx/20-runtime-config.sh),
// letta da un tag <script src="config.js"> caricato prima del bundle Angular (index.html).
// Permette di cambiare apiUrl/Sentry per ambiente senza rebuild dell'immagine. Assente in
// `ng serve` (nessun nginx): in quel caso si usa sempre il valore statico compilato in
// environment*.ts.
declare global {
  interface Window {
    __UTENZEPA_CONFIG__?: {
      apiUrl?: string;
      sentryDsn?: string;
      sentryEnvironment?: string;
      appVersion?: string;
    };
  }
}

export function getRuntimeApiUrl(): string | undefined {
  return typeof window !== 'undefined' ? window.__UTENZEPA_CONFIG__?.apiUrl : undefined;
}

export function getRuntimeSentryDsn(): string | undefined {
  return typeof window !== 'undefined' ? window.__UTENZEPA_CONFIG__?.sentryDsn : undefined;
}

export function getRuntimeSentryEnvironment(): string | undefined {
  return typeof window !== 'undefined' ? window.__UTENZEPA_CONFIG__?.sentryEnvironment : undefined;
}

export function getRuntimeAppVersion(): string | undefined {
  return typeof window !== 'undefined' ? window.__UTENZEPA_CONFIG__?.appVersion : undefined;
}
