#!/usr/bin/env bash
# Copies the AG-UI profile package from a ayni-agent checkout (the source of truth) into this
# repo. Usage: scripts/sync-profile.sh [path-to-ayni-agent]   (default ../ayni-agent)
set -euo pipefail
SRC="${1:-$(dirname "$0")/../../ayni-agent}"
DST="$(dirname "$0")/../packages/agui-profile"
rm -rf "$DST/src" "$DST/schemas"
cp -r "$SRC/packages/agui-profile/src" "$SRC/packages/agui-profile/schemas" "$SRC/packages/agui-profile/package.json" "$SRC/packages/agui-profile/tsconfig.json" "$DST/"
echo "$(git -C "$SRC" rev-parse HEAD) packages/agui-profile" > "$DST/SOURCE"
echo "profile synced from $(cat "$DST/SOURCE")"
