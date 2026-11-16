#!/usr/bin/env bash
# Note di rilascio: docs/releases/<versione>.md, scritte a mano nella PR che alza la versione
# in publiccode.yml. release.yml le richiede prima di buildare un tag e le pubblica come
# release GitHub (OpenSSF Baseline OSPS-BR-04.01: log descrittivo di modifiche funzionali
# e di sicurezza, sotto «## Changelog»).
#
#   scripts/release-notes.sh check vX.Y.Z      file presente e con le sezioni obbligatorie
#   scripts/release-notes.sh check-publiccode  come sopra, per la softwareVersion di publiccode.yml
#   scripts/release-notes.sh body vX.Y.Z <dir>  testo della release GitHub (note + digest di <dir>/release-<app>/digest)
set -euo pipefail

DIR=${RELEASE_NOTES_DIR:-docs/releases}

check() {
  local version=$1 file="$DIR/$1.md" errors=0
  if [[ ! "$version" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "::error::Versione non valida: $version (atteso vX.Y.Z)"
    return 1
  fi
  if [[ ! -f "$file" ]]; then
    echo "::error file=$file::Note di rilascio mancanti: crea $file (modello in $DIR/README.md)"
    return 1
  fi
  # Righe intere, CR finale tollerato (file salvati con CRLF).
  for heading in '## Changelog' '### Sicurezza'; do
    if ! tr -d '\r' < "$file" | grep -qx "$heading"; then
      echo "::error file=$file::Manca il titolo «$heading»"
      errors=1
    fi
  done
  # Sezione Sicurezza mai vuota: o le modifiche o una riga che dice che non ce ne sono.
  if [[ $errors -eq 0 ]] && ! tr -d '\r' < "$file" \
      | awk '/^### Sicurezza$/{s=1; next} /^#/{s=0} s && NF {found=1} END{exit !found}'; then
    echo "::error file=$file::«### Sicurezza» vuota: elencare le modifiche o scrivere «Nessuna modifica di sicurezza.»"
    errors=1
  fi
  [[ $errors -eq 0 ]] && echo "Note di rilascio $version: ok ($file)"
  return $errors
}

# Testo della release GitHub: note + digest pubblicati (<dir>/release-<app>/digest, gli
# artifact di release.yml) + come verificarli.
body() {
  local version=$1 dir=$2 app digest
  check "$version" >&2
  for app in backend frontend tinn; do
    [[ -s "$dir/release-$app/digest" ]] || { echo "::error::digest di $app mancante in $dir" >&2; return 1; }
  done
  tr -d '\r' < "$DIR/$version.md"
  printf '\n## Immagini\n\n'
  for app in backend frontend tinn; do
    digest=$(tr -d '\r\n' < "$dir/release-$app/digest")
    printf -- '- `ghcr.io/comune-di-montesilvano/utenzepa-%s:%s@%s`\n' "$app" "$version" "$digest"
  done
  printf '\nFirmate con cosign, con provenance SLSA e SBOM. Verifica: `scripts/verify-images.sh %s`, oppure `VERIFY_IMAGES=true` nel `.env` prima di `docker compose up`.\n' "$version"
}

case "${1:-}" in
  check)
    check "${2:?versione mancante}"
    ;;
  body)
    body "${2:?versione mancante}" "${3:?cartella dei digest mancante}"
    ;;
  check-publiccode)
    version=$(tr -d '\r' < publiccode.yml | sed -n 's/^softwareVersion: *"\{0,1\}\([^"]*\)"\{0,1\} *$/\1/p')
    check "$version"
    ;;
  *)
    echo "Uso: $0 check vX.Y.Z | check-publiccode | body vX.Y.Z <dir>" >&2
    exit 2
    ;;
esac
