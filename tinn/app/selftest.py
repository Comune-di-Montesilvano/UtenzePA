"""Prova dell'estrazione su un DB Firebird finto (testdata/): crea il DB in
dialect 1 e charset NONE come quello di Tinn, estrae dal 2023 e confronta i
CSV con testdata/expected byte per byte. Uscita 0 = uguali.

python3 -m app.selftest [--write]   (--write rigenera expected, da controllare a mano)
"""
import os
import subprocess
import sys
import tempfile

from app.extract import FILES, extract, isql_path

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(HERE, 'testdata')


def create_db(path):
    with open(os.path.join(DATA, 'schema.sql'), 'rb') as f:
        schema = f.read()
    with open(os.path.join(DATA, 'data.sql'), 'rb') as f:
        data = f.read()
    head = ("SET SQL DIALECT 1;\nCREATE DATABASE '%s' USER SYSDBA DEFAULT CHARACTER SET NONE;\n" % path).encode()
    # Script da file (-i): letto da stdin isql perde l'inizio dello script.
    script = path + '.sql'
    with open(script, 'wb') as f:
        f.write(head + schema + data)
    res = subprocess.run([isql_path(), '-q', '-bail', '-i', script], capture_output=True)
    if res.returncode != 0 or res.stderr.strip():
        raise RuntimeError(res.stderr.decode('cp1252', errors='replace'))


def main(argv):
    write = '--write' in argv
    expected_dir = os.path.join(DATA, 'expected')
    with tempfile.TemporaryDirectory() as tmp:
        db = os.path.join(tmp, 'selftest.fdb')
        out = os.path.join(tmp, 'out')
        os.mkdir(out)
        create_db(db)
        counts = extract(db, 2023, out)
        print(counts)
        ok = True
        for name in FILES:
            with open(os.path.join(out, name + '.csv'), 'rb') as f:
                got = f.read()
            target = os.path.join(expected_dir, name + '.csv')
            if write:
                os.makedirs(expected_dir, exist_ok=True)
                with open(target, 'wb') as f:
                    f.write(got)
                continue
            with open(target, 'rb') as f:
                if f.read() != got:
                    ok = False
                    print('DIVERSO: ' + name + '.csv\n' + got.decode('utf-8'))
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
