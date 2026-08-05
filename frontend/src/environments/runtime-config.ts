// Config iniettata a runtime dall'entrypoint nginx (vedi nginx/20-runtime-config.sh),
// letta da un tag <script src="config.js"> caricato prima del bundle Angular (index.html).
// Permette di cambiare apiUrl per ambiente senza rebuild dell'immagine. Assente in `ng serve`
// (nessun nginx): in quel caso si usa sempre il valore statico compilato in environment*.ts.
declare global {
  interface Window {
    __UTENZEPA_CONFIG__?: { apiUrl?: string };
  }
}

export function getRuntimeApiUrl(): string | undefined {
  return typeof window !== 'undefined' ? window.__UTENZEPA_CONFIG__?.apiUrl : undefined;
}
