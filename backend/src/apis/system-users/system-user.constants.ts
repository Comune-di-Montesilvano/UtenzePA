// Autore delle scritture automatiche (import fatture dalla PEC, giri di sistema).
// Id fisso e negativo: uguale in ogni database, così un export/import (che esclude
// system_users) non attribuisce le righe a una persona, e non sposta l'AUTO_INCREMENT.
// Disattivo e senza password: non accede; nascosto da elenco utenti e wizard /setup.
export const SYSTEM_USER_ID = -1;
