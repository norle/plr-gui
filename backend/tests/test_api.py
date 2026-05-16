from __future__ import annotations

import json
import asyncio
from pathlib import Path

from fastapi.testclient import TestClient
import pytest

from plr_gui.main import app
from plr_gui.models import RunRequest
from plr_gui.runner import run_manager


@pytest.fixture(autouse=True)
def isolated_app_dirs(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
  monkeypatch.setenv("PLR_GUI_DATA_DIR", str(tmp_path / "data"))
  monkeypatch.setenv("PLR_GUI_CONFIG_DIR", str(tmp_path / "config"))


def test_health() -> None:
  client = TestClient(app)
  response = client.get("/api/health")
  assert response.status_code == 200
  assert response.json()["status"] == "ok"


def test_custom_box_resource() -> None:
  client = TestClient(app)
  response = client.post(
    "/api/resources/custom",
    json={"kind": "box", "name": "deck_insert", "size_x": 10, "size_y": 20, "size_z": 5},
  )
  assert response.status_code == 200
  payload = response.json()
  assert "Resource" in payload["python"]
  assert payload["json_definition"]["name"] == "deck_insert"


def test_custom_tip_rack_resource() -> None:
  client = TestClient(app)
  response = client.post(
    "/api/resources/custom",
    json={
      "kind": "tip_rack",
      "name": "custom_tips",
      "size_x": 127.76,
      "size_y": 85.48,
      "size_z": 60,
      "rows": 8,
      "columns": 12,
      "well_volume": 300,
    },
  )
  assert response.status_code == 200
  payload = response.json()
  assert "TipRack" in payload["python"]
  assert payload["json_definition"]["columns"] == 12


def test_workspace_files_are_root_scoped(tmp_path: Path) -> None:
  workspace = tmp_path / "workspace"
  workspace.mkdir()
  (workspace / "protocol.py").write_text("print('hello')\n", encoding="utf-8")
  (tmp_path / "outside.py").write_text("print('outside')\n", encoding="utf-8")

  client = TestClient(app)
  opened = client.post("/api/workspaces", json={"path": str(workspace)}).json()
  workspace_id = opened["id"]

  files = client.get(f"/api/workspaces/{workspace_id}/files").json()["files"]
  assert [item["path"] for item in files] == ["protocol.py"]

  read_response = client.get(f"/api/workspaces/{workspace_id}/file", params={"path": "protocol.py"})
  assert read_response.status_code == 200
  assert read_response.json()["content"] == "print('hello')\n"

  blocked = client.get(f"/api/workspaces/{workspace_id}/file", params={"path": "../outside.py"})
  assert blocked.status_code == 400


def test_workspace_file_save_and_profiles_persist(tmp_path: Path) -> None:
  workspace = tmp_path / "workspace"
  workspace.mkdir()
  (workspace / "protocol.py").write_text("print('old')\n", encoding="utf-8")

  client = TestClient(app)
  workspace_id = client.post("/api/workspaces", json={"path": str(workspace)}).json()["id"]

  saved = client.put(
    f"/api/workspaces/{workspace_id}/file",
    params={"path": "protocol.py"},
    json={"content": "print('new')\n"},
  )
  assert saved.status_code == 200
  assert (workspace / "protocol.py").read_text(encoding="utf-8") == "print('new')\n"

  profile = client.post(
    f"/api/workspaces/{workspace_id}/profiles",
    json={"name": "Smoke", "script_relative_path": "protocol.py", "args": ["--dry"]},
  )
  assert profile.status_code == 200
  assert client.get(f"/api/workspaces/{workspace_id}/profiles").json()["profiles"][0]["name"] == "Smoke"


@pytest.mark.asyncio
async def test_workspace_run_writes_manifest_and_source_snapshot(tmp_path: Path) -> None:
  workspace = tmp_path / "workspace"
  workspace.mkdir()
  script = workspace / "protocol.py"
  script.write_text(
    "from pathlib import Path\n"
    "import json\n"
    "import os\n"
    "Path(os.environ['PLR_GUI_TRACE_PATH']).write_text(json.dumps({'events': []}))\n"
    "print('done')\n",
    encoding="utf-8",
  )

  client = TestClient(app)
  workspace_id = client.post("/api/workspaces", json={"path": str(workspace)}).json()["id"]
  queued = await run_manager.start_run(
    RunRequest(workspace_id=workspace_id, script_relative_path="protocol.py")
  )

  summary = await _wait_for_finished_run(queued.id)
  assert summary.status == "completed"
  assert summary.workspace_id == workspace_id

  assert summary.manifest_path is not None
  run_dir = Path(summary.manifest_path).parent
  manifest = json.loads((run_dir / "run.json").read_text(encoding="utf-8"))
  assert manifest["workspace_id"] == workspace_id
  assert manifest["script_relative_path"] == "protocol.py"
  assert (run_dir / "metadata.json").exists()
  assert (run_dir / "source.py").read_text(encoding="utf-8") == script.read_text(encoding="utf-8")


async def _wait_for_finished_run(run_id: str):
  for _ in range(50):
    summary = run_manager.get_run(run_id)
    if summary.status in {"completed", "failed", "cancelled"}:
      return summary
    await asyncio.sleep(0.05)
  raise AssertionError("run did not finish")
