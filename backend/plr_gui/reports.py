from __future__ import annotations

import html
import json
from pathlib import Path
from typing import Any

from plr_gui.models import RunSummary


def write_report(run_dir: Path, summary: RunSummary, metadata: dict[str, Any]) -> Path:
  trace_path = run_dir / "trace.json"
  trace_summary = "No trace.json was produced."
  if trace_path.exists():
    try:
      trace = json.loads(trace_path.read_text(encoding="utf-8"))
      trace_summary = (
        f"{len(trace.get('events', []))} events, "
        f"schema {trace.get('schema_version', 'unknown')}"
      )
    except Exception as exc:
      trace_summary = f"Could not parse trace.json: {exc}"

  stdout = _read_text(run_dir / "stdout.log")
  stderr = _read_text(run_dir / "stderr.log")
  report = run_dir / "report.html"
  report.write_text(
    f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>PLR Run {html.escape(summary.id)}</title>
  <style>
    body {{ font-family: system-ui, sans-serif; margin: 32px; color: #172026; }}
    code, pre {{ background: #f4f6f8; border-radius: 6px; padding: 8px; }}
    pre {{ overflow: auto; }}
    dl {{ display: grid; grid-template-columns: 160px 1fr; gap: 8px 16px; }}
    dt {{ font-weight: 700; }}
    dd {{ margin: 0; }}
  </style>
</head>
<body>
  <h1>PLR Run Report</h1>
  <dl>
    <dt>Run ID</dt><dd>{html.escape(summary.id)}</dd>
    <dt>Status</dt><dd>{html.escape(summary.status)}</dd>
    <dt>Script</dt><dd>{html.escape(summary.script_path)}</dd>
    <dt>Return Code</dt><dd>{summary.return_code}</dd>
    <dt>Trace</dt><dd>{html.escape(trace_summary)}</dd>
  </dl>
  <h2>Metadata</h2>
  <pre>{html.escape(json.dumps(metadata, indent=2, default=str))}</pre>
  <h2>stdout</h2>
  <pre>{html.escape(stdout)}</pre>
  <h2>stderr</h2>
  <pre>{html.escape(stderr)}</pre>
</body>
</html>
""",
    encoding="utf-8",
  )
  return report


def _read_text(path: Path) -> str:
  if not path.exists():
    return ""
  return path.read_text(encoding="utf-8", errors="replace")

