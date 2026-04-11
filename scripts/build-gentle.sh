#!/usr/bin/env bash
# Production build with lower impact on a small VPS (ssh/nginx stay responsive).
#
# - nice(15): yield CPU to interactive / server processes
# - ionice idle (Linux): disk I/O only when the system is otherwise idle
# - ROLLUP_MAX_PARALLEL_FILE_OPS: fewer concurrent Rollup reads (default 3 here; Vite frontend only)
#
# Usage (from repo root):
#   ./scripts/build-gentle.sh
#   ROLLUP_MAX_PARALLEL_FILE_OPS=2 ./scripts/build-gentle.sh
#
# Optional extra throttle (if `cpulimit` is installed):
#   cpulimit -l 45 -i -- ./scripts/build-gentle.sh
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

export ROLLUP_MAX_PARALLEL_FILE_OPS="${ROLLUP_MAX_PARALLEL_FILE_OPS:-3}"

if command -v ionice >/dev/null 2>&1; then
  # -c 3 = idle I/O scheduling class (Linux)
  exec nice -n 15 ionice -c 3 npm run build
else
  exec nice -n 15 npm run build
fi
