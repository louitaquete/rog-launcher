import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { importApi, type Instance } from "../lib/api";
import { useApp } from "../lib/store";
import { fmtCount, modpackFile, searchModpacks, type Hit } from "../lib/modrinth";
import { InstanceCover } from "../components/InstanceCover";
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

  const sorted = [...(instances ?? [])].sort((a, b) => (b.lastPlayedAt ?? b.createdAt) - (a.lastPlayedAt ?? a.createdAt));
  const last = sorted[0];
  const rest = sorted.slice(1, 7);
  const go = (i: Instance) => {
    play(i.id);
    navigate(route(i));
  };

  return (
    <div className="flex h-full flex-col gap-8 overflow-y-auto px-10 py-8">
      <div className="flex items-center">
        <h1 className="m-0 flex-1 text-[22px] font-semibold">Início</h1>
        <div ref={menuRef} className="relative">
          <button onClick={() => setMenu((m) => !m)} className="px-3 py-1.5 text-xs text-muted hover:bg-raised hover:text-ink">
            Personalizar
          </button>
          {menu && (
            <div className="absolute right-0 top-full z-20 mt-1 w-[200px] bg-[#1c1c1c] py-1.5 shadow-[0_12px_30px_rgba(0,0,0,0.5)]">
              {([["recent", "Continuar jogando"], ["discover", "Descobrir"]] as const).map(([k, t]) => (
                <label key={k} className="flex cursor-pointer items-center gap-2.5 px-3.5 py-2 text-[13px] text-ink hover:bg-raised">
                  <input type="checkbox" checked={sections[k]} onChange={() => toggle(k)} className="accent-white" />
                  {t}
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      {last && (
        <section className="group relative h-[230px] shrink-0 cursor-pointer overflow-hidden bg-[#151515]" onClick={() => navigate(route(last))}>
          <InstanceCover instance={last} mode="hero" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#0f0f0f] via-[#0f0f0f]/70 to-transparent" />
          <div className="relative flex h-full flex-col justify-end gap-1 p-8">
            <p className="m-0 text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Continuar de onde parou</p>
            <h2 className="m-0 text-[28px] font-semibold text-ink">{last.name}</h2>
            <p className="m-0 text-xs text-muted">
              {label(last)} · {ago(last.lastPlayedAt)}
              {last.playTimeSecs > 0 && ` · ${hours(last.playTimeSecs)} jogadas`}
            </p>
            <div className="pt-4">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  go(last);
                }}
                className="inline-flex h-11 items-center gap-2.5 bg-ink px-7 text-sm font-semibold text-[#111] hover:bg-white"
              >
                <Play /> Jogar
              </button>
            </div>
          </div>
        </section>
      )}

      {sections.recent && rest.length > 0 && (
        <section className="flex flex-col gap-3">
          <h3 className="m-0 text-[13px] font-semibold text-ink">Continuar jogando</h3>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2">
            {rest.map((i) => (
              <div key={i.id} onClick={() => navigate(route(i))} className="group flex cursor-pointer items-center gap-3 bg-surface p-2 pr-2.5 hover:bg-raised">
                <div className="relative h-10 w-10 shrink-0 overflow-hidden bg-[#1c1c1c]">
                  <InstanceCover instance={i} mode="card" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="m-0 truncate text-[13px] font-medium text-ink">{i.name}</p>
                  <p className="m-0 truncate text-[11px] text-faint">{label(i)}</p>
                </div>
                <button
                  aria-label={`Jogar ${i.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    go(i);
                  }}
                  className="flex h-8 w-8 shrink-0 items-center justify-center text-muted hover:bg-ink hover:text-[#111] group-hover:text-ink"
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
        <h3 className="m-0 flex-1 text-[13px] font-semibold text-ink">Descobrir</h3>
        <span className="text-[11px] text-faint">Modpacks do Modrinth</span>
      </div>
      {error && <p className="m-0 text-xs text-[#e5484d]">{error}</p>}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
        {(hits ?? Array.from({ length: 4 }, () => null)).map((h, n) =>
          h ? (
            <div key={h.project_id} className="group flex flex-col bg-surface">
              <div className="relative aspect-[16/9] overflow-hidden bg-[#1c1c1c]">
                {(h.featured_gallery || h.icon_url) && (
                  <img src={h.featured_gallery || h.icon_url!} alt="" className="h-full w-full object-cover brightness-[.85] transition-[transform,filter] duration-200 group-hover:scale-105 group-hover:brightness-100" />
                )}
              </div>
              <div className="flex items-center gap-2 p-3">
                <div className="min-w-0 flex-1">
                  <p className="m-0 truncate text-[13px] font-medium text-ink">{h.title}</p>
                  <p className="m-0 text-[11px] text-faint">↓ {fmtCount(h.downloads)}</p>
                </div>
                <button
                  disabled={busy !== null}
                  onClick={() => install(h)}
                  className="h-8 shrink-0 bg-active px-3 text-xs font-semibold text-[#d0d0d0] hover:bg-ink hover:text-[#111] disabled:opacity-50"
                >
                  {busy === h.project_id ? "Instalando…" : "Instalar"}
                </button>
              </div>
            </div>
          ) : (
            <div key={n} className="aspect-[16/12] animate-pulse bg-surface" />
          ),
        )}
      </div>
    </section>
  );
}
