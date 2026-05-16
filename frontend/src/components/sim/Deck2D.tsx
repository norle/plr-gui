import type { CompactResource, TraceEvent } from "../../types";

export function Deck2D({ resources, event }: { resources: Record<string, CompactResource>; event?: TraceEvent }) {
  const entries = Object.entries(resources).filter(([, resource]) => resource.absolute_location && resource.size);
  const bounds = entries.reduce(
    (acc, [, resource]) => {
      const location = resource.absolute_location ?? [0, 0, 0];
      const size = resource.size ?? [1, 1, 1];
      return {
        maxX: Math.max(acc.maxX, location[0] + size[0]),
        maxY: Math.max(acc.maxY, location[1] + size[1]),
      };
    },
    { maxX: 1000, maxY: 650 },
  );
  const target = targetPoint(event);

  return (
    <svg className="deck2d" viewBox={`0 0 ${bounds.maxX} ${bounds.maxY}`}>
      <rect x="0" y="0" width={bounds.maxX} height={bounds.maxY} className="deck-base" />
      {entries.map(([name, resource]) => {
        const location = resource.absolute_location ?? [0, 0, 0];
        const size = resource.size;
        return (
          <g key={name}>
            <rect
              x={location[0]}
              y={bounds.maxY - location[1] - size[1]}
              width={Math.max(1, size[0])}
              height={Math.max(1, size[1])}
              className={`resource ${resource.category ?? ""}`}
            />
            {size[0] > 20 && size[1] > 12 && (
              <text x={location[0] + 4} y={bounds.maxY - location[1] - size[1] + 13}>
                {name}
              </text>
            )}
          </g>
        );
      })}
      {target && (
        <g>
          <line x1={target.x - 14} y1={bounds.maxY - target.y} x2={target.x + 14} y2={bounds.maxY - target.y} className="target-line" />
          <line x1={target.x} y1={bounds.maxY - target.y - 14} x2={target.x} y2={bounds.maxY - target.y + 14} className="target-line" />
          <circle cx={target.x} cy={bounds.maxY - target.y} r="7" className="target-dot" />
        </g>
      )}
    </svg>
  );
}

function targetPoint(event?: TraceEvent): { x: number; y: number } | null {
  const target = event?.target;
  if (Array.isArray(target)) return { x: target[0], y: target[1] };
  if (target && typeof target === "object" && typeof target.x === "number" && typeof target.y === "number") {
    return { x: target.x, y: target.y };
  }
  const channel = event?.channels?.[0];
  if (channel?.target) return { x: channel.target[0], y: channel.target[1] };
  return null;
}

