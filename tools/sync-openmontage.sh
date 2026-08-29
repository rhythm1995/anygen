#!/bin/bash
# 同步上游 OpenMontage 到 vendor/openmontage（用户说"同步"时执行本脚本）
# 原则：vendor 保持上游原样；我们的定制一律放 vendor-overlay/，绝不改 vendor 内文件
set -euo pipefail
cd "$(dirname "$0")/.."

UPSTREAM_REPO="https://github.com/calesthio/OpenMontage.git"
TMP=$(mktemp -d /tmp/om-sync.XXXXXX)
trap 'rm -rf "$TMP"' EXIT

echo "▸ fetching upstream (shallow)..."
git clone -q --depth 1 "$UPSTREAM_REPO" "$TMP/src"
COMMIT=$(git -C "$TMP/src" rev-parse HEAD)
echo "▸ upstream @ ${COMMIT:0:12} ($(git -C "$TMP/src" log -1 --format=%cd --date=short))"

echo "▸ rsync into vendor/openmontage (code+knowledge only)..."
mkdir -p vendor/openmontage
rsync -a --delete \
  --exclude '.git' \
  --exclude '.venv' \
  --exclude 'node_modules' \
  --exclude 'projects/' \
  --exclude 'music_library/' \
  --exclude 'assets/*.mp4' \
  --exclude 'assets/sponsors' \
  --exclude '__pycache__' \
  "$TMP/src/" vendor/openmontage/

echo "$COMMIT" > vendor/openmontage/UPSTREAM_COMMIT
echo "▸ vendor updated → $(du -sh vendor/openmontage | cut -f1)"

echo "▸ running upstream contract tests (sanity)..."
if [ -d vendor/openmontage/.venv ] || [ ! -x vendor/openmontage/.venv/bin/python ]; then
  echo "  (no .venv in vendor — skipping tests; run locally via ~/openmontage-study if needed)"
else
  (cd vendor/openmontage && .venv/bin/python -m pytest tests/contracts -q 2>/dev/null | tail -2) || echo "  (contract tests failed — review before committing!)"
fi

echo "▸ done. Remember: review docs/VENDOR-OPENMONTAGE.md overlay notes, then git commit."
