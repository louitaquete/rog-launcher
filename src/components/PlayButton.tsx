import { useApp } from "../lib/store";

const ACTIVE = ["java", "version", "libraries", "assets", "loader"];
export const isDownloading = (stage?: string) => !!stage && ACTIVE.includes(stage);

/** Jogar com os quatro estados: Padrão, Baixando (enche por dentro), Abrindo e Em jogo. */
export function PlayButton({ id, size = "lg", className = "", onPlay }: { id: string; size?: "lg" | "sm"; className?: string; onPlay?: () => void }) {
  const { installs, games, play } = useApp();
  const p = installs[id];
  const running = games[id]?.state === "running";
  const downloading = isDownloading(p?.stage);
  const opening = p?.stage === "done" && !running && games[id] === undefined && Date.now() - (opened.get(id) ?? 0) < 20000;
  const pct = p && p.filesTotal ? Math.round((p.filesDone / p.filesTotal) * 100) : 0;
  const box = `${size === "lg" ? "h-12 min-w-[184px] px-6 text-base" : "h-10 min-w-[136px] px-4 text-sm"} relative flex shrink-0 items-center justify-center gap-2.5 overflow-hidden rounded-[6px] font-semibold ${className}`;

  if (running)
    return (
      <div className={`${box} bg-playing/15 text-sm font-medium text-playing`}>
        <span className="h-2 w-2 animate-[rog-breathe_2s_ease-in-out_infinite] rounded-full bg-playing" /> Em jogo
      </div>
    );
  if (downloading)
    return (
      <div className={`${box} bg-active text-sm font-medium text-ink`} title={p!.current}>
        <span className="absolute inset-y-0 left-0 bg-ink/15 transition-[width] duration-300" style={{ width: `${pct}%` }} />
        <span className="absolute bottom-0 left-0 h-[3px] bg-ink transition-[width] duration-300" style={{ width: `${pct}%` }} />
        <span className="relative">{p!.stage === "loader" ? "Instalando loader" : "Baixando"} · {pct}%</span>
      </div>
    );
  if (opening)
    return (
      <div className={`${box} bg-active text-sm font-medium text-soft`}>
        <span className="flex gap-1">{[0, 1, 2].map((i) => <span key={i} className="h-[5px] w-[5px] animate-pulse rounded-[2px] bg-ink" style={{ animationDelay: `${i * 160}ms` }} />)}</span>
        Abrindo…
      </div>
    );
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        opened.set(id, Date.now());
        play(id);
        onPlay?.();
      }}
      className={`${box} bg-ink text-[#111112] hover:bg-white`}
    >
      <svg width="12" height="12" viewBox="0 0 12 12"><path d="M3 1.8 L10 6 L3 10.2 Z" fill="currentColor" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /></svg>
      Jogar
    </button>
  );
}
const opened = new Map<string, number>();
