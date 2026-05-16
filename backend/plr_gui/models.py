from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, Field


RunStatus = Literal["queued", "running", "completed", "failed", "cancelled"]


class HealthResponse(BaseModel):
  status: str
  version: str
  pylabrobot_version: str | None = None


class RunRequest(BaseModel):
  script_path: Path
  working_directory: Path | None = None
  python_executable: Path | None = None
  args: list[str] = Field(default_factory=list)
  env: dict[str, str] = Field(default_factory=dict)


class RunSummary(BaseModel):
  id: str
  status: RunStatus
  script_path: str
  created_at: datetime
  started_at: datetime | None = None
  finished_at: datetime | None = None
  return_code: int | None = None
  report_path: str | None = None
  trace_path: str | None = None


class RunEvent(BaseModel):
  type: Literal["status", "stdout", "stderr", "trace", "error"]
  run_id: str
  payload: dict[str, Any]
  created_at: datetime = Field(default_factory=datetime.utcnow)


class ResourceFactory(BaseModel):
  name: str
  module: str
  signature: str
  doc: str | None = None


class CustomResourceRequest(BaseModel):
  kind: Literal["box", "container", "plate"]
  name: str = "custom_resource"
  size_x: float
  size_y: float
  size_z: float
  rows: int | None = None
  columns: int | None = None
  well_volume: float | None = None


class CustomResourceResponse(BaseModel):
  python: str
  json_definition: dict[str, Any]

