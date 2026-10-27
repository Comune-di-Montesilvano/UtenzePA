"""Un giro: scarica, ripristina, estrae, consegna. Lo stato va in status a ogni
passo; in caso di errore la casella non riceve CSV parziali e la cartella di
lavoro si svuota sempre (tranne known_hosts)."""
import hashlib
import logging
import os
import shutil
import subprocess
import zipfile
from dataclasses import dataclass
from datetime import datetime
from typing import Callable

from app import extract as extract_module
from app import sftp
from app.inbox import deliver, public_message, read_settings, take_request, write_status
from app.sftp import KNOWN_HOSTS

log = logging.getLogger('tinn')
# Il ripristino del backup del Comune dura circa 3 minuti: oltre 2 ore è bloccato.
RESTORE_TIMEOUT_SECONDS = 2 * 60 * 60


@dataclass
class Deps:
    download: Callable
    restore: Callable
    extract: Callable


def restore(fbk, db):
    gbak = os.path.join(os.environ.get('FB_BIN', '/opt/firebird/bin'), 'gbak')
    res = subprocess.run([gbak, '-c', '-p', '16384', '-user', 'SYSDBA', fbk, db], capture_output=True,
                         timeout=RESTORE_TIMEOUT_SECONDS)
    if res.returncode != 0:
        raise RuntimeError(res.stderr.decode('utf-8', errors='replace').strip()[:300] or 'gbak non riuscito')


DEFAULT_DEPS = Deps(download=sftp.download, restore=restore, extract=extract_module.extract)


def now_iso():
    return datetime.now().astimezone().isoformat(timespec='seconds')


def iso(value):
    return value.astimezone().isoformat(timespec='seconds') if value else None


def clean_work(work):
    for name in os.listdir(work):
        if name == KNOWN_HOSTS:
            continue
        path = os.path.join(work, name)
        if os.path.isdir(path):
            shutil.rmtree(path, ignore_errors=True)
        else:
            os.remove(path)


def sha256_of(path):
    digest = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            digest.update(chunk)
    return digest.hexdigest()


def unzip_member(zip_path, member, dest):
    with zipfile.ZipFile(zip_path) as z:
        names = [n for n in z.namelist() if os.path.basename(n) == member]
        if not names:
            raise RuntimeError('%s non trovato nello zip' % member)
        with z.open(names[0]) as src, open(dest, 'wb') as out:
            shutil.copyfileobj(src, out, 1 << 20)


def run_job(cfg, force, next_run_at=None, deps=DEFAULT_DEPS):
    """Restituisce lo stato finale: ok, unchanged o error."""
    status = {'state': 'running', 'step': 'download', 'message': None, 'started_at': now_iso(),
              'finished_at': None, 'backup_sha256': None, 'backup_date': None, 'next_run_at': iso(next_run_at)}

    def step(name):
        status['step'] = name
        write_status(cfg.inbox, status)
        log.info('passo: %s', name)

    try:
        step('download')
        zip_path = os.path.join(cfg.work, 'backup.zip')
        status['backup_date'] = iso(deps.download(cfg, zip_path))
        status['backup_sha256'] = sha256_of(zip_path)
        settings = read_settings(cfg.inbox)
        if not force and status['backup_sha256'] == settings.loaded_sha256:
            status.update(state='unchanged', step=None, finished_at=now_iso())
            write_status(cfg.inbox, status)
            log.info('backup invariato, già caricato da UtenzePA')
            return 'unchanged'

        step('restore')
        fbk = os.path.join(cfg.work, 'backup.fbk')
        db = os.path.join(cfg.work, 'tinn.fdb')
        unzip_member(zip_path, cfg.db_file, fbk)
        os.remove(zip_path)
        deps.restore(fbk, db)
        os.remove(fbk)

        step('extract')
        out = os.path.join(cfg.work, 'out')
        os.mkdir(out)
        counts = deps.extract(db, settings.from_year, out)

        step('deliver')
        deliver(cfg.inbox, out, {'extracted_at': now_iso(), 'backup_sha256': status['backup_sha256'],
                                 'rows': counts})
        status.update(state='ok', step=None, finished_at=now_iso())
        write_status(cfg.inbox, status)
        log.info('consegnati: %s', counts)
        return 'ok'
    except Exception as error:  # noqa: BLE001 — ogni errore chiude il giro con uno stato leggibile
        # Prima si libera il disco: con il disco pieno anche lo stato non si scriverebbe.
        clean_work(cfg.work)
        status.update(state='error', message=public_message(status['step'], error, cfg.secrets()),
                      finished_at=now_iso())
        log.error('%s', status['message'])
        try:
            write_status(cfg.inbox, status)
        except OSError as write_error:
            log.error('stato non scritto: %s', write_error)
        return 'error'
    finally:
        clean_work(cfg.work)
        # «Esegui ora» premuto durante il giro: ignorato, il giro appena fatto basta.
        take_request(cfg.inbox)
