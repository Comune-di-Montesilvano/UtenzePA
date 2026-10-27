import json
import os

from app import inbox
from app.inbox import Settings, deliver, public_message, read_settings, remove_partial, take_request


def make_csvs(tmp_path):
    src = tmp_path / 'out'
    src.mkdir()
    for name in ('capitoli', 'impegni', 'liquidazioni'):
        (src / (name + '.csv')).write_text('h\n')
    return src


def test_deliver_writes_ready_last(tmp_path, monkeypatch):
    box = tmp_path / 'inbox'
    box.mkdir()
    order = []
    real = os.replace
    monkeypatch.setattr(inbox.os, 'replace', lambda a, b: (order.append(os.path.basename(b)), real(a, b)))
    deliver(str(box), str(make_csvs(tmp_path)), {'backup_sha256': 'abc'})
    assert order[-1] == 'ready'
    assert sorted(order[:-1]) == ['capitoli.csv', 'impegni.csv', 'liquidazioni.csv']
    assert json.loads((box / 'ready').read_text())['backup_sha256'] == 'abc'
    assert not [f for f in os.listdir(box) if f.endswith('.tmp')]


def test_deliver_removes_previous_failed(tmp_path):
    box = tmp_path / 'inbox'
    box.mkdir()
    (box / 'ready.failed').write_text('{}')
    deliver(str(box), str(make_csvs(tmp_path)), {'backup_sha256': 'abc'})
    assert not (box / 'ready.failed').exists()


def test_read_settings_missing(tmp_path):
    assert read_settings(str(tmp_path)) == Settings(from_year=2023, loaded_sha256=None)


def test_read_settings_corrupt(tmp_path):
    (tmp_path / 'settings').write_text('not json')
    assert read_settings(str(tmp_path)) == Settings(from_year=2023, loaded_sha256=None)


def test_read_settings_values(tmp_path):
    (tmp_path / 'settings').write_text('{"from_year": 2024, "loaded_sha256": "abc", "loaded_at": null}')
    assert read_settings(str(tmp_path)) == Settings(from_year=2024, loaded_sha256='abc')


def test_take_request_consumes_file(tmp_path):
    assert take_request(str(tmp_path)) is False
    (tmp_path / 'request').write_text('')
    assert take_request(str(tmp_path)) is True
    assert not (tmp_path / 'request').exists()


def test_remove_partial_deletes_tmp_only(tmp_path):
    (tmp_path / '.capitoli.csv.tmp').write_text('x')
    (tmp_path / 'status').write_text('{}')
    remove_partial(str(tmp_path))
    assert sorted(os.listdir(tmp_path)) == ['status']


def test_error_message_hides_password():
    msg = public_message('download', Exception("auth failed for p$a'ss #1"), ["p$a'ss #1"])
    assert "p$a'ss #1" not in msg
    assert msg.startswith('Server SFTP non raggiungibile')


def test_auth_failure_message():
    class AuthenticationException(Exception):
        pass
    msg = public_message('download', AuthenticationException('Authentication failed.'), [])
    assert msg.startswith('Autenticazione SFTP non riuscita')


def test_host_key_message():
    msg = public_message('download', OSError('chiave host del server SFTP diversa da TINN_SFTP_HOST_KEY'), [])
    assert msg.startswith('Chiave host del server SFTP non valida')


def test_missing_file_message():
    msg = public_message('download', FileNotFoundError(2, 'No such file'), [])
    assert msg.startswith('File del backup non trovato sul server SFTP')


def test_remove_partial_keeps_backend_tmp(tmp_path):
    for name in ('.settings.tmp', '.request.tmp', '.capitoli.csv.tmp', '.status.tmp', '.ready.tmp'):
        (tmp_path / name).write_text('x')
    remove_partial(str(tmp_path))
    assert sorted(os.listdir(tmp_path)) == ['.request.tmp', '.settings.tmp']
