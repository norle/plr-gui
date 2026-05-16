from __future__ import annotations

import hashlib
import json
import uuid
from datetime import datetime
from pathlib import Path

from fastapi import HTTPException

from plr_gui.models import (
  LaunchProfile,
  LaunchProfileRequest,
  WorkspaceFile,
  WorkspaceFileContent,
  WorkspaceSummary,
)
from plr_gui.settings import config_dir


def list_workspaces() -> list[WorkspaceSummary]:
  return sorted(_read_workspaces(), key=lambda workspace: workspace.last_opened_at, reverse=True)


def open_workspace(path: Path) -> WorkspaceSummary:
  root = path.expanduser().resolve()
  if not root.exists() or not root.is_dir():
    raise HTTPException(status_code=400, detail="workspace path must be an existing directory")

  workspaces = _read_workspaces()
  workspace = WorkspaceSummary(
    id=_workspace_id(root),
    name=root.name or str(root),
    path=str(root),
    last_opened_at=datetime.utcnow(),
  )
  by_id = {item.id: item for item in workspaces}
  by_id[workspace.id] = workspace
  _write_workspaces(list(by_id.values()))
  return workspace


def get_workspace(workspace_id: str) -> WorkspaceSummary:
  for workspace in _read_workspaces():
    if workspace.id == workspace_id:
      return workspace
  raise HTTPException(status_code=404, detail="workspace not found")


def list_python_files(workspace_id: str) -> list[WorkspaceFile]:
  root = Path(get_workspace(workspace_id).path)
  files: list[WorkspaceFile] = []
  for path in sorted(root.rglob("*.py")):
    if _is_hidden_or_cache_path(path.relative_to(root)):
      continue
    stat = path.stat()
    files.append(
      WorkspaceFile(
        path=path.relative_to(root).as_posix(),
        name=path.name,
        size=stat.st_size,
        modified_at=datetime.fromtimestamp(stat.st_mtime),
      )
    )
    if len(files) >= 500:
      break
  return files


def read_file(workspace_id: str, relative_path: str) -> WorkspaceFileContent:
  path = resolve_workspace_path(workspace_id, relative_path)
  if path.suffix != ".py":
    raise HTTPException(status_code=400, detail="only Python files can be read")
  if not path.exists() or not path.is_file():
    raise HTTPException(status_code=404, detail="file not found")
  stat = path.stat()
  return WorkspaceFileContent(
    path=_relative(workspace_id, path),
    content=path.read_text(encoding="utf-8"),
    modified_at=datetime.fromtimestamp(stat.st_mtime),
  )


def save_file(workspace_id: str, relative_path: str, content: str) -> WorkspaceFileContent:
  path = resolve_workspace_path(workspace_id, relative_path)
  if path.suffix != ".py":
    raise HTTPException(status_code=400, detail="only Python files can be saved")
  path.parent.mkdir(parents=True, exist_ok=True)
  path.write_text(content, encoding="utf-8")
  stat = path.stat()
  return WorkspaceFileContent(
    path=_relative(workspace_id, path),
    content=content,
    modified_at=datetime.fromtimestamp(stat.st_mtime),
  )


def resolve_workspace_path(workspace_id: str, relative_path: str) -> Path:
  root = Path(get_workspace(workspace_id).path).resolve()
  candidate = (root / relative_path).resolve()
  if root != candidate and root not in candidate.parents:
    raise HTTPException(status_code=400, detail="path is outside workspace")
  return candidate


def list_profiles(workspace_id: str) -> list[LaunchProfile]:
  get_workspace(workspace_id)
  return sorted(_read_profiles(workspace_id), key=lambda profile: profile.updated_at, reverse=True)


def create_profile(workspace_id: str, request: LaunchProfileRequest) -> LaunchProfile:
  get_workspace(workspace_id)
  profile = LaunchProfile(id=uuid.uuid4().hex[:10], **request.model_dump())
  profiles = _read_profiles(workspace_id)
  profiles.append(profile)
  _write_profiles(workspace_id, profiles)
  return profile


def update_profile(workspace_id: str, profile_id: str, request: LaunchProfileRequest) -> LaunchProfile:
  get_workspace(workspace_id)
  profiles = _read_profiles(workspace_id)
  for index, profile in enumerate(profiles):
    if profile.id == profile_id:
      profiles[index] = LaunchProfile(
        id=profile_id,
        updated_at=datetime.utcnow(),
        **request.model_dump(),
      )
      _write_profiles(workspace_id, profiles)
      return profiles[index]
  raise HTTPException(status_code=404, detail="profile not found")


def delete_profile(workspace_id: str, profile_id: str) -> dict[str, str]:
  get_workspace(workspace_id)
  profiles = [profile for profile in _read_profiles(workspace_id) if profile.id != profile_id]
  _write_profiles(workspace_id, profiles)
  return {"status": "ok"}


def _workspace_id(path: Path) -> str:
  return hashlib.sha1(str(path).encode("utf-8")).hexdigest()[:12]


def _read_workspaces() -> list[WorkspaceSummary]:
  path = _workspaces_path()
  if not path.exists():
    return []
  try:
    payload = json.loads(path.read_text(encoding="utf-8"))
    return [WorkspaceSummary.model_validate(item) for item in payload.get("workspaces", [])]
  except Exception:
    return []


def _write_workspaces(workspaces: list[WorkspaceSummary]) -> None:
  path = _workspaces_path()
  path.write_text(
    json.dumps({"workspaces": [item.model_dump(mode="json") for item in workspaces]}, indent=2),
    encoding="utf-8",
  )


def _workspaces_path() -> Path:
  return config_dir() / "workspaces.json"


def _profiles_path(workspace_id: str) -> Path:
  path = config_dir() / "profiles"
  path.mkdir(parents=True, exist_ok=True)
  return path / f"{workspace_id}.json"


def _read_profiles(workspace_id: str) -> list[LaunchProfile]:
  path = _profiles_path(workspace_id)
  if not path.exists():
    return []
  try:
    payload = json.loads(path.read_text(encoding="utf-8"))
    return [LaunchProfile.model_validate(item) for item in payload.get("profiles", [])]
  except Exception:
    return []


def _write_profiles(workspace_id: str, profiles: list[LaunchProfile]) -> None:
  _profiles_path(workspace_id).write_text(
    json.dumps({"profiles": [profile.model_dump(mode="json") for profile in profiles]}, indent=2),
    encoding="utf-8",
  )


def _relative(workspace_id: str, path: Path) -> str:
  root = Path(get_workspace(workspace_id).path).resolve()
  return path.resolve().relative_to(root).as_posix()


def _is_hidden_or_cache_path(path: Path) -> bool:
  return any(part.startswith(".") or part == "__pycache__" for part in path.parts)
