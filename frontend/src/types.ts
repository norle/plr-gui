export type TraceEvent = {
  event?: string;
  action?: string;
  instruction?: string;
  channel?: number;
  head?: string;
  phase?: string;
  target?: number[] | { x?: number; y?: number; z?: number };
  channels?: Array<{
    channel: number;
    resource: string;
    target: number[];
    volume?: number;
  }>;
  [key: string]: unknown;
};

export type CompactResource = {
  type: string;
  category?: string | null;
  parent?: string | null;
  size: number[];
  absolute_size?: number[];
  absolute_location?: number[] | null;
  absolute_center?: number[] | null;
  model?: string;
};

export type GeometryCatalog = {
  root: string | null;
  prototypes: Record<string, { type: string; category?: string; size: number[]; geometry?: { shape?: string } }>;
  instances: Record<string, { prototype: string; parent?: string | null; pose?: number[] | null; rotation?: number[]; children?: string[] }>;
};

export type GuiTrace = {
  schema_version?: string;
  plr_version?: string;
  events: TraceEvent[];
  deck?: {
    root?: string | null;
    resources?: Record<string, CompactResource>;
  };
  geometry?: GeometryCatalog;
  liquid_tracking?: unknown;
};

export type RunSummary = {
  id: string;
  status: string;
  script_path: string;
  created_at: string;
  workspace_id?: string | null;
  script_relative_path?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  return_code?: number | null;
  report_path?: string | null;
  trace_path?: string | null;
  manifest_path?: string | null;
  source_snapshot_path?: string | null;
  duration_seconds?: number | null;
};

export type ResourceFactory = {
  name: string;
  module: string;
  signature: string;
  doc?: string | null;
};

export type WorkspaceSummary = {
  id: string;
  name: string;
  path: string;
  last_opened_at: string;
};

export type WorkspaceFile = {
  path: string;
  name: string;
  size: number;
  modified_at: string;
};

export type WorkspaceFileContent = {
  path: string;
  content: string;
  modified_at: string;
};

export type LaunchProfile = {
  id: string;
  name: string;
  script_relative_path: string;
  working_directory?: string | null;
  python_executable?: string | null;
  args: string[];
  env: Record<string, string>;
  updated_at: string;
};
