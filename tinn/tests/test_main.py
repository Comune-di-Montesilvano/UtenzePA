import json
import os
from datetime import datetime

from app.main import next_run, recover, startup, tick
from tests.test_job import make_cfg

NOW = datetime(2026, 10, 27, 10, 0)


def runner():
    calls = []
    return calls, lambda force, nxt: calls.append(force)


def test_next_run_is_four_am():
    assert next_run('0 4 * * *', NOW) == datetime(2026, 10, 28, 4, 0)


def test_first_start_runs_immediately(tmp_path):
    cfg = make_cfg(tmp_path)
    calls, run = runner()
    startup(cfg, NOW, run)
    assert calls == [False]


def test_start_after_success_waits(tmp_path):
    cfg = make_cfg(tmp_path)
    (tmp_path / 'inbox' / 'status').write_text(json.dumps({'state': 'unchanged'}))
    calls, run = runner()
    assert startup(cfg, NOW, run) == datetime(2026, 10, 28, 4, 0)
    assert calls == []


def test_request_triggers_forced_run(tmp_path):
    cfg = make_cfg(tmp_path)
    (tmp_path / 'inbox' / 'request').write_text('')
    calls, run = runner()
    tick(cfg, NOW, datetime(2026, 10, 28, 4, 0), run)
    assert calls == [True]
    assert not (tmp_path / 'inbox' / 'request').exists()


def test_scheduled_time_triggers_normal_run(tmp_path):
    cfg = make_cfg(tmp_path)
    calls, run = runner()
    nxt = tick(cfg, datetime(2026, 10, 28, 4, 0, 30), datetime(2026, 10, 28, 4, 0), run)
    assert calls == [False]
    assert nxt == datetime(2026, 10, 29, 4, 0)


def test_nothing_to_do_keeps_next(tmp_path):
    cfg = make_cfg(tmp_path)
    calls, run = runner()
    assert tick(cfg, NOW, datetime(2026, 10, 28, 4, 0), run) == datetime(2026, 10, 28, 4, 0)
    assert calls == []


def test_startup_recovers_interrupted_run(tmp_path):
    cfg = make_cfg(tmp_path)
    box = tmp_path / 'inbox'
    (box / 'status').write_text(json.dumps({'state': 'running', 'step': 'restore'}))
    (box / '.capitoli.csv.tmp').write_text('x')
    (tmp_path / 'work' / 'backup.zip').write_text('x')
    recover(cfg)
    s = json.loads((box / 'status').read_text())
    assert s['state'] == 'error'
    assert s['message'].startswith('Giro interrotto')
    assert sorted(os.listdir(box)) == ['status']
    assert os.listdir(tmp_path / 'work') == []
