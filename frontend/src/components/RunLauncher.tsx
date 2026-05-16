import Editor from "@monaco-editor/react";
import {
  CircleStop,
  Copy,
  ExternalLink,
  FileCode2,
  FolderOpen,
  Play,
  Plus,
  RefreshCw,
  Save,
  Trash2,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  cancelRun,
  createProfile,
  deleteProfile,
  getRunTextArtifact,
  getRunTrace,
  listProfiles,
  listRuns,
  listWorkspaceFiles,
  listWorkspaces,
  openWorkspace,
  readWorkspaceFile,
  saveWorkspaceFile,
  startRun,
  updateProfile,
} from "../api";
import type {
  GuiTrace,
  LaunchProfile,
  RunSummary,
  WorkspaceFile,
  WorkspaceSummary,
} from "../types";

type StreamLine = {
  stream: "stdout" | "stderr";
  text: string;
};

type ViewMode = "launch" | "editor" | "run";

type LaunchDraft = {
  name: string;
  script_relative_path: string;
  working_directory: string;
  python_executable: string;
  args: string;
  env: string;
};

const EMPTY_DRAFT: LaunchDraft = {
  name: "New profile",
  script_relative_path: "",
  working_directory: "",
  python_executable: "",
  args: "",
  env: "",
};

export function RunLauncher({ onTraceLoaded }: { onTraceLoaded: (trace: GuiTrace) => void }) {
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [workspacePath, setWorkspacePath] = useState("");
  const [workspace, setWorkspace] = useState<WorkspaceSummary | null>(null);
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [profiles, setProfiles] = useState<LaunchProfile[]>([]);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [draft, setDraft] = useState<LaunchDraft>(EMPTY_DRAFT);
  const [editorValue, setEditorValue] = useState("");
  const [savedEditorValue, setSavedEditorValue] = useState("");
  const [runStdout, setRunStdout] = useState("");
  const [runStderr, setRunStderr] = useState("");
  const [runSource, setRunSource] = useState("");
  const [log, setLog] = useState<StreamLine[]>([]);
  const [activeRun, setActiveRun] = useState<string | null>(null);
  const [mode, setMode] = useState<ViewMode>("launch");
  const [launching, setLaunching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logRef = useRef<HTMLPreElement | null>(null);

  const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId) ?? null;
  const selectedRun = runs.find((run) => run.id === selectedRunId) ?? null;
  const dirty = editorValue !== savedEditorValue;
  const activeSummary = useMemo(
    () => runs.find((run) => run.id === activeRun) ?? null,
    [activeRun, runs],
  );

  useEffect(() => {
    listWorkspaces()
      .then((response) => {
        setWorkspaces(response.workspaces);
        if (response.workspaces[0]) setWorkspace(response.workspaces[0]);
      })
      .catch((exc) => setError(readError(exc)));
  }, []);

  useEffect(() => {
    if (!workspace) return;
    setWorkspacePath(workspace.path);
    refreshWorkspace(workspace.id);
  }, [workspace?.id]);

  useEffect(() => {
    if (!activeRun) return;
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${protocol}//${window.location.host}/ws/runs/${activeRun}`);
    socket.onmessage = (message) => {
      const event = JSON.parse(message.data) as {
        type: "stdout" | "stderr" | "status" | "error";
        payload: Record<string, unknown>;
      };
      if (event.type === "stdout" || event.type === "stderr") {
        const stream = event.type;
        setLog((previous) => [
          ...previous.slice(-300),
          { stream, text: String(event.payload.text ?? "") },
        ]);
      }
      if (event.type === "error") setError(String(event.payload.message ?? "Run failed."));
      if (event.type === "status") {
        refreshRuns();
        const status = event.payload.status;
        if (status === "completed" || status === "failed" || status === "cancelled") {
          setActiveRun(null);
        }
      }
    };
    socket.onerror = () => setError("Live log connection failed.");
    return () => socket.close();
  }, [activeRun]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [log]);

  async function refreshWorkspace(workspaceId = workspace?.id) {
    if (!workspaceId) return;
    setError(null);
    try {
      const [fileResponse, profileResponse, runResponse] = await Promise.all([
        listWorkspaceFiles(workspaceId),
        listProfiles(workspaceId),
        listRuns(workspaceId),
      ]);
      setFiles(fileResponse.files);
      setProfiles(profileResponse.profiles);
      setRuns(runResponse.runs);
    } catch (exc) {
      setError(readError(exc));
    }
  }

  async function refreshRuns() {
    if (!workspace) return;
    try {
      const response = await listRuns(workspace.id);
      setRuns(response.runs);
    } catch (exc) {
      setError(readError(exc));
    }
  }

  async function openWorkspacePath() {
    setError(null);
    try {
      const nextWorkspace = await openWorkspace(workspacePath.trim());
      setWorkspace(nextWorkspace);
      setWorkspaces((previous) => [nextWorkspace, ...previous.filter((item) => item.id !== nextWorkspace.id)]);
      setSelectedFile(null);
      setSelectedProfileId(null);
      setSelectedRunId(null);
      setMode("launch");
    } catch (exc) {
      setError(readError(exc));
    }
  }

  async function selectFile(path: string) {
    if (!workspace) return;
    if (dirty && !window.confirm("Discard unsaved editor changes?")) return;
    setError(null);
    try {
      const file = await readWorkspaceFile(workspace.id, path);
      setSelectedFile(file.path);
      setEditorValue(file.content);
      setSavedEditorValue(file.content);
      setDraft((previous) => ({ ...previous, script_relative_path: file.path }));
      setSelectedRunId(null);
      setMode("editor");
    } catch (exc) {
      setError(readError(exc));
    }
  }

  async function saveEditor() {
    if (!workspace || !selectedFile) return;
    setSaving(true);
    setError(null);
    try {
      const file = await saveWorkspaceFile(workspace.id, selectedFile, editorValue);
      setSavedEditorValue(file.content);
      refreshWorkspace(workspace.id);
    } catch (exc) {
      setError(readError(exc));
    } finally {
      setSaving(false);
    }
  }

  function selectProfile(profile: LaunchProfile) {
    if (dirty && !window.confirm("Discard unsaved editor changes?")) return;
    setSelectedProfileId(profile.id);
    setDraft(profileToDraft(profile));
    setSelectedFile(profile.script_relative_path || null);
    setSelectedRunId(null);
    setMode("launch");
  }

  async function saveProfile() {
    if (!workspace) return;
    setError(null);
    try {
      const payload = draftToProfilePayload(draft);
      const profile = selectedProfile
        ? await updateProfile(workspace.id, selectedProfile.id, payload)
        : await createProfile(workspace.id, payload);
      setSelectedProfileId(profile.id);
      await refreshWorkspace(workspace.id);
    } catch (exc) {
      setError(readError(exc));
    }
  }

  async function duplicateProfile() {
    if (!workspace) return;
    setError(null);
    try {
      const profile = await createProfile(workspace.id, {
        ...draftToProfilePayload(draft),
        name: `${draft.name || "Profile"} copy`,
      });
      setSelectedProfileId(profile.id);
      setDraft(profileToDraft(profile));
      await refreshWorkspace(workspace.id);
    } catch (exc) {
      setError(readError(exc));
    }
  }

  async function removeProfile(profile: LaunchProfile) {
    if (!workspace) return;
    setError(null);
    try {
      await deleteProfile(workspace.id, profile.id);
      if (selectedProfileId === profile.id) {
        setSelectedProfileId(null);
        setDraft(EMPTY_DRAFT);
      }
      await refreshWorkspace(workspace.id);
    } catch (exc) {
      setError(readError(exc));
    }
  }

  async function runDraft(pathOverride?: string) {
    if (!workspace) {
      setError("Open a workspace before running.");
      return;
    }
    if (dirty) {
      setError("Save before run.");
      return;
    }
    const script = pathOverride || draft.script_relative_path || selectedFile;
    if (!script) {
      setError("Select a Python file or profile first.");
      return;
    }
    setLaunching(true);
    setError(null);
    setLog([]);
    try {
      const payload = draftToProfilePayload({ ...draft, script_relative_path: script });
      const run = await startRun({
        workspace_id: workspace.id,
        script_relative_path: script,
        profile_id: selectedProfileId ?? undefined,
        profile_snapshot: selectedProfile
          ? (selectedProfile as unknown as Record<string, unknown>)
          : payload,
        working_directory: payload.working_directory ?? undefined,
        python_executable: payload.python_executable ?? undefined,
        args: payload.args,
        env: payload.env,
      });
      setActiveRun(run.id);
      setSelectedRunId(run.id);
      setMode("run");
      await refreshWorkspace(workspace.id);
    } catch (exc) {
      setError(readError(exc));
    } finally {
      setLaunching(false);
    }
  }

  async function cancelActiveRun() {
    if (!activeRun) return;
    setError(null);
    try {
      const summary = await cancelRun(activeRun);
      setRuns((previous) => previous.map((run) => (run.id === summary.id ? summary : run)));
      setActiveRun(null);
    } catch (exc) {
      setError(readError(exc));
    }
  }

  async function selectRun(run: RunSummary) {
    setSelectedRunId(run.id);
    setSelectedFile(null);
    setMode("run");
    setError(null);
    try {
      const [stdout, stderr, source] = await Promise.all([
        getRunTextArtifact(run.id, "stdout").catch(() => ""),
        getRunTextArtifact(run.id, "stderr").catch(() => ""),
        getRunTextArtifact(run.id, "source").catch(() => ""),
      ]);
      setRunStdout(stdout);
      setRunStderr(stderr);
      setRunSource(source);
    } catch (exc) {
      setError(readError(exc));
    }
  }

  async function loadRunTrace(runId: string) {
    setError(null);
    try {
      onTraceLoaded(await getRunTrace(runId));
    } catch (exc) {
      setError(readError(exc));
    }
  }

  return (
    <section className="page runs-page">
      <header className="runs-header">
        <div>
          <h1>Runs</h1>
          <p>{workspace ? workspace.path : "Open a workspace to edit protocols and launch runs."}</p>
        </div>
        <div className="header-actions">
          {activeSummary && <StatusPill status={activeSummary.status} />}
          {mode === "editor" && (
            <button onClick={saveEditor} disabled={!dirty || saving} type="button">
              <Save size={18} />
              {saving ? "Saving" : "Save"}
            </button>
          )}
          <button className="primary" onClick={() => runDraft()} disabled={!workspace || launching} type="button">
            <Play size={18} />
            {launching ? "Starting" : "Run"}
          </button>
          {activeRun && (
            <button onClick={cancelActiveRun} type="button">
              <CircleStop size={18} />
              Cancel
            </button>
          )}
          <button onClick={() => refreshWorkspace()} title="Refresh workspace" type="button">
            <RefreshCw size={18} />
          </button>
        </div>
      </header>

      <div className="runs-cockpit">
        <main className="runs-workarea">
          {!workspace ? (
            <div className="empty-state">
              <strong>No workspace open</strong>
              <span>Enter a local workspace path in the rail to browse Python files and launch runs.</span>
            </div>
          ) : mode === "editor" ? (
            <EditorPane
              dirty={dirty}
              editorValue={editorValue}
              filePath={selectedFile}
              launching={launching}
              onChange={setEditorValue}
              onRun={() => runDraft(selectedFile ?? undefined)}
              onSave={saveEditor}
              saving={saving}
            />
          ) : mode === "run" && selectedRun ? (
            <RunDetail
              run={selectedRun}
              stdout={selectedRun.id === activeRun ? logToText(log, "stdout") || runStdout : runStdout}
              stderr={selectedRun.id === activeRun ? logToText(log, "stderr") || runStderr : runStderr}
              source={runSource}
              onLoadTrace={() => loadRunTrace(selectedRun.id)}
            />
          ) : (
            <LaunchPane
              draft={draft}
              files={files}
              launching={launching}
              profile={selectedProfile}
              onChange={setDraft}
              onDuplicate={duplicateProfile}
              onNew={() => {
                setSelectedProfileId(null);
                setDraft({ ...EMPTY_DRAFT, script_relative_path: selectedFile ?? "" });
              }}
              onRun={() => runDraft()}
              onSaveProfile={saveProfile}
            />
          )}
          {error && <p className="error">{error}</p>}
        </main>

        <aside className="runs-rail">
          <RailSection title="Workspace">
            <div className="workspace-open">
              <input
                value={workspacePath}
                onChange={(event) => setWorkspacePath(event.target.value)}
                placeholder="/path/to/protocol-workspace"
              />
              <button onClick={openWorkspacePath} type="button">
                <FolderOpen size={16} />
                Open
              </button>
            </div>
            <div className="rail-list">
              {workspaces.map((item) => (
                <button
                  className={workspace?.id === item.id ? "rail-item active" : "rail-item"}
                  key={item.id}
                  onClick={() => setWorkspace(item)}
                  type="button"
                >
                  <strong>{item.name}</strong>
                  <span>{item.path}</span>
                </button>
              ))}
            </div>
          </RailSection>

          {workspace && (
            <>
              <RailSection title="Files" count={files.length}>
                <div className="rail-list">
                  {files.map((file) => (
                    <button
                      className={selectedFile === file.path ? "rail-item active" : "rail-item"}
                      key={file.path}
                      onClick={() => selectFile(file.path)}
                      type="button"
                    >
                      <strong>{file.path}</strong>
                      <span>{formatBytes(file.size)}</span>
                    </button>
                  ))}
                </div>
              </RailSection>

              <RailSection title="Launch Profiles" count={profiles.length}>
                <button className="rail-command" onClick={() => setMode("launch")} type="button">
                  <Plus size={16} />
                  New or edit profile
                </button>
                <div className="rail-list">
                  {profiles.map((profile) => (
                    <div className={selectedProfileId === profile.id ? "rail-card active" : "rail-card"} key={profile.id}>
                      <button className="rail-item" onClick={() => selectProfile(profile)} type="button">
                        <strong>{profile.name}</strong>
                        <span>{profile.script_relative_path || "No script selected"}</span>
                      </button>
                      <button className="icon-button" onClick={() => removeProfile(profile)} title="Delete profile" type="button">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              </RailSection>

              <RailSection title="Runs" count={runs.length}>
                <div className="rail-list">
                  {runs.map((run) => (
                    <button
                      className={selectedRunId === run.id ? "rail-item run active" : "rail-item run"}
                      key={run.id}
                      onClick={() => selectRun(run)}
                      type="button"
                    >
                      <span className={`status-dot status-${run.status}`} />
                      <strong>{basename(run.script_path)}</strong>
                      <span>{formatDate(run.created_at)} · {formatDuration(run)}</span>
                    </button>
                  ))}
                </div>
              </RailSection>
            </>
          )}
        </aside>
      </div>
    </section>
  );
}

function RailSection({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return (
    <section className="rail-section">
      <div className="rail-heading">
        <h2>{title}</h2>
        {typeof count === "number" && <span>{count}</span>}
      </div>
      {children}
    </section>
  );
}

function LaunchPane({
  draft,
  files,
  launching,
  profile,
  onChange,
  onDuplicate,
  onNew,
  onRun,
  onSaveProfile,
}: {
  draft: LaunchDraft;
  files: WorkspaceFile[];
  launching: boolean;
  profile: LaunchProfile | null;
  onChange: (draft: LaunchDraft) => void;
  onDuplicate: () => void;
  onNew: () => void;
  onRun: () => void;
  onSaveProfile: () => void;
}) {
  return (
    <div className="runs-pane">
      <div className="section-heading">
        <div>
          <h2>{profile ? `Profile: ${profile.name}` : "Launch Profile"}</h2>
          <span>Save repeatable run settings per workspace</span>
        </div>
        <div className="button-row">
          <button onClick={onNew} type="button">
            <Plus size={16} />
            New
          </button>
          <button onClick={onDuplicate} disabled={!profile} type="button">
            <Copy size={16} />
            Duplicate
          </button>
          <button onClick={onSaveProfile} type="button">
            <Save size={16} />
            Save Profile
          </button>
          <button className="primary" onClick={onRun} disabled={launching} type="button">
            <Play size={16} />
            Run
          </button>
        </div>
      </div>

      <div className="launch-form-grid">
        <label>
          Profile name
          <input value={draft.name} onChange={(event) => onChange({ ...draft, name: event.target.value })} />
        </label>
        <label>
          Script
          <select
            value={draft.script_relative_path}
            onChange={(event) => onChange({ ...draft, script_relative_path: event.target.value })}
          >
            <option value="">Select a Python file</option>
            {files.map((file) => (
              <option key={file.path} value={file.path}>
                {file.path}
              </option>
            ))}
          </select>
        </label>
        <label>
          Working directory
          <input
            value={draft.working_directory}
            onChange={(event) => onChange({ ...draft, working_directory: event.target.value })}
            placeholder="Workspace root"
          />
        </label>
        <label>
          Python executable
          <input
            value={draft.python_executable}
            onChange={(event) => onChange({ ...draft, python_executable: event.target.value })}
            placeholder="Backend Python"
          />
        </label>
        <label>
          Arguments
          <input
            value={draft.args}
            onChange={(event) => onChange({ ...draft, args: event.target.value })}
            placeholder='--backend star --plate "plate 1"'
          />
        </label>
        <label>
          Environment
          <textarea
            value={draft.env}
            onChange={(event) => onChange({ ...draft, env: event.target.value })}
            placeholder={"KEY=value\nPLR_GUI_MODE=dev"}
          />
        </label>
      </div>
    </div>
  );
}

function EditorPane({
  dirty,
  editorValue,
  filePath,
  launching,
  saving,
  onChange,
  onRun,
  onSave,
}: {
  dirty: boolean;
  editorValue: string;
  filePath: string | null;
  launching: boolean;
  saving: boolean;
  onChange: (value: string) => void;
  onRun: () => void;
  onSave: () => void;
}) {
  return (
    <div className="runs-pane editor-pane">
      <div className="section-heading">
        <div>
          <h2>{filePath ?? "Python file"}</h2>
          <span>{dirty ? "Unsaved changes" : "Saved"}</span>
        </div>
        <div className="button-row">
          <button onClick={onSave} disabled={!dirty || saving} type="button">
            <Save size={16} />
            {saving ? "Saving" : "Save"}
          </button>
          <button className="primary" onClick={onRun} disabled={launching} type="button">
            <Play size={16} />
            Run File
          </button>
        </div>
      </div>
      <div className="monaco-shell">
        <Editor
          language="python"
          options={{ minimap: { enabled: false }, fontSize: 13, scrollBeyondLastLine: false }}
          theme="vs-dark"
          value={editorValue}
          onChange={(value) => onChange(value ?? "")}
        />
      </div>
    </div>
  );
}

function RunDetail({
  run,
  stdout,
  stderr,
  source,
  onLoadTrace,
}: {
  run: RunSummary;
  stdout: string;
  stderr: string;
  source: string;
  onLoadTrace: () => void;
}) {
  return (
    <div className="runs-pane">
      <div className="section-heading">
        <div>
          <h2>{basename(run.script_path)}</h2>
          <span>{run.id}</span>
        </div>
        <div className="button-row">
          <StatusPill status={run.status} />
          <button onClick={onLoadTrace} type="button">
            <FileCode2 size={16} />
            Load Trace
          </button>
          <a href={`/api/runs/${run.id}/report`} target="_blank" rel="noreferrer">
            <ExternalLink size={16} />
            Report
          </a>
        </div>
      </div>
      <div className="run-detail-grid">
        <Info label="Script" value={run.script_relative_path ?? run.script_path} />
        <Info label="Created" value={formatDate(run.created_at)} />
        <Info label="Duration" value={formatDuration(run)} />
        <Info label="Return code" value={typeof run.return_code === "number" ? String(run.return_code) : "pending"} />
      </div>
      <div className="artifact-grid">
        <div>
          <h2>stdout</h2>
          <pre className="log">{stdout || "No stdout."}</pre>
        </div>
        <div>
          <h2>stderr</h2>
          <pre className="log">{stderr || "No stderr."}</pre>
        </div>
      </div>
      <div>
        <h2>Source Snapshot</h2>
        <pre className="snippet">{source || "No source snapshot."}</pre>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  return <span className={`status-pill status-${status}`}>{status}</span>;
}

function basename(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(run: RunSummary): string {
  if (typeof run.duration_seconds === "number") return `${Math.round(run.duration_seconds)}s`;
  if (!run.started_at) return "not started";
  const start = new Date(run.started_at).getTime();
  const end = run.finished_at ? new Date(run.finished_at).getTime() : Date.now();
  if (Number.isNaN(start) || Number.isNaN(end)) return "duration unknown";
  return `${Math.max(0, Math.round((end - start) / 1000))}s`;
}

function parseArgs(value: string): string[] {
  const matches = value.match(/(?:[^\s"]+|"[^"]*")+/g) ?? [];
  return matches.map((item) => item.replace(/^"|"$/g, ""));
}

function parseEnv(value: string): Record<string, string> {
  return Object.fromEntries(
    value
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const index = line.indexOf("=");
        if (index === -1) return [line, ""];
        return [line.slice(0, index), line.slice(index + 1)];
      }),
  );
}

function serializeEnv(value: Record<string, string>): string {
  return Object.entries(value).map(([key, val]) => `${key}=${val}`).join("\n");
}

function profileToDraft(profile: LaunchProfile): LaunchDraft {
  return {
    name: profile.name,
    script_relative_path: profile.script_relative_path,
    working_directory: profile.working_directory ?? "",
    python_executable: profile.python_executable ?? "",
    args: shellJoin(profile.args),
    env: serializeEnv(profile.env),
  };
}

function draftToProfilePayload(draft: LaunchDraft): Omit<LaunchProfile, "id" | "updated_at"> {
  return {
    name: draft.name || "Untitled profile",
    script_relative_path: draft.script_relative_path,
    working_directory: draft.working_directory || null,
    python_executable: draft.python_executable || null,
    args: parseArgs(draft.args),
    env: parseEnv(draft.env),
  };
}

function shellJoin(args: string[]): string {
  return args.map((arg) => (/\s/.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg)).join(" ");
}

function logToText(log: StreamLine[], stream: "stdout" | "stderr"): string {
  return log.filter((line) => line.stream === stream).map((line) => line.text).join("");
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function readError(exc: unknown): string {
  return exc instanceof Error ? exc.message : String(exc);
}
