import { CircleStop, ExternalLink, Play, RotateCw } from "lucide-react";
import { useEffect, useState } from "react";
import { listRuns, startRun } from "../api";
import type { GuiTrace, RunSummary } from "../types";

export function RunLauncher({ onTraceLoaded }: { onTraceLoaded: (trace: GuiTrace) => void }) {
  const [scriptPath, setScriptPath] = useState("");
  const [workingDirectory, setWorkingDirectory] = useState("");
  const [pythonExecutable, setPythonExecutable] = useState("");
  const [args, setArgs] = useState("");
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [log, setLog] = useState<string[]>([]);
  const [activeRun, setActiveRun] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshRuns = () => listRuns().then((value) => setRuns(value.runs)).catch((exc) => setError(String(exc)));

  useEffect(() => {
    refreshRuns();
  }, []);

  useEffect(() => {
    if (!activeRun) return;
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${protocol}//${window.location.host}/ws/runs/${activeRun}`);
    socket.onmessage = (message) => {
      const event = JSON.parse(message.data);
      if (event.type === "stdout" || event.type === "stderr") {
        setLog((previous) => [...previous.slice(-200), event.payload.text]);
      }
      if (event.type === "status") refreshRuns();
    };
    return () => socket.close();
  }, [activeRun]);

  async function submitRun() {
    setError(null);
    setLog([]);
    const run = await startRun({
      script_path: scriptPath,
      working_directory: workingDirectory || undefined,
      python_executable: pythonExecutable || undefined,
      args: args.split(" ").filter(Boolean),
    });
    setActiveRun(run.id);
    refreshRuns();
  }

  async function loadRunTrace(runId: string) {
    const response = await fetch(`/api/runs/${runId}/trace`);
    if (!response.ok) throw new Error(await response.text());
    onTraceLoaded((await response.json()) as GuiTrace);
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <h1>Runs</h1>
          <p>Launch PLR scripts locally, stream logs, and record report artifacts.</p>
        </div>
        <button onClick={refreshRuns} title="Refresh runs">
          <RotateCw size={18} />
        </button>
      </header>

      <div className="run-grid">
        <form className="panel" onSubmit={(event) => { event.preventDefault(); submitRun().catch((exc) => setError(String(exc))); }}>
          <h2>Launch</h2>
          <label>
            Script path
            <input value={scriptPath} onChange={(event) => setScriptPath(event.target.value)} placeholder="/path/to/protocol.py" />
          </label>
          <label>
            Working directory
            <input value={workingDirectory} onChange={(event) => setWorkingDirectory(event.target.value)} placeholder="defaults to script directory" />
          </label>
          <label>
            Python executable
            <input value={pythonExecutable} onChange={(event) => setPythonExecutable(event.target.value)} placeholder="defaults to backend Python" />
          </label>
          <label>
            Arguments
            <input value={args} onChange={(event) => setArgs(event.target.value)} placeholder="--backend star" />
          </label>
          <button className="primary" type="submit">
            <Play size={18} />
            Start Run
          </button>
          {activeRun && (
            <button type="button" onClick={() => fetch(`/api/runs/${activeRun}/cancel`, { method: "POST" })}>
              <CircleStop size={18} />
              Cancel Active Run
            </button>
          )}
          {error && <p className="error">{error}</p>}
        </form>

        <div className="panel">
          <h2>Live Log</h2>
          <pre className="log">{log.join("") || "No active log stream."}</pre>
        </div>
      </div>

      <div className="panel">
        <h2>Run History</h2>
        <div className="table">
          {runs.map((run) => (
            <div className="table-row" key={run.id}>
              <span>{run.id}</span>
              <span>{run.status}</span>
              <span>{run.script_path}</span>
              <button onClick={() => loadRunTrace(run.id)}>
                Load Trace
              </button>
              <a href={`/api/runs/${run.id}/report`} target="_blank" rel="noreferrer">
                <ExternalLink size={16} />
                Report
              </a>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

