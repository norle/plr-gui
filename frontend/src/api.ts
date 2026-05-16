import type {
  GuiTrace,
  LaunchProfile,
  ResourceFactory,
  RunSummary,
  WorkspaceFile,
  WorkspaceFileContent,
  WorkspaceSummary,
} from "./types";

const API_BASE = "";

export async function getHealth() {
  return getJson<{ status: string; version: string; pylabrobot_version?: string | null }>("/api/health");
}

export async function listRuns(workspaceId?: string) {
  const query = workspaceId ? `?workspace_id=${encodeURIComponent(workspaceId)}` : "";
  return getJson<{ runs: RunSummary[] }>(`/api/runs${query}`);
}

export async function startRun(payload: {
  script_path?: string;
  workspace_id?: string;
  script_relative_path?: string;
  profile_id?: string;
  profile_snapshot?: Record<string, unknown>;
  working_directory?: string;
  python_executable?: string;
  args?: string[];
  env?: Record<string, string>;
}) {
  return postJson<RunSummary>("/api/runs", payload);
}

export async function cancelRun(runId: string) {
  return postJson<RunSummary>(`/api/runs/${runId}/cancel`, {});
}

export async function getRunTrace(runId: string) {
  return getJson<GuiTrace>(`/api/runs/${runId}/trace`);
}

export async function getRunTextArtifact(runId: string, artifact: "stdout" | "stderr" | "source") {
  const response = await fetch(`/api/runs/${runId}/${artifact}`);
  if (!response.ok) throw new Error(await response.text());
  return response.text();
}

export async function listWorkspaces() {
  return getJson<{ workspaces: WorkspaceSummary[] }>("/api/workspaces");
}

export async function openWorkspace(path: string) {
  return postJson<WorkspaceSummary>("/api/workspaces", { path });
}

export async function listWorkspaceFiles(workspaceId: string) {
  return getJson<{ files: WorkspaceFile[] }>(`/api/workspaces/${workspaceId}/files`);
}

export async function readWorkspaceFile(workspaceId: string, path: string) {
  return getJson<WorkspaceFileContent>(`/api/workspaces/${workspaceId}/file?path=${encodeURIComponent(path)}`);
}

export async function saveWorkspaceFile(workspaceId: string, path: string, content: string) {
  return putJson<WorkspaceFileContent>(`/api/workspaces/${workspaceId}/file?path=${encodeURIComponent(path)}`, { content });
}

export async function listProfiles(workspaceId: string) {
  return getJson<{ profiles: LaunchProfile[] }>(`/api/workspaces/${workspaceId}/profiles`);
}

export async function createProfile(workspaceId: string, payload: Omit<LaunchProfile, "id" | "updated_at">) {
  return postJson<LaunchProfile>(`/api/workspaces/${workspaceId}/profiles`, payload);
}

export async function updateProfile(workspaceId: string, profileId: string, payload: Omit<LaunchProfile, "id" | "updated_at">) {
  return putJson<LaunchProfile>(`/api/workspaces/${workspaceId}/profiles/${profileId}`, payload);
}

export async function deleteProfile(workspaceId: string, profileId: string) {
  return deleteJson<{ status: string }>(`/api/workspaces/${workspaceId}/profiles/${profileId}`);
}

export async function listResources() {
  return getJson<{ resources: ResourceFactory[] }>("/api/resources/catalog");
}

export async function createCustomResource(payload: Record<string, unknown>) {
  return postJson<{ python: string; json_definition: Record<string, unknown> }>("/api/resources/custom", payload);
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`);
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<T>;
}

async function postJson<T>(path: string, payload: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<T>;
}

async function putJson<T>(path: string, payload: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<T>;
}

async function deleteJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, { method: "DELETE" });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<T>;
}
