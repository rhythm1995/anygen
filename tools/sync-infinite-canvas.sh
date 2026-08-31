#!/bin/bash
# 同步上游 tigerowo/infinite-canvas 到 vendor/infinite-canvas（仅当用户说「同步 infinite-canvas」时执行！）
# 原则：vendor 保持上游原样；我们的定制一律在 apps/web 移植层 + docs/CANVAS-RESEARCH.md 附录A 映射表重放，绝不改 vendor 内文件
set -euo pipefail
cd "$(dirname "$0")/.."

UPSTREAM_REPO="https://github.com/tigerowo/infinite-canvas.git"
TMP=$(mktemp -d /tmp/ic-sync.XXXXXX)
trap 'rm -rf "$TMP"' EXIT

echo "▸ fetching upstream (shallow)..."
git clone -q --depth 1 "$UPSTREAM_REPO" "$TMP/src"
COMMIT=$(git -C "$TMP/src" rev-parse HEAD)
echo "▸ upstream @ ${COMMIT:0:12} ($(git -C "$TMP/src" log -1 --format=%cd --date=short))"

echo "▸ rsync into vendor/infinite-canvas..."
mkdir -p vendor/infinite-canvas
rsync -a --delete \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude '.next' \
  --exclude 'web/.next' \
  "$TMP/src/" vendor/infinite-canvas/

echo "$COMMIT" > vendor/infinite-canvas/UPSTREAM_COMMIT
echo "▸ vendor updated → $(du -sh vendor/infinite-canvas | cut -f1)"

echo "▸ done. Remember: 按 docs/CANVAS-RESEARCH.md 附录A 重放 antd→shadcn 改写，然后 git commit: chore(vendor): sync infinite-canvas @ <hash>"
