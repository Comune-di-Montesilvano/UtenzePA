#!/usr/bin/env bash
# Crea l'Admin locale di prova (E2E_USERNAME / E2E_PASSWORD) in uno stack di
# docker-compose.yml appena avviato su un DB nuovo. Usato dal job e2e di tests.yml e dallo
# smoke di release.yml. Autore = utente di sistema -1, mai un utente reale.
#   COMPOSE="docker compose -f docker-compose.yml" scripts/e2e-admin.sh
set -euo pipefail

COMPOSE=${COMPOSE:-docker compose -f docker-compose.yml}
: "${E2E_USERNAME:?E2E_USERNAME obbligatorio}"
: "${E2E_PASSWORD:?E2E_PASSWORD obbligatorio}"
: "${MYSQL_PASSWORD:?MYSQL_PASSWORD obbligatorio}"

case "$E2E_USERNAME" in
  *[!A-Za-z0-9._-]*) echo "E2E_USERNAME con caratteri non ammessi" >&2; exit 1 ;;
esac

hash=$($COMPOSE exec -T -e P="$E2E_PASSWORD" api \
  node -e "require('bcrypt').hash(process.env.P, 10).then(console.log)")
# L'email serve a validateUser (es. conferma password del ripristino): dominio riservato.
$COMPOSE exec -T mysql mysql -uroot -p"$MYSQL_PASSWORD" mydatabase -e \
  "INSERT INTO system_users (first_name, last_name, username, email, password_hash, auth_provider, role, status, created_by_user_id, updated_by_user_id) VALUES ('E2E', 'Admin', '$E2E_USERNAME', '$E2E_USERNAME@example.invalid', '$hash', 'local', 'Admin', 'Attivo', -1, -1)"
echo "Admin $E2E_USERNAME creato"
