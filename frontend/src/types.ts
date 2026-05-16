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
  started_at?: string | null;
  finished_at?: string | null;
  return_code?: number | null;
  report_path?: string | null;
  trace_path?: string | null;
};

export type ResourceFactory = {
  name: string;
  module: string;
  signature: string;
  doc?: string | null;
};

