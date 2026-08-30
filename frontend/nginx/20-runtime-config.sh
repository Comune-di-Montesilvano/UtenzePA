#!/bin/sh
# frontend/nginx/20-runtime-config.sh
# Genera la config runtime del frontend dalle variabili API_URL/SENTRY_DSN/
# SENTRY_ENVIRONMENT/APP_VERSION, lette da environment.ts via
# window.__UTENZEPA_CONFIG__ (vedi src/environments/runtime-config.ts).
# Se una variabile non è impostata, resta vuota: il frontend ricade sul
# valore statico compilato in environment.ts/environment.prod.ts.
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
cat > /usr/share/nginx/html/config.js <<EOF
window.__UTENZEPA_CONFIG__ = {
  apiUrl: '${API_URL}',
  sentryDsn: '${SENTRY_DSN}',
  sentryEnvironment: '${SENTRY_ENVIRONMENT}',
  appVersion: '${APP_VERSION}'
};
EOF
