"""Casella condivisa con UtenzePA (volume accounting_inbox).

Scritti dal container: capitoli.csv, impegni.csv, liquidazioni.csv, poi ready
per ultimo (UtenzePA legge i CSV solo se c'è ready) e status. Scritti da
UtenzePA: settings (anno di partenza, ultimo backup caricato) e request
(«Esegui ora»). Ogni scrittura passa da un file .tmp e os.replace, così
nessuno legge mai un file a metà.
"""
import errno
import json
import os
from dataclasses import dataclass

CSV_NAMES = ('capitoli', 'impegni', 'liquidazioni')
DEFAULT_FROM_YEAR = 2023
MODE = 0o664

STEP_MESSAGES = {
    'download': 'Server SFTP non raggiungibile',
    'restore': 'Ripristino del backup non riuscito',
    'extract': 'Estrazione dei dati non riuscita',
    'deliver': 'Consegna dei file a UtenzePA non riuscita',
}


@dataclass
class Settings:
    from_year: int = DEFAULT_FROM_YEAR
    loaded_sha256: str | None = None


def _replace_from_tmp(path, write):
    tmp = os.path.join(os.path.dirname(path), '.' + os.path.basename(path) + '.tmp')
    with open(tmp, 'wb') as f:
        write(f)
    os.chmod(tmp, MODE)
    os.replace(tmp, path)


def write_json_atomic(path, data):
    _replace_from_tmp(path, lambda f: f.write(json.dumps(data, ensure_ascii=False).encode('utf-8')))


def read_json(path):
    try:
        with open(path, encoding='utf-8') as f:
            data = json.load(f)
        return data if isinstance(data, dict) else None
    except (OSError, ValueError):
        return None


def read_settings(box):
    data = read_json(os.path.join(box, 'settings')) or {}
    year = data.get('from_year')
    sha = data.get('loaded_sha256')
    return Settings(
        from_year=year if isinstance(year, int) and year > 0 else DEFAULT_FROM_YEAR,
        loaded_sha256=sha if isinstance(sha, str) and sha else None,
    )


def read_status(box):
    return read_json(os.path.join(box, 'status'))


def write_status(box, status):
    write_json_atomic(os.path.join(box, 'status'), status)


def deliver(box, csv_dir, ready):
    """Copia i tre CSV nella casella e scrive ready per ultimo."""
    for stale in ('ready', 'ready.failed'):
        try:
            os.remove(os.path.join(box, stale))
        except FileNotFoundError:
            pass
    for name in CSV_NAMES:
        with open(os.path.join(csv_dir, name + '.csv'), 'rb') as src:
            content = src.read()
        _replace_from_tmp(os.path.join(box, name + '.csv'), lambda f, c=content: f.write(c))
    write_json_atomic(os.path.join(box, 'ready'), ready)


def take_request(box):
    try:
        os.remove(os.path.join(box, 'request'))
        return True
    except FileNotFoundError:
        return False


# .tmp del container; quelli di UtenzePA (settings, request) non si toccano.
OWN_TMP = tuple('.%s.tmp' % name for name in [n + '.csv' for n in CSV_NAMES] + ['status', 'ready'])


def remove_partial(box):
    """Toglie i .tmp lasciati da un giro interrotto."""
    for name in os.listdir(box):
        if name in OWN_TMP:
            os.remove(os.path.join(box, name))


def _download_base(error):
    if type(error).__name__ in ('AuthenticationException', 'BadAuthenticationType'):
        return 'Autenticazione SFTP non riuscita (utente o password)'
    if 'chiave host' in str(error):
        return 'Chiave host del server SFTP non valida'
    if isinstance(error, FileNotFoundError) or getattr(error, 'errno', None) == errno.ENOENT:
        return 'File del backup non trovato sul server SFTP'
    return STEP_MESSAGES['download']


def public_message(step, error, secrets):
    """Messaggio per la pagina Contabilità: in italiano, breve, senza segreti."""
    detail = str(error).strip().splitlines()[0][:200] if str(error).strip() else ''
    for secret in secrets:
        if secret:
            detail = detail.replace(secret, '***')
    if isinstance(error, OSError) and error.errno == errno.ENOSPC:
        return 'Spazio su disco esaurito nel container Tinn (volume tinn_work)'
    base = _download_base(error) if step == 'download' else STEP_MESSAGES.get(step, 'Errore')
    return base + (': ' + detail if detail else '')
