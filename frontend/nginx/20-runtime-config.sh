#!/bin/sh
# frontend/nginx/20-runtime-config.sh
# Genera la config runtime del frontend dalla variabile API_URL, letta da
# environment.ts via window.__UTENZEPA_CONFIG__ (vedi src/environments/runtime-config.ts).
# Se API_URL non è impostata, resta vuota: il frontend ricade sul valore
# statico compilato in environment.ts/environment.prod.ts.
set -eu
: "${API_URL:=}"
case "$API_URL" in
  *[!A-Za-z0-9_.:/-]*)
    echo "API_URL contiene caratteri non ammessi: $API_URL" >&2
    exit 1
    ;;
esac
cat > /usr/share/nginx/html/config.js <<EOF
window.__UTENZEPA_CONFIG__ = { apiUrl: '${API_URL}' };
EOF
