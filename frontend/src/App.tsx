import { Box, FileJson, FlaskConical, History, Play } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getHealth } from "./api";
import { ResourceStudio } from "./components/ResourceStudio";
import { RunLauncher } from "./components/RunLauncher";
import { Simulator } from "./components/Simulator";
import type { GuiTrace } from "./types";

type Tab = "runs" | "simulator" | "resources";

export function App() {
  const [tab, setTab] = useState<Tab>("runs");
  const [trace, setTrace] = useState<GuiTrace | null>(null);
  const [health, setHealth] = useState<string>("Connecting");

  useEffect(() => {
    getHealth()
      .then((value) => setHealth(`Backend ${value.version} · PLR ${value.pylabrobot_version ?? "not installed"}`))
      .catch(() => setHealth("Backend offline"));
  }, []);

  const tabs = useMemo(
    () => [
      { id: "runs" as const, label: "Runs", icon: Play },
      { id: "simulator" as const, label: "Simulator", icon: Box },
      { id: "resources" as const, label: "Resources", icon: FlaskConical },
    ],
    [],
  );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <FileJson size={22} />
          <div>
            <strong>PLR GUI</strong>
            <span>{health}</span>
          </div>
        </div>
        <nav>
          {tabs.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.id} className={tab === item.id ? "active" : ""} onClick={() => setTab(item.id)}>
                <Icon size={18} />
                {item.label}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-foot">
          <History size={16} />
          Developer install v1
        </div>
      </aside>
      <main>
        {tab === "runs" && <RunLauncher onTraceLoaded={(nextTrace) => { setTrace(nextTrace); setTab("simulator"); }} />}
        {tab === "simulator" && <Simulator trace={trace} onTraceLoaded={setTrace} />}
        {tab === "resources" && <ResourceStudio />}
      </main>
    </div>
  );
}

