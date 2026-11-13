import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { importApi, type Instance } from "../lib/api";
import { useApp } from "../lib/store";
import { fmtCount, modpackFile, searchModpacks, type Hit } from "../lib/modrinth";
import { InstanceCover } from "../components/InstanceCover";
import { PlayButton } from "../components/PlayButton";
import { useCover } from "../lib/tint";
import { Chip } from "../components/ui";
import { NewInstanceModal } from "../components/NewInstanceModal";
import { ImportModal } from "../components/ImportModal";
import { InstanceList } from "./InstanceList";
import { useDismiss } from "../lib/useDismiss";

type Sections = { recent: boolean; discover: boolean };
const KEY = "rog.home";
const loadSections = (): Sections => {
  try {
    return { recent: true, discover: true, ...JSON.parse(localStorage.getItem(KEY) || "{}") };
  } catch {
    return { recent: true, discover: true };
  }
};

const Play = ({ size = 10 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 12 12"><path d="M2 1 L11 6 L2 11 Z" fill="currentColor" /></svg>
);

function ago(ts: number | null) {
  if (!ts) return "Ainda não jogada";
  const m = Math.floor((Date.now() / 1000 - ts) / 60);
  if (m < 1) return "Jogada agora";
  if (m < 60) return `Jogada há ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `Jogada há ${h} h`;
  const d = Math.floor(h / 24);
  return `Jogada há ${d} ${d === 1 ? "dia" : "dias"}`;
}
const hours = (s: number) => (s < 3600 ? `${Math.round(s / 60)} min` : `${(s / 3600).toFixed(1).replace(".", ",")} h`);
const route = (i: Instance) => (i.kind === "pvp" ? "/pvp/jogar" : `/${i.kind}/${i.id}/conteudo`);
const label = (i: Instance) => (i.loader.type === "Vanilla" ? i.mcVersion : `${i.loader.type} ${i.mcVersion}`);

export function Home() {
  const { instances, play } = useApp();
  const navigate = useNavigate();
  const [sections, setSections] = useState(loadSections);
  const [menu, setMenu] = useState(false);
  const closeMenu = useCallback(() => setMenu(false), []);
  const menuRef = useDismiss<HTMLDivElement>(menu, closeMenu);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);

  const toggle = (k: keyof Sections) =>
    setSections((s) => {
      const n = { ...s, [k]: !s[k] };
      localStorage.setItem(KEY, JSON.stringify(n));
      return n;
    });

  const firstRun = instances !== null && !instances.some((i) => i.kind !== "pvp");
  if (firstRun) return <InstanceList filter="all" />;

  const sorted = [...(instances ?? [])].sort((a, b) => (b.lastPlayedAt ?? 0) - (a.lastPlayedAt ?? 0) || b.createdAt - a.createdAt);
  const last = sorted[0];
  const rest = sorted.slice(1, 7);
  const go = (i: Instance) => {
    play(i.id);
    navigate(route(i));
  };

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto px-10 py-7">
      <div className="flex items-center">
        <h1 className="m-0 flex-1 text-xl font-semibold">Início</h1>
        <div ref={menuRef} className="relative">
          <button onClick={() => setMenu((m) => !m)} className="px-3 py-1.5 text-xs text-muted hover:bg-raised hover:text-ink">
            Personalizar
          </button>
          {menu && (
            <div className="absolute top-full right-0 z-20 mt-1 w-[210px] overflow-hidden rounded-[10px] bg-active py-1.5 shadow-[0_12px_30px_rgba(0,0,0,0.5)]">
              {([["recent", "Continuar jogando"], ["discover", "Descobrir"]] as const).map(([k, t]) => (
                <label key={k} className="flex cursor-pointer items-center gap-2.5 px-3.5 py-2 text-sm text-ink hover:bg-raised">
                  <input type="checkbox" checked={sections[k]} onChange={() => toggle(k)} className="accent-white" />
                  {t}
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      {last && <Hero inst={last} onOpen={() => navigate(route(last))} />}

      {sections.recent && rest.length > 0 && (
        <section className="flex flex-col gap-3">
          <h3 className="m-0 text-base font-semibold text-ink">Continuar jogando</h3>
          <div className="rog-cascade grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
            {rest.map((i) => (
              <div key={i.id} onClick={() => navigate(route(i))} className="group flex cursor-pointer items-center gap-3 rounded-[10px] bg-surface p-2 pr-2.5 hover:bg-raised">
                <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-[6px] bg-raised">
                  <InstanceCover instance={i} mode="mini" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="m-0 truncate text-sm font-medium text-ink">{i.name}</p>
                  <p className="m-0 truncate text-xs text-muted">{label(i)}</p>
                </div>
                <button
                  aria-label={`Jogar ${i.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    go(i);
                  }}
                  className="flex h-[34px] w-[34px] shrink-0 items-center justify-center bg-active text-ink hover:bg-ink hover:text-[#111112]"
                >
                  <Play />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {sections.discover && <Discover onInstalled={(i) => navigate(route(i))} />}

      {creating && <NewInstanceModal onClose={() => setCreating(false)} defaultKind="vanilla" />}
      {importing && <ImportModal onClose={() => setImporting(false)} />}
    </div>
  );
}

function Hero({ inst, onOpen }: { inst: Instance; onOpen: () => void }) {
  const { tint } = useCover(inst);
  return (
    <section className="group relative h-[250px] shrink-0 cursor-pointer overflow-hidden rounded-[14px] bg-raised" onClick={onOpen}>
      <InstanceCover instance={inst} mode="hero" />
      <div className="absolute inset-0" style={{ backgroundImage: `linear-gradient(to right, rgb(11 11 12 / 0.96), rgb(${tint} / 0.28) 55%, rgb(${tint} / 0.05))` }} />
      <div className="absolute inset-0 bg-gradient-to-r from-[#0b0b0c]/80 via-transparent to-transparent" />
      <div className="relative flex h-full flex-col justify-end gap-1.5 p-8">
        <p className="m-0 text-xs font-medium tracking-[0.06em] text-soft uppercase">Continuar de onde parou</p>
        <h2 className="m-0 text-[28px] leading-9 font-semibold text-ink">{inst.name}</h2>
        <div className="flex items-center gap-2 pb-3">
          <Chip>{inst.mcVersion}</Chip>
          {inst.loader.type !== "Vanilla" && <Chip>{inst.loader.type}</Chip>}
          <span className="text-xs text-soft">{ago(inst.lastPlayedAt)}{inst.playTimeSecs > 0 && ` · ${hours(inst.playTimeSecs)} jogadas`}</span>
        </div>
        <PlayButton id={inst.id} className="self-start" onPlay={onOpen} />
      </div>
    </section>
  );
}

function Discover({ onInstalled }: { onInstalled: (i: Instance) => void }) {
  const { refresh } = useApp();
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    searchModpacks("", 0)
      .then((r) => setHits(r.hits.slice(0, 8)))
      .catch(() => setHits([]));
  }, []);

  async function install(h: Hit) {
    setBusy(h.project_id);
    setError(null);
    try {
      const inst = await importApi.url(await modpackFile(h.project_id), h.featured_gallery || h.icon_url);
      await refresh();
      onInstalled(inst);
    } catch (e) {
      setError(String(e).replace(/^Error: /, ""));
    } finally {
      setBusy(null);
    }
  }

  if (hits && hits.length === 0) return null;
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline">
        <h3 className="m-0 text-base font-semibold text-ink">Descobrir</h3>
        <span className="flex-1 pl-2.5 text-xs text-muted">Modpacks em alta no Modrinth</span>
        <Link to="/mods/explorar" className="text-xs font-medium text-ink no-underline hover:underline">Ver todos →</Link>
      </div>
      {error && <p className="m-0 text-xs text-danger">{error}</p>}
      <div className="rog-cascade grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
        {(hits ?? Array.from({ length: 4 }, () => null)).map((h, n) =>
          h ? (
            <div key={h.project_id} className="group flex flex-col overflow-hidden rounded-[10px] bg-surface">
              <div className="relative aspect-[16/9] overflow-hidden bg-raised">
                {(h.featured_gallery || h.icon_url) && (
                  <img src={h.featured_gallery || h.icon_url!} alt="" className="h-full w-full object-cover brightness-[.85] transition-[transform,filter] duration-200 group-hover:scale-105 group-hover:brightness-100" />
                )}
              </div>
              <div className="flex items-center gap-2 p-3">
                <div className="min-w-0 flex-1">
                  <p className="m-0 truncate text-sm font-medium text-ink">{h.title}</p>
                  <p className="m-0 text-xs text-muted">↓ {fmtCount(h.downloads)}</p>
                </div>
                <button
                  disabled={busy !== null}
                  onClick={() => install(h)}
                  className="h-8 shrink-0 bg-active px-3 text-sm font-medium text-ink hover:bg-ink hover:text-[#111112] disabled:opacity-50"
                >
                  {busy === h.project_id ? "Instalando…" : "Instalar"}
                </button>
              </div>
            </div>
          ) : (
            <div key={n} className="aspect-[16/12] animate-pulse rounded-[10px] bg-surface" />
          ),
        )}
      </div>
    </section>
  );
}
