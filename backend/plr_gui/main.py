from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from plr_gui import __version__
from plr_gui.models import (
  CustomResourceRequest,
  HealthResponse,
  LaunchProfileRequest,
  RunRequest,
  WorkspaceFileListResponse,
  WorkspaceFileSaveRequest,
  WorkspaceListResponse,
  WorkspaceOpenRequest,
)
from plr_gui.resources import create_custom_resource, list_resource_factories
from plr_gui.runner import run_manager
from plr_gui.workspaces import (
  create_profile,
  delete_profile,
  list_profiles,
  list_python_files,
  list_workspaces,
  open_workspace,
  read_file,
  save_file,
  update_profile,
)

app = FastAPI(title="PLR GUI API", version=__version__)

app.add_middleware(
  CORSMiddleware,
  allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"],
  allow_credentials=True,
  allow_methods=["*"],
  allow_headers=["*"],
)


@app.get("/api/health", response_model=HealthResponse)
def health() -> HealthResponse:
  try:
    from pylabrobot.__version__ import __version__ as pylabrobot_version
  except Exception:
    pylabrobot_version = None
  return HealthResponse(status="ok", version=__version__, pylabrobot_version=pylabrobot_version)


@app.get("/api/resources/catalog")
def resource_catalog() -> dict:
  return {"resources": [factory.model_dump() for factory in list_resource_factories()]}


@app.post("/api/resources/custom")
def custom_resource(request: CustomResourceRequest) -> dict:
  return create_custom_resource(request).model_dump()


@app.get("/api/workspaces", response_model=WorkspaceListResponse)
def get_workspaces() -> WorkspaceListResponse:
  return WorkspaceListResponse(workspaces=list_workspaces())


@app.post("/api/workspaces")
def post_workspace(request: WorkspaceOpenRequest) -> dict:
  return open_workspace(request.path).model_dump(mode="json")


@app.get("/api/workspaces/{workspace_id}/files", response_model=WorkspaceFileListResponse)
def get_workspace_files(workspace_id: str) -> WorkspaceFileListResponse:
  return WorkspaceFileListResponse(files=list_python_files(workspace_id))


@app.get("/api/workspaces/{workspace_id}/file")
def get_workspace_file(workspace_id: str, path: str = Query(...)) -> dict:
  return read_file(workspace_id, path).model_dump(mode="json")


@app.put("/api/workspaces/{workspace_id}/file")
def put_workspace_file(
  workspace_id: str,
  request: WorkspaceFileSaveRequest,
  path: str = Query(...),
) -> dict:
  return save_file(workspace_id, path, request.content).model_dump(mode="json")


@app.get("/api/workspaces/{workspace_id}/profiles")
def get_profiles(workspace_id: str) -> dict:
  return {"profiles": [profile.model_dump(mode="json") for profile in list_profiles(workspace_id)]}


@app.post("/api/workspaces/{workspace_id}/profiles")
def post_profile(workspace_id: str, request: LaunchProfileRequest) -> dict:
  return create_profile(workspace_id, request).model_dump(mode="json")


@app.put("/api/workspaces/{workspace_id}/profiles/{profile_id}")
def put_profile(workspace_id: str, profile_id: str, request: LaunchProfileRequest) -> dict:
  return update_profile(workspace_id, profile_id, request).model_dump(mode="json")


@app.delete("/api/workspaces/{workspace_id}/profiles/{profile_id}")
def remove_profile(workspace_id: str, profile_id: str) -> dict:
  return delete_profile(workspace_id, profile_id)


@app.get("/api/runs")
def list_runs(workspace_id: str | None = None) -> dict:
  return {"runs": [run.model_dump(mode="json") for run in run_manager.list_runs(workspace_id)]}


@app.post("/api/runs")
async def start_run(request: RunRequest) -> dict:
  if request.workspace_id is None and (request.script_path is None or not request.script_path.exists()):
    raise HTTPException(status_code=400, detail="script_path does not exist")
  try:
    summary = await run_manager.start_run(request)
  except ValueError as exc:
    raise HTTPException(status_code=400, detail=str(exc)) from None
  return summary.model_dump(mode="json")


@app.get("/api/runs/{run_id}")
def get_run(run_id: str) -> dict:
  try:
    return run_manager.get_run(run_id).model_dump(mode="json")
  except FileNotFoundError:
    raise HTTPException(status_code=404, detail="run not found") from None


@app.post("/api/runs/{run_id}/cancel")
async def cancel_run(run_id: str) -> dict:
  try:
    summary = await run_manager.cancel_run(run_id)
  except FileNotFoundError:
    raise HTTPException(status_code=404, detail="run not found") from None
  return summary.model_dump(mode="json")


@app.get("/api/runs/{run_id}/trace")
def get_trace(run_id: str) -> FileResponse:
  path = _run_file(run_id, "trace.json")
  return FileResponse(path, media_type="application/json")


@app.get("/api/runs/{run_id}/report")
def get_report(run_id: str) -> FileResponse:
  path = _run_file(run_id, "report.html")
  return FileResponse(path, media_type="text/html")


@app.get("/api/runs/{run_id}/stdout")
def get_stdout(run_id: str) -> FileResponse:
  path = _run_file(run_id, "stdout.log")
  return FileResponse(path, media_type="text/plain")


@app.get("/api/runs/{run_id}/stderr")
def get_stderr(run_id: str) -> FileResponse:
  path = _run_file(run_id, "stderr.log")
  return FileResponse(path, media_type="text/plain")


@app.get("/api/runs/{run_id}/source")
def get_source_snapshot(run_id: str) -> FileResponse:
  path = _run_file(run_id, "source.py")
  return FileResponse(path, media_type="text/plain")


@app.get("/api/runs/{run_id}/manifest")
def get_manifest(run_id: str) -> FileResponse:
  path = _run_file(run_id, "run.json")
  return FileResponse(path, media_type="application/json")


@app.websocket("/ws/runs/{run_id}")
async def run_events(websocket: WebSocket, run_id: str) -> None:
  await websocket.accept()
  queue = await run_manager.subscribe(run_id)
  try:
    while True:
      event = await queue.get()
      await websocket.send_json(event.model_dump(mode="json"))
  except WebSocketDisconnect:
    pass
  finally:
    run_manager.unsubscribe(run_id, queue)


def _run_file(run_id: str, filename: str) -> Path:
  from plr_gui.settings import runs_dir

  path = runs_dir() / run_id / filename
  if not path.exists():
    raise HTTPException(status_code=404, detail=f"{filename} not found")
  return path


frontend_dist = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if frontend_dist.exists():
  app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="frontend")
