import { windowControls } from "../lib/window";
import { Icon } from "./ui";
import { useApp } from "../lib/store";
import { useCallback, useEffect, useState } from "react";
import { useDismiss } from "../lib/useDismiss";
import { api, extrasApi, openUrl } from "../lib/api";

function WinButton({ label, onClick, children, danger }: { label: string; onClick: () => void; children: React.ReactNode; danger?: boolean }) {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      className={`flex h-10 w-[46px] items-center justify-center text-[#9a9a9a] transition-colors ${danger ? "hover:bg-ink hover:text-[#111]" : "hover:bg-raised hover:text-ink"}`}
    >
      {children}
    </button>
  );
}

export function TitleBar() {
  const { devOffline } = useApp();
  return (
    <header
      data-tauri-drag-region
      className="relative z-20 flex h-10 shrink-0 items-center gap-2.5 border-b border-line bg-bar pl-3.5 shadow-[0_2px_10px_rgba(0,0,0,0.45)]"
    >
      <Icon name="logo" size={30} className="pointer-events-none" />
      <span data-tauri-drag-region className="font-brand text-sm font-bold tracking-[0.04em] text-soft">
        Rog Launcher
      </span>
      {devOffline && <span className="border border-edge px-1.5 py-px font-brand text-[9px] tracking-[0.14em] text-muted">DEV · OFFLINE</span>}
      <div data-tauri-drag-region className="flex-1 self-stretch" />
      <Inbox />
      <WinButton label="Minimizar" onClick={windowControls.minimize}>
        <svg width="12" height="12" viewBox="0 0 12 12"><path d="M1 6h10" stroke="currentColor" strokeWidth="1.2" /></svg>
      </WinButton>
      <WinButton label="Maximizar" onClick={windowControls.toggleMaximize}>
        <svg width="12" height="12" viewBox="0 0 12 12"><rect x="1.5" y="1.5" width="9" height="9" stroke="currentColor" strokeWidth="1.2" fill="none" /></svg>
      </WinButton>
      <WinButton label="Fechar" onClick={windowControls.close} danger>
        <svg width="12" height="12" viewBox="0 0 12 12"><path d="M1.5 1.5l9 9M10.5 1.5l-9 9" stroke="currentColor" strokeWidth="1.2" /></svg>
      </WinButton>
    </header>
  );
}

type Note = { version: string; name: string; date: string; body: string; url: string; newer: boolean };
const base = (v: string) => v.replace(/^v/, "").replace(/-.*$/, "");

/** Patch notes em texto simples: linhas "- " viram itens. */
function NoteBody({ body }: { body: string }) {
  const lines = body
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.startsWith("- ") || l.startsWith("* "))
    .map((l) => l.slice(2).replace(/\*\*|`/g, ""))
    .slice(0, 8);
  if (!lines.length) return null;
  return (
    <ul className="m-0 mt-2 flex list-none flex-col gap-1 p-0">
      {lines.map((l, i) => (
        <li key={i} className="flex gap-2 text-xs leading-relaxed text-[#bdbdbd]">
          <span className="mt-[7px] h-1 w-1 shrink-0 bg-[#6a6a6a]" />
          {l}
        </li>
      ))}
    </ul>
  );
}

/** Caixa de novidades: bandeja com contador; abre os patch notes e o botão de atualizar. */
function Inbox() {
  const { update } = useApp();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<"idle" | "busy" | string>("idle");
  const [notes, setNotes] = useState<Note[]>([]);
  const [current, setCurrent] = useState("");
  const [seen, setSeen] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("rog.notesSeen") ?? "[]");
    } catch {
      return [];
    }
  });
  const ref = useDismiss<HTMLDivElement>(open, useCallback(() => setOpen(false), []));
  useEffect(() => {
    api.appVersion().then(setCurrent);
    extrasApi.releaseNotes().then(setNotes).catch(() => setNotes([]));
  }, []);

  // Não lidas: versões novas e a nota da versão instalada (o "o que mudou" depois de atualizar).
  const unread = notes.filter((n) => !seen.includes(n.version) && (n.newer || base(n.version) === base(current))).length;
  const version = update ? base(update.version) : null;

  function toggle() {
    setOpen((o) => !o);
    if (!open && notes.length) {
      const all = Array.from(new Set([...seen, ...notes.map((n) => n.version)]));
      setSeen(all);
      try {
        localStorage.setItem("rog.notesSeen", JSON.stringify(all));
      } catch {
        /* sem armazenamento: o contador volta na próxima abertura */
      }
    }
  }

  async function apply() {
    if (!update) return;
    if (!update.download) return openUrl(update.url);
    setState("busy");
    try {
      await extrasApi.applyUpdate(update.download);
    } catch (e) {
      setState(String(e).replace(/^Error: /, ""));
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        aria-label={unread ? `Novidades: ${unread} não lida${unread > 1 ? "s" : ""}` : "Novidades"}
        title="Novidades"
        onClick={toggle}
        className={`relative flex h-10 w-[46px] items-center justify-center transition-colors ${open ? "bg-raised text-ink" : "text-[#9a9a9a] hover:bg-raised hover:text-ink"}`}
      >
        <svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
          <path d="M1.5 9.5v4h13v-4" />
          <path d="M1.5 9.5l2-6.5h9l2 6.5h-4l-1 2h-3l-1-2z" />
        </svg>
        {unread > 0 && (
          <span className="absolute bottom-1 left-1.5 flex h-[14px] min-w-[14px] items-center justify-center bg-[#e5484d] px-1 text-[10px] leading-none font-bold text-white shadow-[0_0_0_2px_#121212]">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute top-full right-0 z-40 mt-1 flex max-h-[70vh] w-[360px] flex-col bg-[#1c1c1c] shadow-[0_12px_32px_rgba(0,0,0,0.65)]">
          <div className="flex items-center gap-3 border-b border-line px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="m-0 text-sm font-semibold">{update ? `Rog Launcher ${version}` : "Rog Launcher"}</p>
              <p className="m-0 text-xs text-muted">{update ? "Atualização disponível" : `Versão ${base(current) || "…"} · mais recente`}</p>
            </div>
            {update ? (
              <button disabled={state === "busy"} onClick={apply} className="shrink-0 bg-ink px-4 py-2 text-xs font-semibold text-[#111] hover:bg-white disabled:opacity-50">
                {state === "busy" ? "Baixando…" : state === "idle" ? "Atualizar" : "Tentar de novo"}
              </button>
            ) : (
              <span title="Você está na versão mais recente" className="flex h-8 w-8 shrink-0 items-center justify-center bg-[#242424] text-ink">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 8.5l3.2 3L13 4.5" /></svg>
              </span>
            )}
          </div>
          {state !== "idle" && state !== "busy" && <p className="m-0 border-b border-line px-4 py-2 text-xs text-[#e5484d]">Não deu para atualizar: {state}</p>}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {notes.length === 0 && <p className="m-0 px-4 py-6 text-center text-xs text-muted">Sem notas de versão por enquanto.</p>}
            {notes.map((n) => {
              const isCurrent = base(n.version) === base(current);
              return (
                <div key={n.version} className="border-b border-line px-4 py-3 last:border-b-0">
                  <div className="flex items-center gap-2">
                    <p className="m-0 text-[13px] font-semibold">{base(n.version)}</p>
                    {n.newer && <span className="bg-ink px-1.5 py-px text-[10px] font-bold text-[#111]">NOVA</span>}
                    {isCurrent && <span className="bg-[#2a2a2a] px-1.5 py-px text-[10px] font-semibold text-soft">INSTALADA</span>}
                    <span className="flex-1" />
                    <span className="text-[11px] text-muted">{n.date ? new Date(n.date).toLocaleDateString("pt-BR") : ""}</span>
                  </div>
                  <NoteBody body={n.body} />
                  <button onClick={() => openUrl(n.url)} className="mt-2 p-0 text-[11px] text-muted hover:text-ink">
                    Ver no GitHub ↗
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
