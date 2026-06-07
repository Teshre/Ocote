#!/usr/bin/env bash
# Firma los binarios bundleados (zoxide, bat, fzf, etc.) con el Developer ID
# de macOS para que pasen la notarización de Apple.
#
# Apple requiere que TODO ejecutable dentro de un .app esté firmado con
# hardened runtime + secure timestamp. Tauri solo firma el .app principal,
# no los recursos. Este script firma los binarios "crudos" en resources/bin/
# ANTES del bundle, así Tauri los copia ya firmados.
#
# Uso:
#   ./scripts/sign-bundled-binaries.sh
#
# Lee el signing identity de src-tauri/tauri.macos.conf.json.
# Solo actúa sobre binarios Mach-O (los .txt, .fish, etc. los ignora).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

CONFIG="src-tauri/tauri.macos.conf.json"
BIN_DIR="src-tauri/resources/bin"

if [ "$(uname)" != "Darwin" ]; then
  echo "Este script solo aplica en macOS. En otros OS se ignora."
  exit 0
fi

if [ ! -f "$CONFIG" ]; then
  echo "No se encontró $CONFIG"
  exit 1
fi

# Lee el signing identity del config. Usa node porque es lo más portable.
SIGNING_IDENTITY=$(node -e "
  const c = require('./$CONFIG');
  const id = c?.tauri?.bundle?.macOS?.signingIdentity;
  if (!id || id === null) { process.exit(1); }
  process.stdout.write(id);
")

if [ -z "$SIGNING_IDENTITY" ]; then
  echo "No hay signingIdentity configurado en $CONFIG. Saliendo."
  exit 0
fi

# Verifica que la identidad existe en el llavero antes de empezar
if ! security find-identity -v -p codesigning | grep -qF "$SIGNING_IDENTITY"; then
  echo "El signing identity '$SIGNING_IDENTITY' no está en el llavero."
  echo "Asegurate de haber importado el certificado o de tener la Developer ID instalada."
  exit 1
fi

if [ ! -d "$BIN_DIR" ]; then
  echo "No existe $BIN_DIR — nada que firmar."
  exit 0
fi

signed=0
skipped=0

for arch_dir in "$BIN_DIR"/*/; do
  arch=$(basename "$arch_dir")
  case "$arch" in
    darwin-arm64|darwin-x64|darwin-universal) ;;
    *) continue ;;   # linux-x64, win-x64, etc. se firman en sus respectivos OS
  esac

  for binary in "$arch_dir"*; do
    [ -f "$binary" ] || continue

    # Solo firmar ejecutables Mach-O (no .txt, .fish, etc.)
    file "$binary" 2>/dev/null | grep -qE "Mach-O.*executable" || {
      skipped=$((skipped + 1))
      continue
    }

    # Si ya está firmado con la misma identidad, saltar (idempotente)
    if codesign -dv "$binary" 2>&1 | grep -qF "Authority=Developer ID Application: Eduardo Perry Rangel"; then
      # pero verificar que tenga hardened runtime + secure timestamp
      if codesign -d --options=runtime "$binary" 2>&1 | grep -q "flags=.*runtime"; then
        echo "  ✓ $arch/$(basename "$binary")  (ya firmado)"
        continue
      fi
    fi

    echo "  → $arch/$(basename "$binary")"
    codesign --force \
      --sign "$SIGNING_IDENTITY" \
      --options runtime \
      --timestamp \
      "$binary"
    signed=$((signed + 1))
  done
done

echo ""
echo "OK Firmados: $signed   |   Saltados (no Mach-O o ya firmados OK): $skipped"
