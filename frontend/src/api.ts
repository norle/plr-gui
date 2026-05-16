import type { ResourceFactory, RunSummary } from "./types";

const API_BASE = "";

export async function getHealth() {
  return getJson<{ status: string; version: string; pylabrobot_version?: string | null }>("/api/health");
}

export async function listRuns() {
  return getJson<{ runs: RunSummary[] }>("/api/runs");
}

export async function startRun(payload: {
  script_path: string;
  working_directory?: string;
  python_executable?: string;
  args?: string[];
}) {
  return postJson<RunSummary>("/api/runs", payload);
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

