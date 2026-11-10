import { lazy, Suspense, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useApp } from "../lib/store";
import { useAccountSkin } from "../components/Skins";
import { NewInstanceModal } from "../components/NewInstanceModal";
import { InstanceList } from "./InstanceList";

const Panorama = lazy(() => import("../components/Panorama").then((m) => ({ default: m.Panorama })));
const KEY = "rog.panorama";

function ago(sec: number | null) {
  if (!sec) return "Ainda não jogada";
  const m = Math.floor((Date.now() / 1000 - sec) / 60);
  if (m < 60) return m < 1 ? "Jogada agora" : `Jogada há ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `Jogada há ${h} h`;
  const d = Math.floor(h / 24);
  return `Jogada há ${d} ${d === 1 ? "dia" : "dias"}`;
}

/** Aba Vanilla experimental: cena panorâmica + barra de jogar. */
export function VanillaHome() {
  const { instances, play, games, installs } = useApp();
  const navigate = useNavigate();
  const acc = useAccountSkin();
  const [pano, setPano] = useState(() => localStorage.getItem(KEY) !== "off");
  const [creating, setCreating] = useState(false);
  const list = (instances ?? []).filter((i) => i.kind === "vanilla").sort((a, b) => (b.lastPlayedAt ?? b.createdAt) - (a.lastPlayedAt ?? a.createdAt));
  const [picked, setPicked] = useState<string | null>(null);
  if (instances === null) return null;
  if (list.length === 0) return <InstanceList filter="vanilla" />;
  const inst = list.find((i) => i.id === picked) ?? list[0];
  const running = games[inst.id]?.state === "running";
  const p = installs[inst.id];
  const downloading = p && ["java", "version", "libraries", "assets", "loader"].includes(p.stage);
  const pct = p && p.filesTotal ? Math.round((p.filesDone / p.filesTotal) * 100) : 0;

  const toggle = () => {
    setPano((v) => {
      localStorage.setItem(KEY, v ? "off" : "on");
      return !v;
    });
  };

  return (
    <div className="relative h-full overflow-hidden bg-[radial-gradient(ellipse_at_50%_45%,#23232a_0%,#111114_55%,#060607_100%)]">
      {pano && (
        <Suspense fallback={null}>
          <Panorama skin={acc?.url ?? null} variant={acc?.variant ?? "classic"} paused={running} />
        </Suspense>
      )}
      {!pano && (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="m-0 text-[13px] text-faint">Modo panorâmico desligado</p>
        </div>
      )}

      {/* Topo */}
      <div className="pointer-events-none absolute top-0 right-0 left-0 flex items-center gap-2 p-5">
        <Link to="/vanilla/lista" className="pointer-events-auto bg-black/40 px-3 py-2 text-xs font-medium text-[#d0d0d0] no-underline hover:bg-black/60 hover:text-ink">
          Todas as versões ({list.length})
        </Link>
        <span className="flex-1" />
        <button onClick={toggle} className="pointer-events-auto flex items-center gap-2.5 bg-black/40 px-3 py-2 text-xs font-medium text-[#d0d0d0] hover:bg-black/60">
          Modo panorâmico
          <span className={`flex h-[18px] w-[34px] items-center p-0.5 ${pano ? "justify-end bg-ink" : "justify-start bg-[#3a3a3a]"}`}>
            <span className={`h-[14px] w-[14px] ${pano ? "bg-[#111]" : "bg-[#9a9a9a]"}`} />
          </span>
        </button>
      </div>

      {/* Barra de jogar */}
      <div className="absolute right-0 bottom-0 left-0 flex items-center gap-2.5 bg-gradient-to-t from-black/75 to-transparent px-7 pt-14 pb-6">
        <div className="min-w-0 flex-1">
          <p className="m-0 truncate text-[22px] font-semibold text-ink">{inst.name}</p>
          <p className="m-0 text-xs text-muted">{running ? "Em jogo" : ago(inst.lastPlayedAt)}</p>
        </div>
        <select
          value={inst.id}
          onChange={(e) => (e.target.value === "__new" ? setCreating(true) : setPicked(e.target.value))}
          className="h-12 min-w-[200px] cursor-pointer border-0 bg-[#1a1a1d]/90 px-4 text-[13px] font-medium text-[#e0e0e0] outline-none hover:bg-[#232327]"
        >
          {list.map((i) => (
            <option key={i.id} value={i.id}>{i.mcVersion}{i.name !== `Vanilla ${i.mcVersion}` ? ` · ${i.name}` : ""}</option>
          ))}
          <option value="__new">+ Nova versão…</option>
        </select>
        {downloading ? (
          <div className="flex h-12 w-[200px] flex-col justify-center gap-1.5 bg-[#1a1a1d]/90 px-4">
            <span className="text-xs font-medium text-ink">Baixando · {pct}%</span>
            <div className="h-1 bg-[#2a2a2a]"><div className="h-full bg-ink" style={{ width: `${pct}%` }} /></div>
          </div>
        ) : (
          <button
            disabled={running}
            onClick={() => play(inst.id)}
            className="flex h-12 items-center gap-2.5 bg-ink px-11 text-[15px] font-semibold text-[#111] hover:bg-white disabled:bg-[#2a2a2a] disabled:text-[#8a8a8a]"
          >
            <svg width="11" height="11" viewBox="0 0 12 12"><path d="M2 1 L11 6 L2 11 Z" fill="currentColor" /></svg>
            {running ? "Em jogo" : "Jogar"}
          </button>
        )}
        <button
          aria-label="Configurações da instância"
          onClick={() => navigate(`/vanilla/${inst.id}/config`)}
          className="flex h-12 w-12 items-center justify-center bg-[#1a1a1d]/90 text-[#bdbdbd] hover:bg-[#232327] hover:text-ink"
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M10 2h4l.6 3 2 .9 2.6-1.7 2.8 2.8-1.7 2.6.9 2 3 .6v4l-3 .6-.9 2 1.7 2.6-2.8 2.8-2.6-1.7-2 .9-.6 3h-4l-.6-3-2-.9-2.6 1.7-2.8-2.8 1.7-2.6-.9-2-3-.6v-4l3-.6.9-2-1.7-2.6 2.8-2.8 2.6 1.7 2-.9zm2 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" /></svg>
        </button>
      </div>

      {creating && <NewInstanceModal onClose={() => setCreating(false)} />}
    </div>
  );
}
