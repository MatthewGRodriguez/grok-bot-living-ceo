#!/usr/bin/env bash
# Absolute launcher — works no matter what cwd Grok/Cursor uses.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
exec node "$ROOT/mcp/stdio.js"
