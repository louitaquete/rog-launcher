import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { useApp } from "../lib/store";
import { Button, Modal } from "./ui";

function useElapsed(startedAt?: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!startedAt) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [startedAt]);
  if (!startedAt) return "";
  const s = Math.max(0, Math.floor(now / 1000 - startedAt));
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((n) => String(n).padStart(2, "0")).join(":");
}

const termIcon = (
  <svg width="14" height="14" viewBox="0 0 14 14"><rect x=".7" y="1.7" width="12.6" height="10.6" stroke="currentColor" strokeWidth="1.3" fill="none" /><path d="M3 5 L5.5 7 L3 9 M7 9.5 H11" stroke="currentColor" strokeWidth="1.3" fill="none" /></svg>
);
const powerIcon = (
  <svg width="14" height="14" viewBox="0 0 14 14"><path d="M7 1.5 V6.5" stroke="currentColor" strokeWidth="1.6" /><path d="M4 3.5 A4.8 4.8 0 1 0 10 3.5" stroke="currentColor" strokeWidth="1.6" fill="none" /></svg>
);

/** Indicador + Console + Kill game, na barra de cima da instância enquanto o jogo roda. */
export function GameBar({ id, consoleOpen, onToggleConsole }: { id: string; consoleOpen: boolean; onToggleConsole: () => void }) {
  const { games, kill, settings, updateSettings } = useApp();
  const game = games[id];
  const elapsed = useElapsed(game?.state === "running" ? game.startedAt : undefined);
  const [confirm, setConfirm] = useState(false);
  const [dontAsk, setDontAsk] = useState(true);
  if (game?.state !== "running") return null;

  const onKill = () => (settings?.general.killWarningDismissed ? kill(id) : setConfirm(true));

  return (
    <>
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-2 bg-raised px-2.5 py-1 text-xs font-medium text-[#d0d0d0]">
          <span className="h-[7px] w-[7px] animate-pulse bg-ink" />
          Em execução · {elapsed}
        </span>
        <button onClick={onToggleConsole} className={`flex items-center gap-2 border border-edge px-3 py-1.5 text-[13px] font-medium text-[#d0d0d0] hover:bg-raised ${consoleOpen ? "bg-[#2a2a2a]" : ""}`}>
          {termIcon} Console
        </button>
        <button onClick={onKill} className="flex items-center gap-2 border border-[#7a2a2a] px-3 py-1.5 text-[13px] font-medium text-[#e5484d] hover:border-[#e5484d] hover:bg-[#e5484d] hover:text-[#111]">
          {powerIcon} Kill game
        </button>
      </div>
      {confirm && (
        <Modal
          title="Forçar o fechamento do jogo?"
          onClose={() => setConfirm(false)}
          width={500}
          footer={
            <>
              <span className="flex-1" />
              <Button variant="ghost" onClick={() => setConfirm(false)}>Cancelar</Button>
              <Button
                variant="primary"
                onClick={() => {
                  if (dontAsk) updateSettings((s) => ({ ...s, general: { ...s.general, killWarningDismissed: true } }));
                  setConfirm(false);
                  kill(id);
                }}
              >
                {powerIcon} Forçar fechamento
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-4">
            <p className="m-0 text-[13px] leading-relaxed text-[#9a9a9a]">
              O Minecraft será encerrado na hora, como puxar da tomada. Tudo o que não foi salvo — progresso no mundo, inventário, configurações alteradas — pode ser perdido, e o mundo pode até corromper.
            </p>
            <p className="m-0 border-l-2 border-[#4a4a4a] bg-[#1a1a1a] px-3 py-2.5 text-xs text-[#8a8a8a]">
              Dica: se o jogo ainda responde, prefira sair pelo menu "Salvar e sair".
            </p>
            <label className="flex items-center gap-2.5 text-[13px] text-[#d0d0d0]">
              <input type="checkbox" checked={dontAsk} onChange={(e) => setDontAsk(e.target.checked)} className="accent-[#ededed]" />
              Não mostrar este aviso de novo
            </label>
          </div>
        </Modal>
      )}
    </>
  );
}

/** Painel de console na parte de baixo da página da instância. */
export function ConsolePanel({ id, onClose, full }: { id: string; onClose?: () => void; full?: boolean }) {
  const { logs } = useApp();
  const lines = logs[id] ?? [];
  const [filter, setFilter] = useState<"all" | "warn" | "error">("all");
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    box.current?.scrollTo({ top: box.current.scrollHeight });
  }, [lines.length]);

  const level = (l: string) => (/\b(ERROR|FATAL|Exception)\b/.test(l) ? "error" : /\bWARN\b/.test(l) ? "warn" : "info");
  const shown = lines.filter((l) => filter === "all" || level(l) === filter || (filter === "warn" && level(l) === "error"));

  return (
    <div className={full ? "flex h-full min-h-0 flex-col bg-[#0a0a0a]" : "flex h-[38%] min-h-[220px] shrink-0 flex-col border-t border-[#2a2a2a] bg-[#0a0a0a]"}>
      <div className="flex shrink-0 items-center gap-2 bg-bar py-1.5 pr-3 pl-5">
        <span className="flex-1 text-[11px] font-medium tracking-[0.08em] text-[#9a9a9a]">{full ? "LOG DO JOGO" : "CONSOLE"}</span>
        {(["all", "warn", "error"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`px-2.5 py-1 text-[11px] font-medium ${filter === f ? "bg-[#2a2a2a] text-ink" : "bg-[#171717] text-muted"}`}>
            {f === "all" ? "Tudo" : f === "warn" ? "Avisos" : "Erros"}
          </button>
        ))}
        <Button variant="ghost" className="py-1" onClick={() => navigator.clipboard.writeText(lines.join("\n"))}>Copiar</Button>
        <Button variant="ghost" className="py-1" onClick={() => api.openFolder(id)}>Abrir pasta</Button>
        {onClose && <button aria-label="Fechar console" onClick={onClose} className="p-1 text-muted hover:text-ink">
          <svg width="12" height="12" viewBox="0 0 12 12"><path d="M1.5 1.5l9 9M10.5 1.5l-9 9" stroke="currentColor" strokeWidth="1.3" /></svg>
        </button>}
      </div>
      <div ref={box} className="flex-1 overflow-auto px-5 py-3 font-mono text-xs leading-5 select-text">
        {shown.map((l, i) => {
          const lv = level(l);
          return (
            <div key={i} className={`whitespace-pre-wrap ${lv === "error" ? "font-semibold text-ink" : lv === "warn" ? "text-[#d0d0d0]" : "text-[#8a8a8a]"}`}>
              {l}
            </div>
          );
        })}
        {shown.length === 0 && <div className="text-faint">{full ? "O log aparece aqui quando você abrir o jogo." : "Sem mensagens ainda."}</div>}
      </div>
    </div>
  );
}
