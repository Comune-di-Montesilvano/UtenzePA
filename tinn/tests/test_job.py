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
