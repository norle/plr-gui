#!/usr/bin/env bash
set -euo pipefail

ENV_NAME="${PLR_GUI_CONDA_ENV:-plr-gui}"

CONDA_BASE="$(conda info --base)"
# shellcheck disable=SC1091
source "$CONDA_BASE/etc/profile.d/conda.sh"
conda activate "$ENV_NAME"

python - <<'PY'
from pylabrobot.__version__ import __version__ as plr_version
from pylabrobot.liquid_handling.backends.chatterbox import LiquidHandlerChatterboxBackend
import plr_gui

backend = LiquidHandlerChatterboxBackend()
assert hasattr(backend, "export_for_gui")
print(f"plr_gui={plr_gui.__version__}")
print(f"pylabrobot={plr_version}")
print("export_for_gui=available")
PY

