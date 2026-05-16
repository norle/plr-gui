from __future__ import annotations

import os
from pathlib import Path

from platformdirs import user_config_dir, user_data_dir, user_log_dir


APP_NAME = "PLR GUI"
APP_AUTHOR = "PyLabRobot"


def data_dir() -> Path:
  override = os.environ.get("PLR_GUI_DATA_DIR")
  path = Path(override) if override else Path(user_data_dir(APP_NAME, APP_AUTHOR))
  path.mkdir(parents=True, exist_ok=True)
  return path


def config_dir() -> Path:
  path = Path(user_config_dir(APP_NAME, APP_AUTHOR))
  path.mkdir(parents=True, exist_ok=True)
  return path


def log_dir() -> Path:
  path = Path(user_log_dir(APP_NAME, APP_AUTHOR))
  path.mkdir(parents=True, exist_ok=True)
  return path


def runs_dir() -> Path:
  path = data_dir() / "runs"
  path.mkdir(parents=True, exist_ok=True)
  return path

