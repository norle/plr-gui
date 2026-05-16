import { Clipboard, Copy, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createCustomResource, listResources } from "../api";
import type { ResourceFactory } from "../types";

type ResourceKind = "box" | "container" | "plate" | "well" | "tip_rack" | "carrier" | "deck";

const KIND_DEFAULTS: Record<ResourceKind, { sizeX: number; sizeY: number; sizeZ: number; rows: number; columns: number; volume: number }> = {
  box: { sizeX: 127.76, sizeY: 85.48, sizeZ: 14.35, rows: 1, columns: 1, volume: 200 },
  container: { sizeX: 127.76, sizeY: 85.48, sizeZ: 40, rows: 1, columns: 1, volume: 2000 },
  plate: { sizeX: 127.76, sizeY: 85.48, sizeZ: 14.35, rows: 8, columns: 12, volume: 200 },
  well: { sizeX: 6.8, sizeY: 6.8, sizeZ: 10.5, rows: 1, columns: 1, volume: 200 },
  tip_rack: { sizeX: 127.76, sizeY: 85.48, sizeZ: 60, rows: 8, columns: 12, volume: 300 },
  carrier: { sizeX: 497, sizeY: 135, sizeZ: 13, rows: 1, columns: 4, volume: 200 },
  deck: { sizeX: 1360, sizeY: 653.5, sizeZ: 100, rows: 1, columns: 1, volume: 200 },
};

export function ResourceStudio() {
  const [resources, setResources] = useState<ResourceFactory[]>([]);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<ResourceKind>("plate");
  const [snippet, setSnippet] = useState("");
  const [jsonDefinition, setJsonDefinition] = useState<Record<string, unknown> | null>(null);
  const [name, setName] = useState("custom_plate");
  const [sizeX, setSizeX] = useState(KIND_DEFAULTS.plate.sizeX);
  const [sizeY, setSizeY] = useState(KIND_DEFAULTS.plate.sizeY);
  const [sizeZ, setSizeZ] = useState(KIND_DEFAULTS.plate.sizeZ);
  const [rows, setRows] = useState(KIND_DEFAULTS.plate.rows);
  const [columns, setColumns] = useState(KIND_DEFAULTS.plate.columns);
  const [volume, setVolume] = useState(KIND_DEFAULTS.plate.volume);
  const [selected, setSelected] = useState<ResourceFactory | null>(null);
  const [output, setOutput] = useState<"python" | "json">("python");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listResources()
      .then((value) => {
        setResources(value.resources);
        setSelected(value.resources[0] ?? null);
      })
      .catch((exc) => setError(exc instanceof Error ? exc.message : String(exc)))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const normalized = query.toLowerCase();
    return resources
      .filter((resource) => `${resource.name} ${resource.module} ${resource.signature}`.toLowerCase().includes(normalized))
      .slice(0, 160);
  }, [query, resources]);

  function chooseKind(nextKind: ResourceKind) {
    setKind(nextKind);
    const defaults = KIND_DEFAULTS[nextKind];
    setName(`custom_${nextKind}`);
    setSizeX(defaults.sizeX);
    setSizeY(defaults.sizeY);
    setSizeZ(defaults.sizeZ);
    setRows(defaults.rows);
    setColumns(defaults.columns);
    setVolume(defaults.volume);
  }

  async function generate() {
    setError(null);
    try {
      const response = await createCustomResource({
        kind,
        name,
        size_x: sizeX,
        size_y: sizeY,
        size_z: sizeZ,
        rows,
        columns,
        well_volume: volume,
      });
      setSnippet(response.python);
      setJsonDefinition(response.json_definition);
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : String(exc));
    }
  }

  const outputText = output === "python" ? snippet : JSON.stringify(jsonDefinition ?? {}, null, 2);

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <h1>Resources</h1>
          <p>Browse PLR factories and generate starter resource definitions.</p>
        </div>
      </header>

      <div className="resource-grid">
        <div className="panel catalog-panel">
          <div className="section-heading">
            <h2>Catalog</h2>
            <span>{loading ? "Loading" : `${filtered.length} shown`}</span>
          </div>
          <label className="search">
            <Search size={18} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, module, or signature" />
          </label>
          <div className="catalog-list">
            {filtered.map((resource) => (
              <button
                className={selected === resource ? "catalog-item active" : "catalog-item"}
                key={`${resource.module}.${resource.name}`}
                onClick={() => setSelected(resource)}
                type="button"
              >
                <strong>{resource.name}</strong>
                <code>{resource.signature}</code>
                <span>{resource.module}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="section-heading">
            <h2>Factory Details</h2>
            <span>{selected?.name ?? "None selected"}</span>
          </div>
          {selected ? (
            <div className="detail-stack">
              <strong>{selected.name}</strong>
              <code>{selected.signature}</code>
              <span>{selected.module}</span>
              <p>{selected.doc ?? "No docstring summary available."}</p>
            </div>
          ) : (
            <div className="empty-inline">Select a catalog resource.</div>
          )}
        </div>

        <form
          className="panel creator-panel"
          onSubmit={(event) => {
            event.preventDefault();
            generate();
          }}
        >
          <div className="section-heading">
            <h2>Create</h2>
            <span>{kind.replace("_", " ")}</span>
          </div>
          <label>
            Kind
            <select value={kind} onChange={(event) => chooseKind(event.target.value as ResourceKind)}>
              <option value="box">Box</option>
              <option value="container">Container</option>
              <option value="plate">Plate</option>
              <option value="well">Well</option>
              <option value="tip_rack">Tip rack</option>
              <option value="carrier">Carrier</option>
              <option value="deck">Deck</option>
            </select>
          </label>
          <label>
            Name
            <input value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <div className="field-grid">
            <NumberField label="Size X" value={sizeX} onChange={setSizeX} />
            <NumberField label="Size Y" value={sizeY} onChange={setSizeY} />
            <NumberField label="Size Z" value={sizeZ} onChange={setSizeZ} />
            <NumberField label={kind === "carrier" ? "Sites" : "Columns"} value={columns} onChange={setColumns} step={1} />
            <NumberField label="Rows" value={rows} onChange={setRows} step={1} disabled={kind === "carrier" || kind === "deck"} />
            <NumberField label="Volume uL" value={volume} onChange={setVolume} disabled={kind === "box" || kind === "carrier" || kind === "deck"} />
          </div>
          <div className="button-row">
            <button className="primary" type="submit">
              <Copy size={18} />
              Generate
            </button>
            <button
              type="button"
              onClick={() => outputText && navigator.clipboard?.writeText(outputText)}
              disabled={!outputText || outputText === "{}"}
            >
              <Clipboard size={18} />
              Copy
            </button>
          </div>
          {error && <p className="error">{error}</p>}
        </form>

        <div className="panel output-panel">
          <div className="section-heading">
            <h2>Output</h2>
            <div className="segmented">
              <button className={output === "python" ? "active" : ""} onClick={() => setOutput("python")} type="button">
                Python
              </button>
              <button className={output === "json" ? "active" : ""} onClick={() => setOutput("json")} type="button">
                JSON
              </button>
            </div>
          </div>
          <pre className="snippet">{outputText === "{}" ? "Generate a resource to see code here." : outputText}</pre>
        </div>
      </div>
    </section>
  );
}

function NumberField({
  label,
  value,
  onChange,
  step = 0.01,
  disabled = false,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: number;
  disabled?: boolean;
}) {
  return (
    <label>
      {label}
      <input
        disabled={disabled}
        min={0}
        onChange={(event) => onChange(Number(event.target.value))}
        step={step}
        type="number"
        value={value}
      />
    </label>
  );
}
