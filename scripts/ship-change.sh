#!/usr/bin/env bash
# Record a changelog entry, commit all current changes, and push.
# Usage: ./scripts/ship-change.sh "short description"
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

MSG="${1:-}"
if [[ -z "$MSG" ]]; then
  echo "Usage: $0 \"short description of what changed\""
  echo "Example: $0 \"Fix initiative remote sheet scroll on mobile\""
  exit 1
fi

CHANGELOG="$REPO_ROOT/CHANGELOG.md"
MARKER='<!-- ship-change: new entries are inserted directly below this line -->'

if [[ ! -f "$CHANGELOG" ]] || ! grep -qF "$MARKER" "$CHANGELOG"; then
  echo "CHANGELOG.md is missing or marker not found; restore CHANGELOG.md from git."
  exit 1
fi

export SHIP_MSG="$MSG"
export SHIP_REPO_ROOT="$REPO_ROOT"
python3 <<'PY'
import os
from datetime import datetime, timezone
from pathlib import Path

repo = Path(os.environ["SHIP_REPO_ROOT"])
changelog = repo / "CHANGELOG.md"
marker = "<!-- ship-change: new entries are inserted directly below this line -->"
msg = os.environ["SHIP_MSG"]
today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
block = f"## {today}\n\n- {msg}\n\n"
text = changelog.read_text(encoding="utf-8")
if marker not in text:
    raise SystemExit("CHANGELOG marker not found")
changelog.write_text(text.replace(marker, marker + "\n" + block, 1), encoding="utf-8")
PY

git add -A

if git diff --cached --quiet; then
  echo "Nothing to commit."
  exit 0
fi

git commit -m "$MSG"

if git push; then
  echo "Pushed to origin."
else
  echo "Commit created; push failed — fix remote/auth then: git push"
  exit 1
fi
