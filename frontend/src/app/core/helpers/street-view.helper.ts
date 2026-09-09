// Apre Google Street View in una nuova finestra per una coppia di
// coordinate — nessuna API key/billing (a differenza dell'embed Maps
// Embed API/Static API): un link diretto all'URL pubblico di Google Maps,
// stesso comportamento di un utente che lo apre a mano dal browser. Se non
// c'e' copertura Street View in quel punto, e' Google Maps stesso a
// segnalarlo — nessuna gestione lato nostro.
export class StreetViewHelper {
  static open(lat: string | number, lng: string | number): void {
    const url = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}&layer=c`;
    window.open(url, '_blank', 'noopener');
  }
}
