import { windowControls } from "../lib/window";
import { Icon } from "./ui";
import { useApp } from "../lib/store";
import { useCallback, useState } from "react";
import { useDismiss } from "../lib/useDismiss";
import { extrasApi, openUrl } from "../lib/api";

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

/** Caixa de novidades: carta com um pontinho quando há atualização; abre um painel. */
function Inbox() {
  const { update } = useApp();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<"idle" | "busy" | string>("idle");
  const ref = useDismiss<HTMLDivElement>(open, useCallback(() => setOpen(false), []));
  const version = update?.version.replace(/-.*$/, "");

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
        aria-label={update ? "Novidades: atualização disponível" : "Novidades"}
        title={update ? `Rog Launcher ${version} disponível` : "Novidades"}
        onClick={() => setOpen((o) => !o)}
        className={`relative flex h-10 w-[46px] items-center justify-center transition-colors ${open ? "bg-raised text-ink" : "text-[#9a9a9a] hover:bg-raised hover:text-ink"}`}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
          <rect x="1.5" y="3.5" width="13" height="9" />
          <path d="M1.5 4l6.5 5 6.5-5" />
        </svg>
        {update && <span className="absolute top-2.5 right-3 h-2 w-2 bg-[#e5484d] shadow-[0_0_0_2px_#121212]" />}
      </button>
      {open && (
        <div className="absolute top-full right-0 z-40 mt-1 w-80 bg-[#1c1c1c] shadow-[0_12px_32px_rgba(0,0,0,0.65)]">
          <p className="m-0 border-b border-line px-4 py-3 text-[11px] font-semibold tracking-[0.12em] text-muted">NOVIDADES</p>
          {update ? (
            <div className="flex flex-col gap-3 p-4">
              <div className="flex items-start gap-3">
                <span className="mt-1 h-2 w-2 shrink-0 bg-[#e5484d]" />
                <div>
                  <p className="m-0 text-sm font-semibold">Atualização do Rog Launcher</p>
                  <p className="m-0 mt-0.5 text-xs text-muted">A versão {version} está disponível. O launcher fecha, instala e abre de novo sozinho.</p>
                </div>
              </div>
              {state !== "idle" && state !== "busy" && <p className="m-0 text-xs text-[#e5484d]">Não deu para atualizar: {state}</p>}
              <div className="flex items-center gap-2">
                <button onClick={() => openUrl(update.url)} className="px-2 py-2 text-xs text-muted hover:text-ink">
                  O que mudou
                </button>
                <span className="flex-1" />
                <button disabled={state === "busy"} onClick={apply} className="bg-ink px-4 py-2 text-xs font-semibold text-[#111] hover:bg-white disabled:opacity-50">
                  {state === "busy" ? "Baixando…" : state === "idle" ? `Atualizar para ${version}` : "Tentar de novo"}
                </button>
              </div>
            </div>
          ) : (
            <p className="m-0 px-4 py-5 text-center text-[13px] text-muted">Tudo em dia. Você está na versão mais recente.</p>
          )}
        </div>
      )}
    </div>
  );
}
