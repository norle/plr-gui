#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_NAME="${PLR_GUI_CONDA_ENV:-plr-gui}"
HOST="${PLR_GUI_HOST:-127.0.0.1}"
PORT="${PLR_GUI_PORT:-8765}"

if ! command -v conda >/dev/null 2>&1; then
  echo "conda was not found on PATH." >&2
  exit 1
fi

CONDA_BASE="$(conda info --base)"
# shellcheck disable=SC1091
source "$CONDA_BASE/etc/profile.d/conda.sh"
conda activate "$ENV_NAME"

cd "$ROOT_DIR"

if [ ! -d "frontend/dist" ]; then
  if ! command -v npm >/dev/null 2>&1; then
    echo "frontend/dist is missing and npm was not found on PATH." >&2
    exit 1
  fi
  echo "Building frontend assets..."
  (cd frontend && npm install && npm run build)
fi

echo "Starting PLR GUI at http://${HOST}:${PORT}"
echo "Using conda env: ${ENV_NAME}"
echo "Press Ctrl-C to stop."
exec plr-gui serve --host "$HOST" --port "$PORT"

