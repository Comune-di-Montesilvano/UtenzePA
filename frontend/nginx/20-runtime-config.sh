#!/bin/sh
# frontend/nginx/20-runtime-config.sh
# Genera la config runtime del frontend dalle variabili API_URL/SENTRY_DSN/
# SENTRY_ENVIRONMENT/APP_VERSION, lette da environment.ts via
# window.__UTENZEPA_CONFIG__ (vedi src/environments/runtime-config.ts).
# Se una variabile non è impostata, resta vuota: il frontend ricade sul
# valore statico compilato (in produzione `/api/v1`: stessa origin, nginx
# inoltra all'API).
set -eu
: "${API_URL:=}"
: "${SENTRY_DSN:=}"
: "${SENTRY_ENVIRONMENT:=}"
: "${APP_VERSION:=}"
case "$API_URL" in
  *[!A-Za-z0-9_.:/-]*)
    echo "API_URL contiene caratteri non ammessi: $API_URL" >&2
    exit 1
    ;;
esac
case "$SENTRY_DSN" in
  *[!A-Za-z0-9_.:/@-]*)
    echo "SENTRY_DSN contiene caratteri non ammessi" >&2
    exit 1
    ;;
esac
case "$SENTRY_ENVIRONMENT" in
  *[!A-Za-z0-9_-]*)
    echo "SENTRY_ENVIRONMENT contiene caratteri non ammessi: $SENTRY_ENVIRONMENT" >&2
    exit 1
    ;;
esac
case "$APP_VERSION" in
  *[!A-Za-z0-9_.-]*)
    echo "APP_VERSION contiene caratteri non ammessi: $APP_VERSION" >&2
    exit 1
    ;;
esac
# In /tmp (tmpfs) e non nella root html: il container gira con filesystem in sola
# lettura (read_only in docker-compose.yml). nginx.conf serve /config.js da qui.
mkdir -p /tmp/runtime-config
# Resolver di nginx per il nome `api` (nginx.conf): il DNS della rete dei container, cioe' il
# primo nameserver di /etc/resolv.conf (Docker 127.0.0.11, podman aardvark-dns sul gateway
# della rete). Gli eventuali successivi sono DNS dell'host, che non conoscono i nomi dei
# servizi: nginx li userebbe a turno e `api` risulterebbe a tratti inesistente.
ns=$(awk '$1 == "nameserver" { print $2; exit }' /etc/resolv.conf)
case "$ns" in
  '' | *[!0-9A-Fa-f.:]*)
    echo "nameserver non valido in /etc/resolv.conf: '$ns'" >&2
    exit 1
    ;;
  *:*) ns="[$ns]" ;;
esac
echo "resolver $ns valid=10s;" > /tmp/runtime-config/resolver.conf
cat > /tmp/runtime-config/config.js <<EOF
window.__UTENZEPA_CONFIG__ = {
  apiUrl: '${API_URL}',
  sentryDsn: '${SENTRY_DSN}',
  sentryEnvironment: '${SENTRY_ENVIRONMENT}',
  appVersion: '${APP_VERSION}'
};
EOF
