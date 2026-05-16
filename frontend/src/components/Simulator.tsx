import { ChevronLeft, ChevronRight, Pause, Play, Upload } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { GuiTrace, TraceEvent } from "../types";
import { Deck2D } from "./sim/Deck2D";
import { Deck3D } from "./sim/Deck3D";

export function Simulator({
  trace,
  onTraceLoaded,
}: {
  trace: GuiTrace | null;
  onTraceLoaded: (trace: GuiTrace) => void;
}) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const events = trace?.events ?? [];
  const currentEvent = events[index];
  const resources = useMemo(() => trace?.deck?.resources ?? {}, [trace]);

  useEffect(() => {
    setIndex(0);
    setPlaying(false);
  }, [trace]);

  useEffect(() => {
    if (!playing || events.length === 0) return;
    const timer = window.setInterval(() => {
      setIndex((previous) => {
        if (previous >= events.length - 1) {
          setPlaying(false);
          return previous;
        }
        return previous + 1;
      });
    }, Math.max(60, 500 / speed));
    return () => window.clearInterval(timer);
  }, [events.length, playing, speed]);

  async function loadFile(file: File) {
    setError(null);
    try {
      const nextTrace = JSON.parse(await file.text()) as GuiTrace;
      if (!Array.isArray(nextTrace.events)) {
        throw new Error("Trace JSON must include an events array.");
      }
      onTraceLoaded(nextTrace);
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : String(exc));
    }
  }

  function move(delta: number) {
    setPlaying(false);
    setIndex((previous) => clamp(previous + delta, 0, Math.max(0, events.length - 1)));
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <h1>Simulator</h1>
          <p>Replay compact chatterbox traces in 2D and 3D without rerunning a protocol.</p>
        </div>
        <label className="file-button">
          <Upload size={18} />
          Load Trace JSON
          <input
            type="file"
            accept="application/json,.json"
            onChange={(event) => event.target.files?.[0] && loadFile(event.target.files[0])}
          />
        </label>
      </header>

      {!trace ? (
        <div className="empty-state">
          <strong>No trace loaded</strong>
          <span>Load a chatterbox trace JSON file or choose Trace from a saved run.</span>
          {error && <p className="error">{error}</p>}
        </div>
      ) : (
        <>
          <div className="metric-strip">
            <Metric label="Schema" value={trace.schema_version ?? "unknown"} />
            <Metric label="PLR" value={trace.plr_version ?? "unknown"} />
            <Metric label="Events" value={String(events.length)} />
            <Metric label="Resources" value={String(Object.keys(resources).length)} />
          </div>

          <div className="timeline panel">
            <button onClick={() => move(-1)} title="Previous event" type="button">
              <ChevronLeft size={18} />
            </button>
            <button
              className="primary"
              onClick={() => setPlaying((value) => !value)}
              disabled={events.length === 0}
              title={playing ? "Pause" : "Play"}
              type="button"
            >
              {playing ? <Pause size={18} /> : <Play size={18} />}
              {playing ? "Pause" : "Play"}
            </button>
            <button onClick={() => move(1)} title="Next event" type="button">
              <ChevronRight size={18} />
            </button>
            <input
              aria-label="Trace timeline"
              type="range"
              min={0}
              max={Math.max(0, events.length - 1)}
              value={index}
              onChange={(event) => {
                setPlaying(false);
                setIndex(Number(event.target.value));
              }}
            />
            <span className="timeline-count">
              {events.length === 0 ? 0 : index + 1} / {events.length}
            </span>
            <select value={speed} onChange={(event) => setSpeed(Number(event.target.value))}>
              <option value={0.5}>0.5x</option>
              <option value={1}>1x</option>
              <option value={2}>2x</option>
              <option value={4}>4x</option>
            </select>
          </div>

          <div className="sim-grid">
            <div className="panel sim-panel">
              <div className="section-heading">
                <h2>2D Deck</h2>
                <span>{eventTitle(currentEvent)}</span>
              </div>
              <Deck2D resources={resources} event={currentEvent} />
            </div>
            <div className="panel sim-panel">
              <div className="section-heading">
                <h2>3D Deck</h2>
                <span>Orbit and zoom</span>
              </div>
              <Deck3D geometry={trace.geometry} resources={resources} event={currentEvent} />
            </div>
          </div>

          <div className="sim-detail-grid">
            <div className="panel event-list-panel">
              <div className="section-heading">
                <h2>Events</h2>
                <span>{events.length} total</span>
              </div>
              <div className="event-list">
                {events.map((event, eventIndex) => (
                  <button
                    className={eventIndex === index ? "event-row active" : "event-row"}
                    key={eventIndex}
                    onClick={() => {
                      setPlaying(false);
                      setIndex(eventIndex);
                    }}
                    type="button"
                  >
                    <span>{eventIndex + 1}</span>
                    <strong>{eventTitle(event)}</strong>
                    <small>{event.phase ?? event.head ?? event.channel ?? ""}</small>
                  </button>
                ))}
              </div>
            </div>
            <div className="panel">
              <div className="section-heading">
                <h2>Current Event</h2>
                <span>{eventTitle(currentEvent)}</span>
              </div>
              <pre className="snippet">{currentEvent ? JSON.stringify(currentEvent, null, 2) : "No events in this trace."}</pre>
            </div>
          </div>
          {error && <p className="error">{error}</p>}
        </>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function eventTitle(event?: TraceEvent): string {
  if (!event) return "No event";
  return String(event.instruction ?? event.action ?? event.event ?? "event");
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
