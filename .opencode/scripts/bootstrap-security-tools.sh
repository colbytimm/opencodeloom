#!/usr/bin/env bash
set -euo pipefail

SEMGREP_VERSION="1.96.0"
OSV_VERSION="1.8.5"
PREFIX_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BIN_DIR="$PREFIX_DIR/bin"

mkdir -p "$BIN_DIR"

echo "Installing semgrep==$SEMGREP_VERSION via pip (user site)"
python3 -m pip install --user --upgrade "semgrep==${SEMGREP_VERSION}"
echo "Semgrep version: $(semgrep --version || true)"

echo "Installing OSV-Scanner v$OSV_VERSION"
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)
case "$OS" in
  linux) OS_TAG="linux" ;;
  darwin) OS_TAG="darwin" ;;
  *) echo "Unsupported OS: $OS" >&2; exit 1 ;;
esac
case "$ARCH" in
  x86_64|amd64) ARCH_TAG="amd64" ;;
  arm64|aarch64) ARCH_TAG="arm64" ;;
  *) echo "Unsupported arch: $ARCH" >&2; exit 1 ;;
esac

TAR="osv-scanner_${OSV_VERSION}_${OS_TAG}_${ARCH_TAG}.tar.gz"
URL="https://github.com/google/osv-scanner/releases/download/v${OSV_VERSION}/${TAR}"

TMP_DIR="$(mktemp -d)"
curl -fsSL "$URL" -o "$TMP_DIR/osv.tar.gz"
tar -xzf "$TMP_DIR/osv.tar.gz" -C "$TMP_DIR"
chmod +x "$TMP_DIR/osv-scanner"
mv "$TMP_DIR/osv-scanner" "$BIN_DIR/osv-scanner"
rm -rf "$TMP_DIR"

echo "Installed OSV-Scanner to $BIN_DIR/osv-scanner"
echo "Add to PATH for this session: export PATH=\"$BIN_DIR:$PATH\""

echo "Bootstrap complete."
