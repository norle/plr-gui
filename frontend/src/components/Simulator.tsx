import { Upload } from "lucide-react";
import { useMemo, useState } from "react";
import type { GuiTrace } from "../types";
import { Deck2D } from "./sim/Deck2D";
import { Deck3D } from "./sim/Deck3D";

export function Simulator({ trace, onTraceLoaded }: { trace: GuiTrace | null; onTraceLoaded: (trace: GuiTrace) => void }) {
  const [index, setIndex] = useState(0);
  const events = trace?.events ?? [];
  const currentEvent = events[index];
  const resources = useMemo(() => trace?.deck?.resources ?? {}, [trace]);

  async function loadFile(file: File) {
    const nextTrace = JSON.parse(await file.text()) as GuiTrace;
    onTraceLoaded(nextTrace);
    setIndex(0);
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <h1>Simulator</h1>
          <p>Replay compact chatterbox traces in 2D and 3D.</p>
        </div>
        <label className="file-button">
          <Upload size={18} />
          Load Trace JSON
          <input type="file" accept="application/json,.json" onChange={(event) => event.target.files?.[0] && loadFile(event.target.files[0])} />
        </label>
      </header>

      {!trace ? (
        <div className="empty-state">Load a chatterbox trace JSON file or select a run trace.</div>
      ) : (
        <>
          <div className="timeline">
            <input type="range" min={0} max={Math.max(0, events.length - 1)} value={index} onChange={(event) => setIndex(Number(event.target.value))} />
            <span>{index + 1} / {events.length}</span>
            <code>{currentEvent?.instruction || currentEvent?.action || currentEvent?.event}</code>
          </div>
          <div className="sim-grid">
            <div className="panel sim-panel">
              <h2>2D Deck</h2>
              <Deck2D resources={resources} event={currentEvent} />
            </div>
            <div className="panel sim-panel">
              <h2>3D Deck</h2>
              <Deck3D geometry={trace.geometry} event={currentEvent} />
            </div>
          </div>
        </>
      )}
    </section>
  );
}

