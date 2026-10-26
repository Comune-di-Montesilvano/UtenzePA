#!/bin/sh
# Controllo delle migration su un database VUOTO (job migrations di tests.yml):
#   1. tutte le migration applicate da zero (installazione nuova di un altro ente);
#   2. schema:log = solo le differenze note di src/database/schema-drift.baseline.txt
#      (entity e migration allineate: niente colonne/indici dimenticati);
#   3. giro down -> up delle ultime N migration (N = argomento, minimo 1), di nuovo
#      con schema:log invariato.
# Variabili MYSQL_* come src/database/data-source.ts. Da lanciare in backend/.
# In locale (container api, DB di prova creato prima, mai quello di lavoro):
#   docker exec -e MYSQL_DB=ci_check utenzepa-api-1 sh scripts/check-migrations.sh 3
set -eu

revert_count=${1:-1}
[ "$revert_count" -ge 1 ] 2>/dev/null || revert_count=1

typeorm() {
  node -r ts-node/register -r tsconfig-paths/register node_modules/typeorm/cli.js "$@" \
    -d src/database/data-source.ts
}

check_drift() {
  # Righe SQL di schema:log, ordinate come nella baseline (senza colori ANSI).
  typeorm schema:log | sed 's/\x1b\[[0-9;]*m//g' | grep -E '^(ALTER|CREATE|DROP)' \
    | LC_ALL=C sort > /tmp/schema-drift.sql || true
  grep -E '^(ALTER|CREATE|DROP)' src/database/schema-drift.baseline.txt \
    | LC_ALL=C sort > /tmp/schema-drift.baseline.txt
  if ! diff -u /tmp/schema-drift.baseline.txt /tmp/schema-drift.sql; then
    echo "::error::Entity e migration non allineate ($1): righe + = differenze nuove," \
      "righe - = differenze tolte (aggiornare src/database/schema-drift.baseline.txt)."
    exit 1
  fi
  echo "schema:log come la baseline ($1)."
}

echo "== Migration da zero"
typeorm migration:run
check_drift "dopo migration:run"

echo "== Revert delle ultime $revert_count migration e di nuovo up"
i=0
while [ "$i" -lt "$revert_count" ]; do
  typeorm migration:revert
  i=$((i + 1))
done
typeorm migration:run
check_drift "dopo down -> up"
