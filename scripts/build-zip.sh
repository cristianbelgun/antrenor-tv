#!/usr/bin/env bash
# Builds dist/antrenor-tv.zip for upload to cPanel (files at the top level: extract in the site's folder).
# Usage: bash scripts/build-zip.sh <secret>
# The secret goes only into the zip (js/config.js and config.php), never into the repository.
set -euo pipefail
SECRET="${1:-}"
if [ -z "$SECRET" ]; then echo "Folosire: bash scripts/build-zip.sh <cheia-secreta>" >&2; exit 1; fi
if ! [[ "$SECRET" =~ ^[A-Za-z0-9_-]{8,128}$ ]]; then echo "Cheia poate conține doar litere, cifre, - și _ (8–128 caractere)." >&2; exit 1; fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
mkdir -p "$STAGE/antrenor/js" "$STAGE/antrenor/css" "$STAGE/antrenor/data" "$STAGE/antrenor/muzica"

cp "$ROOT/index.html" "$ROOT/istoric.html" "$ROOT/api.php" "$ROOT/config.sample.php" "$STAGE/antrenor/"
cp "$ROOT/css/app.css" "$STAGE/antrenor/css/"
cp "$ROOT"/js/*.js "$STAGE/antrenor/js/"
cp "$ROOT/data/.htaccess" "$STAGE/antrenor/data/"
cp "$ROOT/muzica/CITESTE-MA.txt" "$STAGE/antrenor/muzica/"

cat > "$STAGE/antrenor/js/config.js" <<JS
(function (root) {
  var AT = root.AT = root.AT || {};
  AT.config = AT.config || { secret: '$SECRET' };
})(typeof window !== 'undefined' ? window : globalThis);
JS
printf "<?php\nreturn ['secret' => '%s'];\n" "$SECRET" > "$STAGE/antrenor/config.php"

mkdir -p "$ROOT/dist"
rm -f "$ROOT/dist/antrenor-tv.zip"
(cd "$STAGE/antrenor" && zip -qr "$ROOT/dist/antrenor-tv.zip" .)
echo "$ROOT/dist/antrenor-tv.zip"
