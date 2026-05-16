import { Copy, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createCustomResource, listResources } from "../api";
import type { ResourceFactory } from "../types";

export function ResourceStudio() {
  const [resources, setResources] = useState<ResourceFactory[]>([]);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("box");
  const [snippet, setSnippet] = useState("");
  const [name, setName] = useState("custom_resource");

  useEffect(() => {
    listResources().then((value) => setResources(value.resources));
  }, []);

  const filtered = useMemo(() => {
    const normalized = query.toLowerCase();
    return resources.filter((resource) => `${resource.name} ${resource.module}`.toLowerCase().includes(normalized)).slice(0, 120);
  }, [query, resources]);

  async function generate() {
    const response = await createCustomResource({
      kind,
      name,
      size_x: 127.76,
      size_y: 85.48,
      size_z: 14.35,
      rows: 8,
      columns: 12,
      well_volume: 200,
    });
    setSnippet(response.python);
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <h1>Resources</h1>
          <p>Browse PLR factories and create starter custom resource definitions.</p>
        </div>
      </header>

      <div className="resource-grid">
        <div className="panel">
          <h2>Catalog</h2>
          <label className="search">
            <Search size={18} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search resources" />
          </label>
          <div className="catalog-list">
            {filtered.map((resource) => (
              <div className="catalog-item" key={`${resource.module}.${resource.name}`}>
                <strong>{resource.name}</strong>
                <code>{resource.signature}</code>
                <span>{resource.module}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <h2>Create</h2>
          <label>
            Name
            <input value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label>
            Kind
            <select value={kind} onChange={(event) => setKind(event.target.value)}>
              <option value="box">Box</option>
              <option value="container">Container</option>
              <option value="plate">Plate</option>
            </select>
          </label>
          <button className="primary" onClick={generate}>
            <Copy size={18} />
            Generate Python
          </button>
          <pre className="snippet">{snippet || "Generated resource code appears here."}</pre>
        </div>
      </div>
    </section>
  );
}

