// Apre Google Street View in una nuova finestra per una coppia di
// coordinate — nessuna API key/billing (a differenza dell'embed Maps
// Embed API/Static API): un link diretto all'URL pubblico di Google Maps,
// stesso comportamento di un utente che lo apre a mano dal browser. Se non
// c'e' copertura Street View in quel punto, e' Google Maps stesso a
// segnalarlo — nessuna gestione lato nostro.
export class StreetViewHelper {
  static open(lat: string | number, lng: string | number): void {
    // Solo i parametri della spec ufficiale del deep-link pano
    // (viewpoint/heading/pitch/fov, tutti opzionali tranne viewpoint):
    // https://developers.google.com/maps/documentation/urls/get-started#street-view-action
    // `&layer=c` (residuo del vecchio schema URL Street View
    // maps.google.com/maps?layer=c&cbll=...) non fa parte di questa spec —
    // Google inizializza pano e layer in conflitto, canvas nero finche' un
    // pan/drag non forza un redraw pulito (bug osservato: schermo nero
    // all'apertura, si sistema al primo movimento).
    const url = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`;
    window.open(url, '_blank', 'noopener');
  }
}
