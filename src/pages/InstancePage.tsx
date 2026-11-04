import { useState } from "react";
import { NavLink, Navigate, useParams, Link } from "react-router-dom";
import { ConsolePanel, GameBar } from "../components/GameControls";
import { useApp } from "../lib/store";
import { Icon } from "../components/ui";
import type { IconName } from "../components/icons";
import { Placeholder } from "./Placeholder";
import { PlayTab } from "./PlayTab";
import { PvpPlay } from "./PvpPlay";

const allTabs: { slug: string; label: string; icon: IconName }[] = [
  { slug: "jogar", label: "Jogar", icon: "play" },
  { slug: "skins", label: "Skins", icon: "skins" },
  { slug: "mods", label: "Mods", icon: "mods" },
  { slug: "config", label: "Configurações", icon: "settings" },
];

// Página de instância: breadcrumb + abas estilo navegador. PVP não tem aba Mods.
export function InstancePage({ area }: { area: "vanilla" | "mods" | "pvp" }) {
  const { id = "pvp", tab = "jogar" } = useParams();
  const { instances, games } = useApp();
  const [consoleOpen, setConsoleOpen] = useState(false);
  if (instances === null) return null;
  const inst = instances.find((i) => i.id === id);
  if (!inst) return <Navigate to={area === "pvp" ? "/" : `/${area}`} replace />;

  const base = area === "pvp" ? "/pvp" : `/${area}/${id}`;
  const tabs = area === "pvp" ? allTabs.filter((t) => t.slug !== "mods") : allTabs;
  const current = tabs.find((t) => t.slug === tab) ?? tabs[0];

  return (
    <div className="flex h-full flex-col">
      {(area !== "pvp" || games[inst.id]?.state === "running") && (
        <div className="flex h-11 shrink-0 items-center gap-2.5 bg-[#101010] pr-3 pl-5 text-[13px] font-medium">
          {area !== "pvp" && (<>
          <Link to={`/${area}`} className="flex items-center gap-2.5 text-[#8a8a8a] no-underline hover:text-ink">
            <svg width="14" height="14" viewBox="0 0 14 14"><path d="M9 2 L4 7 L9 12" stroke="currentColor" strokeWidth="1.6" fill="none" /></svg>
            {area === "vanilla" ? "Vanilla" : "Mods"}
          </Link>
          <span className="text-[#4a4a4a]">/</span>
          <span className="text-ink">{inst.name}</span>
          </>)}
          <span className="flex-1" />
          <GameBar id={inst.id} consoleOpen={consoleOpen} onToggleConsole={() => setConsoleOpen((v) => !v)} />
        </div>
      )}
      <div className="flex shrink-0 border-b border-line bg-bar">
        {tabs.map((t) => (
          <NavLink
            key={t.slug}
            to={`${base}/${t.slug}`}
            className={({ isActive }) =>
              `group relative flex h-11 w-[180px] items-center gap-2.5 border-r border-line px-[18px] text-[13px] font-medium no-underline transition-colors ${
                isActive || (t.slug === current.slug && !tab) ? "bg-bg text-ink" : "text-[#7a7a7a] hover:bg-[#1a1a1a] hover:text-soft"
              }`
            }
          >
            {({ isActive }) => (
              <>
                {isActive && <span className="absolute top-0 left-0 h-0.5 w-full bg-[#e6e6e6]" />}
                <Icon name={t.icon} size={16} className={isActive ? "" : "opacity-45 group-hover:opacity-80"} />
                {t.label}
              </>
            )}
          </NavLink>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {current.slug === "jogar" ? (area === "pvp" ? <PvpPlay key={inst.id} instance={inst} /> : <PlayTab instance={inst} />) : <Placeholder title={`${inst.name} · ${current.label}`} />}
      </div>
      {consoleOpen && <ConsolePanel id={inst.id} onClose={() => setConsoleOpen(false)} />}
    </div>
  );
}
