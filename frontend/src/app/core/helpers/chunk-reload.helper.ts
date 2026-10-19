// Dopo un rilascio una pagina aperta da prima chiede chunk con l'hash vecchio,
// che il nuovo container non ha più (404, "Failed to fetch dynamically imported
// module"): la scheda non si apre. Si ricarica la pagina, che prende
// index.html (no-cache) e i bundle nuovi. Al massimo una volta ogni minuto,
// per non entrare in un ciclo se il chunk manca davvero.
const KEY = 'utenzepa-chunk-reload';
const PATTERN = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i;

export function reloadOnChunkError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (!PATTERN.test(message)) return false;
  try {
    const last = Number(sessionStorage.getItem(KEY) ?? 0);
    if (Date.now() - last < 60_000) return false;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}

// Import dinamico che ricarica la pagina se il chunk non esiste più.
export function loadChunk<T>(load: () => Promise<T>): Promise<T> {
  return load().catch(error => {
    reloadOnChunkError(error);
    throw error;
  });
}
