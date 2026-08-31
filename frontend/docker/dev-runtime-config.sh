#!/bin/sh
# frontend/docker/dev-runtime-config.sh
# Equivalente dev di nginx/20-runtime-config.sh: genera public/config.js da
# API_URL/SENTRY_DSN/SENTRY_ENVIRONMENT/APP_VERSION prima di avviare `ng serve`,
# così window.__UTENZEPA_CONFIG__ (src/environments/runtime-config.ts) è
# popolata anche in dev — niente più fallback statico su un apiUrl/porta che
# può non corrispondere a DOCKER_API_PORT locale (vedi CLAUDE.md, porte
# override per conflitti con altri progetti sulla stessa macchina).
# `ng serve` serve il contenuto di public/ alla root, stesso path di index.html
# (<script src="config.js">) usato in produzione da nginx.
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
cat > /app/public/config.js <<EOF
window.__UTENZEPA_CONFIG__ = {
  apiUrl: '${API_URL}',
  sentryDsn: '${SENTRY_DSN}',
  sentryEnvironment: '${SENTRY_ENVIRONMENT}',
  appVersion: '${APP_VERSION}'
};
EOF
