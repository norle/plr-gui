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

from plr_gui.models import RunEvent, RunRequest, RunStatus, RunSummary
from plr_gui.reports import write_report
from plr_gui.settings import runs_dir


class RunManager:
  def __init__(self) -> None:
    self._subscribers: dict[str, set[asyncio.Queue[RunEvent]]] = {}
    self._processes: dict[str, asyncio.subprocess.Process] = {}

  def list_runs(self) -> list[RunSummary]:
    summaries: list[RunSummary] = []
    for metadata_path in sorted(runs_dir().glob("*/metadata.json"), reverse=True):
      try:
        summaries.append(RunSummary.model_validate_json(metadata_path.read_text()))
      except Exception:
        continue
    return summaries

  def get_run(self, run_id: str) -> RunSummary:
    metadata_path = runs_dir() / run_id / "metadata.json"
    if not metadata_path.exists():
      raise FileNotFoundError(run_id)
    return RunSummary.model_validate_json(metadata_path.read_text())

  async def start_run(self, request: RunRequest) -> RunSummary:
    run_id = datetime.utcnow().strftime("%Y%m%d-%H%M%S") + "-" + uuid.uuid4().hex[:8]
    run_dir = runs_dir() / run_id
    run_dir.mkdir(parents=True, exist_ok=True)
    summary = RunSummary(
      id=run_id,
      status="queued",
      script_path=str(request.script_path),
      created_at=datetime.utcnow(),
      trace_path=str(run_dir / "trace.json"),
    )
    self._write_summary(run_dir, summary)
    asyncio.create_task(self._run(run_dir, summary, request))
    return summary

  async def cancel_run(self, run_id: str) -> RunSummary:
    process = self._processes.get(run_id)
    if process is not None and process.returncode is None:
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
      summary.status = "completed" if summary.return_code == 0 else "failed"
    except Exception as exc:
      summary.status = "failed"
      metadata["error"] = str(exc)
      await self._publish(summary.id, "error", {"message": str(exc)})
    finally:
      summary.finished_at = datetime.utcnow()
      if not (run_dir / "trace.json").exists():
        self._write_empty_trace(run_dir)
      summary.report_path = str(write_report(run_dir, summary, metadata))
      self._write_summary(run_dir, summary)
      (run_dir / "metadata-extra.json").write_text(
        json.dumps(metadata, indent=2, default=str),
        encoding="utf-8",
      )
      await self._publish(summary.id, "status", summary.model_dump(mode="json"))
      self._processes.pop(summary.id, None)

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

  def _write_empty_trace(self, run_dir: Path) -> None:
    trace = {
      "schema_version": "0.1.0",
      "events": [],
      "deck": {"root": None, "resources": {}},
      "geometry": {"root": None, "prototypes": {}, "instances": {}},
    }
    (run_dir / "trace.json").write_text(json.dumps(trace, indent=2), encoding="utf-8")


run_manager = RunManager()

