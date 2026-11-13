#!/usr/bin/env bash
# scripts/smoke-stack.sh — smoke test dello stack di produzione (docker-compose.yml) gia'
# avviato, con l'Admin di scripts/e2e-admin.sh: servizi su, frontend e API attraverso
# nginx (stessa origin), login, query autenticata (migration applicate), backup scritto sul
# volume, filesystem in sola lettura, frontend che segue l'API ricreata con un altro IP.
# Usato da release.yml prima di pubblicare i tag; in locale:
#   docker compose -f docker-compose.yml -p smoke --env-file <env> up -d
#   COMPOSE="docker compose -f docker-compose.yml -p smoke --env-file <env>" scripts/e2e-admin.sh
#   COMPOSE="..." E2E_USERNAME=... E2E_PASSWORD=... scripts/smoke-stack.sh
set -euo pipefail

COMPOSE=${COMPOSE:-docker compose -f docker-compose.yml}
BASE=http://localhost:${DOCKER_FRONTEND_PORT:-4300}
API=$BASE/api/v1
TIMEOUT=${SMOKE_TIMEOUT:-180}
: "${E2E_USERNAME:?E2E_USERNAME obbligatorio}"
: "${E2E_PASSWORD:?E2E_PASSWORD obbligatorio}"

fail() {
  echo "::error::$*"
  $COMPOSE ps -a || true
  $COMPOSE logs --no-color --tail 80 || true
  exit 1
}
ok() { echo "OK  $*"; }

# API pronta (migration finite) quando la liveness risponde attraverso nginx del frontend.
for ((i = 0; i < TIMEOUT; i += 5)); do
  curl -fsS "$API/health/liveness" >/dev/null 2>&1 && break
  sleep 5
done
curl -fsS "$API/health/liveness" | grep -q '"ok"' || fail "API non raggiungibile da $API/health/liveness entro ${TIMEOUT}s"
ok "liveness via frontend"

for svc in mysql api frontend; do
  state=$($COMPOSE ps -a --format '{{.State}}' "$svc")
  [ "$state" = running ] || fail "$svc in stato '$state'"
done
# verify-images esiste solo nei compose che lo dichiarano: se c'e', deve essere uscito con 0.
if $COMPOSE config --services | grep -qx verify-images; then
  verify=$($COMPOSE ps -a --format '{{.State}} {{.ExitCode}}' verify-images)
  [ "$verify" = "exited 0" ] || fail "verify-images: '$verify'"
fi
ok "servizi in esecuzione"

curl -fsS "$BASE/config.js" | grep -q "apiUrl: ''" || fail "config.js non generato o API_URL non vuoto"
curl -fsS -o /dev/null "$BASE/" || fail "index non servito"
curl -fsS -o /dev/null "$BASE/guida/guida.md" || fail "guida operatori non servita"
curl -fsS "$API/settings/branding" >/dev/null || fail "GET /settings/branding"
ok "frontend, config.js, guida e proxy /api"

body=$(jq -cn --arg u "$E2E_USERNAME" --arg p "$E2E_PASSWORD" '{email: $u, password: $p}')
token=$(curl -fsS -H 'Content-Type: application/json' -d "$body" "$API/authModule/login" | jq -r '.token.access_token // empty')
[ -n "$token" ] || fail "login di $E2E_USERNAME"
auth=(-H "Authorization: Bearer $token")
ok "login"

curl -fsS "${auth[@]}" "$API/backup" >/dev/null || fail "GET /backup"
curl -fsS "${auth[@]}" -H 'Content-Type: application/json' -d '{"includePhotos":true,"includeAttachments":true}' "$API/backup" >/dev/null \
  || fail "POST /backup"
for ((i = 0; i < 60; i += 2)); do
  st=$(curl -fsS "${auth[@]}" "$API/backup/status")
  [ "$(jq -r '.creating' <<<"$st")" = null ] && break
  sleep 2
done
[ "$(jq -r '.lastCreate.filename // empty' <<<"$st")" != "" ] || fail "backup non creato: $st"
ok "query autenticate e backup sul volume ($(jq -r '.lastCreate.filename' <<<"$st"))"

if $COMPOSE exec -T api sh -c 'touch /usr/src/app/smoke' 2>/dev/null; then
  fail "filesystem dell'API scrivibile: read_only non applicato"
fi
if $COMPOSE exec -T frontend sh -c 'touch /usr/share/nginx/html/smoke' 2>/dev/null; then
  fail "filesystem del frontend scrivibile: read_only non applicato"
fi
ok "filesystem in sola lettura"

# Solo l'API ricreata, con un IP diverso (redeploy che tocca solo lei, incidente ComunicaPA
# 2026-11-04): nginx del frontend deve seguirla senza riavvio (`resolve` nell'upstream).
# Docker riassegna subito l'IP appena liberato: un segnaposto lo occupa mentre l'API riparte.
old_id=$($COMPOSE ps -q api)
net=$(docker inspect -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{"\n"}}{{end}}' "$old_id" | head -n1)
ip_of() { docker inspect -f "{{(index .NetworkSettings.Networks \"$net\").IPAddress}}" "$1"; }
old_ip=$(ip_of "$old_id")
img=$(docker inspect -f '{{.Config.Image}}' "$old_id")
$COMPOSE rm -sf api >/dev/null 2>&1 || fail "rimozione dell'API"
docker run -d --rm --name smoke-ip-hold --network "$net" --entrypoint sleep "$img" 600 >/dev/null \
  || fail "segnaposto per l'IP dell'API"
$COMPOSE up -d --no-deps api >/dev/null 2>&1 || fail "ricreazione dell'API"
new_ip=$(ip_of "$($COMPOSE ps -q api)")
docker rm -f smoke-ip-hold >/dev/null
[ "$new_ip" != "$old_ip" ] || fail "IP dell'API invariato ($old_ip): controllo non significativo"
for ((i = 0; i < TIMEOUT; i += 3)); do
  curl -fsS "$API/health/liveness" >/dev/null 2>&1 && break
  sleep 3
done
curl -fsS "$API/health/liveness" >/dev/null 2>&1 \
  || fail "il frontend non segue l'API ricreata ($old_ip -> $new_ip) entro ${TIMEOUT}s"
ok "il frontend segue l'API ricreata ($old_ip -> $new_ip)"

# Il messaggio informativo dello script ipv6 di nginx menziona "read-only file system?".
if $COMPOSE logs --no-color | grep -iE 'EROFS|read-only file system|EACCES|permission denied' | grep -v 10-listen-on-ipv6; then
  fail "errori di filesystem nei log"
fi
ok "nessun errore di filesystem nei log"
