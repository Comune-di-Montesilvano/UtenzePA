import hashlib
import json
import os
import subprocess
import zipfile
from datetime import datetime

import pytest

from app import job
from app.config import Config, ConfigError
from app.job import Deps, run_job

PASSWORD = "p$a'ss #1"


def make_cfg(tmp_path, **kw):
    for d in ('inbox', 'work'):
        (tmp_path / d).mkdir(exist_ok=True)
    base = dict(inbox=str(tmp_path / 'inbox'), work=str(tmp_path / 'work'), host='sftp.example', port=22,
                user='u', password=PASSWORD, path='/b.zip', db_file='DB.fbk', host_key=None,
                cron='0 4 * * *', local_zip=None)
    base.update(kw)
    return Config(**base)


def fake_download(member='DB.fbk', content=b'fbk'):
    def download(cfg, dest):
        with zipfile.ZipFile(dest, 'w') as z:
            z.writestr(zipfile.ZipInfo(member, date_time=(2026, 10, 22, 21, 0, 0)), content)
        return datetime(2026, 10, 22, 21, 0)
    return download


def fake_extract(db, from_year, out):
    for name in ('capitoli', 'impegni', 'liquidazioni'):
        with open(os.path.join(out, name + '.csv'), 'w') as f:
            f.write('h\n')
    return {'capitoli': 1, 'impegni': 1, 'liquidazioni': 1}


def zip_sha(tmp, member='DB.fbk', content=b'fbk'):
    path = os.path.join(tmp, 'probe.zip')
    fake_download(member, content)(None, path)
    with open(path, 'rb') as f:
        sha = hashlib.sha256(f.read()).hexdigest()
    os.remove(path)
    return sha


def status(cfg):
    with open(os.path.join(cfg.inbox, 'status')) as f:
        return json.load(f)


def deps(**kw):
    calls = []
    base = dict(download=fake_download(), restore=lambda fbk, db: calls.append('restore'), extract=fake_extract)
    base.update(kw)
    return Deps(**base), calls


def test_ok_run_delivers_and_cleans_work(tmp_path):
    cfg = make_cfg(tmp_path)
    d, calls = deps()
    assert run_job(cfg, force=False, deps=d) == 'ok'
    assert calls == ['restore']
    assert sorted(os.listdir(cfg.inbox)) == ['capitoli.csv', 'impegni.csv', 'liquidazioni.csv', 'ready', 'status']
    assert status(cfg)['state'] == 'ok'
    assert status(cfg)['backup_date'].startswith('2026-10-22')
    assert os.listdir(cfg.work) == []


def test_unchanged_backup_skips_restore(tmp_path):
    cfg = make_cfg(tmp_path)
    sha = zip_sha(str(tmp_path))
    (tmp_path / 'inbox' / 'settings').write_text(json.dumps({'from_year': 2023, 'loaded_sha256': sha}))
    d, calls = deps()
    assert run_job(cfg, force=False, deps=d) == 'unchanged'
    assert calls == []
    assert status(cfg)['backup_sha256'] == sha
    assert not (tmp_path / 'inbox' / 'ready').exists()


def test_force_never_skips(tmp_path):
    cfg = make_cfg(tmp_path)
    sha = zip_sha(str(tmp_path))
    (tmp_path / 'inbox' / 'settings').write_text(json.dumps({'loaded_sha256': sha}))
    d, calls = deps()
    assert run_job(cfg, force=True, deps=d) == 'ok'
    assert calls == ['restore']


def test_backup_not_loaded_is_redelivered(tmp_path):
    cfg = make_cfg(tmp_path)
    (tmp_path / 'inbox' / 'settings').write_text(json.dumps({'loaded_sha256': 'other'}))
    d, calls = deps()
    assert run_job(cfg, force=False, deps=d) == 'ok'
    assert run_job(cfg, force=False, deps=d) == 'ok'
    assert calls == ['restore', 'restore']


def test_missing_fbk_in_zip(tmp_path):
    cfg = make_cfg(tmp_path)
    d, _ = deps(download=fake_download(member='ALTRO.fbk'))
    assert run_job(cfg, force=False, deps=d) == 'error'
    s = status(cfg)
    assert s['step'] == 'restore'
    assert 'DB.fbk' in s['message']
    assert os.listdir(cfg.work) == []


def test_restore_failure_cleans_work_dir(tmp_path):
    cfg = make_cfg(tmp_path)

    def broken(fbk, db):
        with open(db, 'wb') as f:
            f.write(b'half')
        raise RuntimeError('gbak: I/O error')

    d, _ = deps(restore=broken)
    assert run_job(cfg, force=False, deps=d) == 'error'
    assert status(cfg)['message'].startswith('Ripristino del backup non riuscito')
    assert os.listdir(cfg.work) == []
    assert not [f for f in os.listdir(cfg.inbox) if f.endswith('.csv')]


def test_known_hosts_survives_cleanup(tmp_path):
    cfg = make_cfg(tmp_path)
    (tmp_path / 'work' / 'known_hosts').write_text('k')
    d, _ = deps()
    run_job(cfg, force=False, deps=d)
    assert os.listdir(cfg.work) == ['known_hosts']


def test_error_status_hides_password(tmp_path):
    cfg = make_cfg(tmp_path)

    def failing(c, dest):
        raise OSError('Authentication failed for ' + PASSWORD)

    d, _ = deps(download=failing)
    assert run_job(cfg, force=False, deps=d) == 'error'
    assert PASSWORD not in json.dumps(status(cfg))


def test_sftp_password_not_in_argv(tmp_path, monkeypatch):
    cfg = make_cfg(tmp_path)
    seen = []

    def fake_run(args, **kw):
        seen.append(' '.join(args))
        with open(args[-1], 'wb') as f:
            f.write(b'db')
        return subprocess.CompletedProcess(args, 0, b'', b'')

    monkeypatch.setattr(job.subprocess, 'run', fake_run)
    d, _ = deps(restore=job.restore)
    assert run_job(cfg, force=False, deps=d) == 'ok'
    assert seen
    assert all(PASSWORD not in a for a in seen)


def test_config_requires_sftp_without_local_zip():
    with pytest.raises(ConfigError) as e:
        Config.from_env({'TINN_DB_FILE': 'DB.fbk'})
    assert 'TINN_SFTP_HOST' in str(e.value)
    assert Config.from_env({'TINN_DB_FILE': 'DB.fbk', 'TINN_LOCAL_ZIP': '/x.zip'}).local_zip == '/x.zip'


class FakeChannel:
    def __init__(self):
        self.timeout = None

    def settimeout(self, value):
        self.timeout = value


class FakeSecurity:
    key_types = ('ssh-ed25519', 'ecdsa-sha2-nistp256', 'rsa-sha2-512', 'rsa-sha2-256', 'ssh-rsa')


class FakeTransport:
    last = None

    def __init__(self, addr):
        FakeTransport.last = self
        self.keepalive = None
        self.security = FakeSecurity()
        self.key_types_at_start = None

    def get_security_options(self):
        return self.security

    def start_client(self, timeout=None):
        self.key_types_at_start = tuple(self.security.key_types)

    def get_remote_server_key(self):
        class Key:
            def get_name(self):
                return 'ssh-rsa'

            def get_base64(self):
                return 'AAAAkey'
        return Key()

    def set_keepalive(self, seconds):
        self.keepalive = seconds

    def auth_password(self, user, password):
        pass

    def close(self):
        pass


class FakeSftp:
    def __init__(self):
        self.channel = FakeChannel()

    def get_channel(self):
        return self.channel

    def stat(self, path):
        class S:
            st_mtime = 1761500000
        return S()

    def get(self, path, dest):
        open(dest, 'wb').close()


def patch_paramiko(monkeypatch):
    sftp_client = FakeSftp()
    monkeypatch.setattr(job.sftp.paramiko, 'Transport', FakeTransport)
    monkeypatch.setattr(job.sftp.paramiko.SFTPClient, 'from_transport', lambda t: sftp_client)
    return sftp_client


def test_sftp_download_has_timeouts(tmp_path, monkeypatch):
    client = patch_paramiko(monkeypatch)
    cfg = make_cfg(tmp_path)
    job.sftp.download(cfg, str(tmp_path / 'work' / 'b.zip'))
    assert FakeTransport.last.keepalive == 30
    assert client.channel.timeout == 300


def test_pinned_rsa_host_key_restricts_key_types(tmp_path, monkeypatch):
    patch_paramiko(monkeypatch)
    cfg = make_cfg(tmp_path, host_key='sftp.example ssh-rsa AAAAkey')
    job.sftp.download(cfg, str(tmp_path / 'work' / 'b.zip'))
    assert FakeTransport.last.key_types_at_start == ('rsa-sha2-512', 'rsa-sha2-256', 'ssh-rsa')


def test_gbak_has_timeout(tmp_path, monkeypatch):
    seen = {}

    def fake_run(args, **kw):
        seen.update(kw)
        return subprocess.CompletedProcess(args, 0, b'', b'')

    monkeypatch.setattr(job.subprocess, 'run', fake_run)
    job.restore(str(tmp_path / 'a.fbk'), str(tmp_path / 'a.fdb'))
    assert seen.get('timeout')


def test_status_write_failure_does_not_escape(tmp_path, monkeypatch):
    cfg = make_cfg(tmp_path)

    def failing(cfg, dest):
        open(dest, 'wb').write(b'x')
        raise OSError(28, 'No space left on device')

    calls = {'n': 0}
    real = job.write_status

    def flaky_write(box, status):
        calls['n'] += 1
        if status.get('state') == 'error':
            raise OSError(28, 'No space left on device')
        real(box, status)

    monkeypatch.setattr(job, 'write_status', flaky_write)
    d, _ = deps(download=failing)
    assert run_job(cfg, force=False, deps=d) == 'error'
    assert os.listdir(cfg.work) == []


def test_disk_full_message(tmp_path):
    from app.inbox import public_message
    msg = public_message('download', OSError(28, 'No space left on device'), [])
    assert msg.startswith('Spazio su disco esaurito')


def test_request_during_run_is_ignored(tmp_path):
    cfg = make_cfg(tmp_path)

    def download_with_request(cfg, dest):
        (tmp_path / 'inbox' / 'request').write_text('')
        return fake_download()(cfg, dest)

    d, _ = deps(download=download_with_request)
    run_job(cfg, force=True, deps=d)
    assert not (tmp_path / 'inbox' / 'request').exists()


def test_amounts_round_half_up_exactly():
    from app.extract import to_amount
    assert to_amount('0.125') == '0.13'
    assert to_amount('1.005') == '1.01'
    assert to_amount('2.675') == '2.68'


def test_adjusted_budget_sum_is_exact():
    from app.extract import chapter_rows
    row = chapter_rows([['2026', '100', '0', 'X', '1.004', '0.001']])[0]
    assert row[4] == '1.00'
    assert row[5] == '1.01'
