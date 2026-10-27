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
# Server o firewall che chiudono il collegamento senza dirlo: senza timeout il
# giro resterebbe «in corso» per sempre.
KEEPALIVE_SECONDS = 30
READ_TIMEOUT_SECONDS = 300
# Tipi di chiave da chiedere al server per una chiave RSA indicata a mano.
RSA_TYPES = ('rsa-sha2-512', 'rsa-sha2-256', 'ssh-rsa')


def pinned_key(cfg):
    """TINN_SFTP_HOST_KEY come «tipo base64», accettata anche nella forma di
    known_hosts / ssh-keyscan con il nome dell'host davanti."""
    if not cfg.host_key:
        return None
    parts = cfg.host_key.split()
    if len(parts) >= 3 and not parts[0].startswith(('ssh-', 'ecdsa-')):
        parts = parts[1:]
    return parts[:2]


def _check_host_key(cfg, key):
    seen = key.get_name() + ' ' + key.get_base64()
    if cfg.host_key:
        if pinned_key(cfg) != seen.split():
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
        pinned = pinned_key(cfg)
        if pinned:
            # Il server mostra la chiave del tipo che paramiko preferisce (ed25519):
            # si chiede quella del tipo indicato, altrimenti risulterebbe «diversa».
            transport.get_security_options().key_types = RSA_TYPES if pinned[0] == 'ssh-rsa' else (pinned[0],)
        transport.start_client(timeout=60)
        _check_host_key(cfg, transport.get_remote_server_key())
        transport.auth_password(cfg.user, cfg.password)
        transport.set_keepalive(KEEPALIVE_SECONDS)
        sftp = paramiko.SFTPClient.from_transport(transport)
        sftp.get_channel().settimeout(READ_TIMEOUT_SECONDS)
        stat = sftp.stat(cfg.path)
        sftp.get(cfg.path, dest)
        return datetime.fromtimestamp(stat.st_mtime)
    finally:
        transport.close()

