import { windowControls } from "../lib/window";
import { Icon } from "./ui";
import { useApp } from "../lib/store";
import { useState } from "react";
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
  const { devOffline, update } = useApp();
  const [updating, setUpdating] = useState<string | null>(null);
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
      {update && (
        <button
          disabled={updating === "busy"}
          onClick={async () => {
            if (!update.download) return openUrl(update.url);
            setUpdating("busy");
            try {
              await extrasApi.applyUpdate(update.download);
            } catch (e) {
              setUpdating(String(e));
            }
          }}
          className="mr-2 flex h-7 items-center gap-2 bg-ink px-3 text-xs font-semibold text-[#111] hover:bg-white disabled:bg-raised disabled:text-muted"
          title={updating && updating !== "busy" ? updating : `Baixa e instala a ${update.version} e abre o launcher de novo`}
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M7 1h2v8l3-3 1.4 1.4L8 12.8 2.6 7.4 4 6l3 3z" /><path d="M2 14h12v2H2z" /></svg>
          {updating === "busy" ? "Atualizando…" : updating ? "Falhou, tentar de novo" : `Atualizar para ${update.version.replace(/-.*$/, "")}`}
        </button>
      )}
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
