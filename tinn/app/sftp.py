"""Scaricamento del backup via SFTP (paramiko: la password resta in memoria, mai
in un argomento di processo). Chiave host: TINN_SFTP_HOST_KEY se impostata,
altrimenti quella vista al primo collegamento, salvata in known_hosts nella
cartella di lavoro e verificata ai collegamenti successivi.
"""
import os
import shutil
from datetime import datetime

import paramiko

KNOWN_HOSTS = 'known_hosts'


def _check_host_key(cfg, key):
    seen = key.get_name() + ' ' + key.get_base64()
    if cfg.host_key:
        if cfg.host_key.split()[:2] != seen.split():
            raise OSError('chiave host del server SFTP diversa da TINN_SFTP_HOST_KEY')
        return
    path = os.path.join(cfg.work, KNOWN_HOSTS)
    entry = '%s %s' % (cfg.host, seen)
    if os.path.exists(path):
        with open(path) as f:
            known = [line.strip() for line in f if line.startswith(cfg.host + ' ')]
        if known and entry not in known:
            raise OSError('chiave host del server SFTP cambiata dal primo collegamento')
        if known:
            return
    with open(path, 'a') as f:
        f.write(entry + '\n')


def download(cfg, dest):
    """Scarica il backup in dest; restituisce data e ora del file sul server."""
    if cfg.local_zip:
        shutil.copyfile(cfg.local_zip, dest)
        return datetime.fromtimestamp(os.path.getmtime(cfg.local_zip))
    transport = paramiko.Transport((cfg.host, cfg.port))
    try:
        transport.start_client(timeout=60)
        _check_host_key(cfg, transport.get_remote_server_key())
        transport.auth_password(cfg.user, cfg.password)
        sftp = paramiko.SFTPClient.from_transport(transport)
        stat = sftp.stat(cfg.path)
        sftp.get(cfg.path, dest)
        return datetime.fromtimestamp(stat.st_mtime)
    finally:
        transport.close()

