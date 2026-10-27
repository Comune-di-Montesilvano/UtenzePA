"""Scheduler del container: primo giro subito se non ce n'è mai stato uno
riuscito, poi a TINN_CRON (fuso TZ) e su richiesta di UtenzePA («Esegui ora»,
file request nella casella). Un giro alla volta, controllo ogni minuto."""
import logging
import os
import sys
import time
from datetime import datetime, timedelta

from croniter import croniter

from app.config import Config, ConfigError
from app.inbox import read_status, remove_partial, take_request, write_status
from app.job import clean_work, now_iso, run_job

log = logging.getLogger('tinn')
POLL_SECONDS = 60
STARTUP_RETRY_AFTER = timedelta(minutes=30)


def next_run(cron, after):
    return croniter(cron, after).get_next(datetime)


def recover(cfg):
    """Ripulisce dopo un riavvio a metà giro."""
    status = read_status(cfg.inbox)
    remove_partial(cfg.inbox)
    clean_work(cfg.work)
    if status and status.get('state') == 'running':
        status.update(state='error', message='Giro interrotto: il container si è fermato durante il giro',
                      finished_at=now_iso())
        write_status(cfg.inbox, status)


def _started(status):
    try:
        value = datetime.fromisoformat(status.get('started_at') or '')
    except ValueError:
        return None
    return value.astimezone().replace(tzinfo=None) if value.tzinfo else value


def run_at_startup(status, now):
    """Primo avvio, configurazione corretta o errore vecchio: si parte subito. Un
    errore recente no: un container che si riavvia di continuo riscaricherebbe il
    backup a ogni riavvio. Resta «Esegui ora» o il giro programmato."""
    if not status:
        return True
    if status.get('state') in ('ok', 'unchanged'):
        return False
    if status.get('step') == 'config':
        return True
    started = _started(status)
    return started is None or now - started > STARTUP_RETRY_AFTER


def startup(cfg, now, run):
    """Restituisce l'orario del prossimo giro programmato."""
    status = read_status(cfg.inbox)
    recover(cfg)
    nxt = next_run(cfg.cron, now)
    if run_at_startup(status, now):
        run(False, nxt)
    return nxt


def tick(cfg, now, nxt, run):
    if take_request(cfg.inbox):
        run(True, next_run(cfg.cron, now))
        return next_run(cfg.cron, now)
    if now >= nxt:
        upcoming = next_run(cfg.cron, now)
        run(False, upcoming)
        return upcoming
    return nxt


def safe_tick(cfg, now, nxt, run):
    """tick che non fa mai uscire il processo: un'uscita, con restart
    unless-stopped, diventerebbe un riavvio con un nuovo giro."""
    try:
        return tick(cfg, now, nxt, run)
    except Exception:  # noqa: BLE001
        log.exception('controllo non riuscito')
        return nxt


def report_config_error(box, message):
    write_status(box, {'state': 'error', 'step': 'config', 'message': 'Configurazione incompleta: ' + message,
                       'started_at': now_iso(), 'finished_at': now_iso(), 'backup_sha256': None,
                       'backup_date': None, 'next_run_at': None})


def main():
    logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
    try:
        cfg = Config.from_env(os.environ)
    except ConfigError as error:
        # Niente uscita: con restart unless-stopped ripartirebbe di continuo. L'errore
        # resta nello stato, che la pagina Contabilità mostra, finché non si corregge il .env.
        log.error('%s', error)
        report_config_error(os.environ.get('TINN_INBOX') or '/inbox', str(error))
        while True:
            time.sleep(3600)

    def run(force, nxt):
        run_job(cfg, force, next_run_at=nxt)

    try:
        nxt = startup(cfg, datetime.now(), run)
    except Exception:  # noqa: BLE001
        log.exception('avvio non riuscito')
        nxt = next_run(cfg.cron, datetime.now())
    log.info('prossimo giro: %s', nxt.isoformat(timespec='minutes'))
    while True:
        time.sleep(POLL_SECONDS)
        nxt = safe_tick(cfg, datetime.now(), nxt, run)


if __name__ == '__main__':
    sys.exit(main())
