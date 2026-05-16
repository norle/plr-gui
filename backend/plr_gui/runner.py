from __future__ import annotations

import asyncio
import json
import os
import shutil
import sys
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any

from plr_gui.models import RunEvent, RunManifest, RunRequest, RunStatus, RunSummary
from plr_gui.reports import write_report
from plr_gui.settings import runs_dir
from plr_gui.workspaces import get_workspace, resolve_workspace_path


class RunManager:
  def __init__(self) -> None:
    self._subscribers: dict[str, set[asyncio.Queue[RunEvent]]] = {}
    self._processes: dict[str, asyncio.subprocess.Process] = {}
    self._cancelled: set[str] = set()

  def list_runs(self, workspace_id: str | None = None) -> list[RunSummary]:
    summaries: list[RunSummary] = []
    for run_path in sorted(runs_dir().glob("*"), reverse=True):
      try:
        summary = self._read_summary(run_path)
      except Exception:
        continue
      if workspace_id is not None and summary.workspace_id != workspace_id:
        continue
      summaries.append(summary)
    return summaries

  def get_run(self, run_id: str) -> RunSummary:
    run_dir = runs_dir() / run_id
    if not run_dir.exists():
      raise FileNotFoundError(run_id)
    return self._read_summary(run_dir)

  async def start_run(self, request: RunRequest) -> RunSummary:
    request = self._normalize_request(request)
    if request.script_path is None:
      raise ValueError("script_path or script_relative_path is required")
    run_id = datetime.utcnow().strftime("%Y%m%d-%H%M%S") + "-" + uuid.uuid4().hex[:8]
    run_dir = runs_dir() / run_id
    run_dir.mkdir(parents=True, exist_ok=True)
    summary = RunSummary(
      id=run_id,
      status="queued",
      script_path=str(request.script_path),
      workspace_id=request.workspace_id,
      script_relative_path=request.script_relative_path,
      created_at=datetime.utcnow(),
      trace_path=str(run_dir / "trace.json"),
      manifest_path=str(run_dir / "run.json"),
    )
    self._write_summary(run_dir, summary)
    asyncio.create_task(self._run(run_dir, summary, request))
    return summary

  async def cancel_run(self, run_id: str) -> RunSummary:
    process = self._processes.get(run_id)
    if process is not None and process.returncode is None:
      self._cancelled.add(run_id)
      process.terminate()
      await self._publish(run_id, "status", {"status": "cancelled"})
    return self.get_run(run_id)

  async def subscribe(self, run_id: str) -> asyncio.Queue[RunEvent]:
    queue: asyncio.Queue[RunEvent] = asyncio.Queue()
    self._subscribers.setdefault(run_id, set()).add(queue)
    return queue

  def unsubscribe(self, run_id: str, queue: asyncio.Queue[RunEvent]) -> None:
    subscribers = self._subscribers.get(run_id)
    if subscribers is None:
      return
    subscribers.discard(queue)
    if len(subscribers) == 0:
      self._subscribers.pop(run_id, None)

  async def _run(self, run_dir: Path, summary: RunSummary, request: RunRequest) -> None:
    summary.status = "running"
    summary.started_at = datetime.utcnow()
    self._write_summary(run_dir, summary)
    await self._publish(summary.id, "status", summary.model_dump(mode="json"))

    python = str(request.python_executable or sys.executable)
    if request.script_path is None:
      raise ValueError("script_path or script_relative_path is required")
    cwd = request.working_directory or request.script_path.parent
    env = os.environ.copy()
    env.update(request.env)
    env.update(
      {
        "PLR_GUI_RUN_ID": summary.id,
        "PLR_GUI_RUN_DIR": str(run_dir),
        "PLR_GUI_TRACE_PATH": str(run_dir / "trace.json"),
      }
    )

    stdout_path = run_dir / "stdout.log"
    stderr_path = run_dir / "stderr.log"
    source_snapshot_path = run_dir / "source.py"
    if request.script_path.exists():
      shutil.copyfile(request.script_path, source_snapshot_path)
      summary.source_snapshot_path = str(source_snapshot_path)

    workspace_path = None
    if request.workspace_id is not None:
      workspace_path = get_workspace(request.workspace_id).path

    metadata: dict[str, Any] = {
      "request": request.model_dump(mode="json"),
      "environment": {
        "python": python,
        "working_directory": str(cwd),
        "trace_path": str(run_dir / "trace.json"),
      },
    }

    try:
      process = await asyncio.create_subprocess_exec(
        python,
        str(request.script_path),
        *request.args,
        cwd=str(cwd),
        env=env,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
      )
      self._processes[summary.id] = process
      assert process.stdout is not None
      assert process.stderr is not None
      await asyncio.gather(
        self._stream(summary.id, process.stdout, stdout_path, "stdout"),
        self._stream(summary.id, process.stderr, stderr_path, "stderr"),
      )
      summary.return_code = await process.wait()
      if summary.id in self._cancelled:
        summary.status = "cancelled"
      else:
        summary.status = "completed" if summary.return_code == 0 else "failed"
    except Exception as exc:
      summary.status = "failed"
      metadata["error"] = str(exc)
      await self._publish(summary.id, "error", {"message": str(exc)})
    finally:
      summary.finished_at = datetime.utcnow()
      if summary.started_at is not None:
        summary.duration_seconds = round(
          (summary.finished_at - summary.started_at).total_seconds(),
          3,
        )
      if not (run_dir / "trace.json").exists():
        self._write_empty_trace(run_dir)
      summary.report_path = str(write_report(run_dir, summary, metadata))
      self._write_summary(run_dir, summary)
      self._write_manifest(run_dir, summary, request, workspace_path)
      (run_dir / "metadata-extra.json").write_text(
        json.dumps(metadata, indent=2, default=str),
        encoding="utf-8",
      )
      await self._publish(summary.id, "status", summary.model_dump(mode="json"))
      self._processes.pop(summary.id, None)
      self._cancelled.discard(summary.id)

  async def _stream(
    self,
    run_id: str,
    stream: asyncio.StreamReader,
    path: Path,
    event_type: str,
  ) -> None:
    with path.open("ab") as file:
      while True:
        line = await stream.readline()
        if not line:
          break
        file.write(line)
        file.flush()
        await self._publish(
          run_id,
          event_type,
          {"text": line.decode("utf-8", errors="replace")},
        )

  async def _publish(self, run_id: str, event_type: str, payload: dict[str, Any]) -> None:
    event = RunEvent(type=event_type, run_id=run_id, payload=payload)
    for queue in list(self._subscribers.get(run_id, set())):
      await queue.put(event)

  def _write_summary(self, run_dir: Path, summary: RunSummary) -> None:
    run_dir.mkdir(parents=True, exist_ok=True)
    (run_dir / "metadata.json").write_text(
      summary.model_dump_json(indent=2),
      encoding="utf-8",
    )

  def _write_manifest(
    self,
    run_dir: Path,
    summary: RunSummary,
    request: RunRequest,
    workspace_path: str | None,
  ) -> None:
    artifacts = {
      "trace": str(run_dir / "trace.json"),
      "stdout": str(run_dir / "stdout.log"),
      "stderr": str(run_dir / "stderr.log"),
      "report": summary.report_path,
      "source_snapshot": summary.source_snapshot_path,
    }
    manifest = RunManifest(
      id=summary.id,
      workspace_id=summary.workspace_id,
      workspace_path=workspace_path,
      launch_profile_snapshot=request.profile_snapshot,
      script_relative_path=summary.script_relative_path,
      script_path=summary.script_path,
      status=summary.status,
      created_at=summary.created_at,
      started_at=summary.started_at,
      finished_at=summary.finished_at,
      return_code=summary.return_code,
      artifacts=artifacts,
      metrics={"duration_seconds": summary.duration_seconds},
    )
    (run_dir / "run.json").write_text(manifest.model_dump_json(indent=2), encoding="utf-8")

  def _read_summary(self, run_dir: Path) -> RunSummary:
    manifest_path = run_dir / "run.json"
    if manifest_path.exists():
      manifest = RunManifest.model_validate_json(manifest_path.read_text(encoding="utf-8"))
      return RunSummary(
        id=manifest.id,
        status=manifest.status,
        script_path=manifest.script_path,
        workspace_id=manifest.workspace_id,
        script_relative_path=manifest.script_relative_path,
        created_at=manifest.created_at,
        started_at=manifest.started_at,
        finished_at=manifest.finished_at,
        return_code=manifest.return_code,
        report_path=manifest.artifacts.get("report"),
        trace_path=manifest.artifacts.get("trace"),
        manifest_path=str(manifest_path),
        source_snapshot_path=manifest.artifacts.get("source_snapshot"),
        duration_seconds=manifest.metrics.get("duration_seconds"),
      )
    return RunSummary.model_validate_json((run_dir / "metadata.json").read_text(encoding="utf-8"))

  def _normalize_request(self, request: RunRequest) -> RunRequest:
    if request.workspace_id and request.script_relative_path:
      request.script_path = resolve_workspace_path(request.workspace_id, request.script_relative_path)
      if request.working_directory is None:
        request.working_directory = Path(get_workspace(request.workspace_id).path)
    if request.script_path is None:
      return request
    if request.workspace_id and request.working_directory is not None:
      root = Path(get_workspace(request.workspace_id).path).resolve()
      cwd = request.working_directory
      if not cwd.is_absolute():
        cwd = (root / cwd).resolve()
      if cwd != root and root not in cwd.parents:
        raise ValueError("working_directory is outside workspace")
      request.working_directory = cwd
    return request

  def _write_empty_trace(self, run_dir: Path) -> None:
    trace = {
      "schema_version": "0.1.0",
      "events": [],
      "deck": {"root": None, "resources": {}},
      "geometry": {"root": None, "prototypes": {}, "instances": {}},
    }
    (run_dir / "trace.json").write_text(json.dumps(trace, indent=2), encoding="utf-8")


run_manager = RunManager()
