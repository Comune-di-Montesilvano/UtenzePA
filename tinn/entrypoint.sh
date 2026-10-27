#!/bin/sh
# Parte come root solo per sistemare i volumi (un volume nuovo può nascere di
# root), poi gira come uid 1000 nel gruppo 1001: è il gruppo dell'utente
# dell'API in produzione, che deve leggere e cancellare i file della casella.
set -e
chown 1000:1001 /inbox /work
chmod 2775 /inbox
chmod 0700 /work
exec setpriv --reuid=1000 --regid=1001 --clear-groups python3 -m app.main
