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
  script_path: Path | None = None
  workspace_id: str | None = None
  script_relative_path: str | None = None
  profile_id: str | None = None
  profile_snapshot: dict[str, Any] | None = None
  working_directory: Path | None = None
  python_executable: Path | None = None
  args: list[str] = Field(default_factory=list)
  env: dict[str, str] = Field(default_factory=dict)


class RunSummary(BaseModel):
  id: str
  status: RunStatus
  script_path: str
  created_at: datetime
  workspace_id: str | None = None
  script_relative_path: str | None = None
  started_at: datetime | None = None
  finished_at: datetime | None = None
  return_code: int | None = None
  report_path: str | None = None
  trace_path: str | None = None
  manifest_path: str | None = None
  source_snapshot_path: str | None = None
  duration_seconds: float | None = None


class RunManifest(BaseModel):
  schema_version: str = "1.0"
  id: str
  workspace_id: str | None = None
  workspace_path: str | None = None
  launch_profile_snapshot: dict[str, Any] | None = None
  script_relative_path: str | None = None
  script_path: str
  status: RunStatus
  created_at: datetime
  started_at: datetime | None = None
  finished_at: datetime | None = None
  return_code: int | None = None
  artifacts: dict[str, str | None] = Field(default_factory=dict)
  metrics: dict[str, Any] = Field(default_factory=dict)


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
  kind: Literal["box", "container", "plate", "well", "tip_rack", "carrier", "deck"]
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


class WorkspaceOpenRequest(BaseModel):
  path: Path


class WorkspaceSummary(BaseModel):
  id: str
  name: str
  path: str
  last_opened_at: datetime


class WorkspaceListResponse(BaseModel):
  workspaces: list[WorkspaceSummary]


class WorkspaceFile(BaseModel):
  path: str
  name: str
  size: int
  modified_at: datetime


class WorkspaceFileListResponse(BaseModel):
  files: list[WorkspaceFile]


class WorkspaceFileContent(BaseModel):
  path: str
  content: str
  modified_at: datetime


class WorkspaceFileSaveRequest(BaseModel):
  content: str


class LaunchProfile(BaseModel):
  id: str
  name: str
  script_relative_path: str = ""
  working_directory: str | None = None
  python_executable: str | None = None
  args: list[str] = Field(default_factory=list)
  env: dict[str, str] = Field(default_factory=dict)
  updated_at: datetime = Field(default_factory=datetime.utcnow)


class LaunchProfileRequest(BaseModel):
  name: str
  script_relative_path: str = ""
  working_directory: str | None = None
  python_executable: str | None = None
  args: list[str] = Field(default_factory=list)
  env: dict[str, str] = Field(default_factory=dict)
