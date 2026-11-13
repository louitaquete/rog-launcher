import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Instance } from "../lib/api";
import { useApp } from "../lib/store";
import { isDownloading } from "./PlayButton";

const pathOf = (i: Instance, tab: string) => (i.kind === "pvp" ? `/pvp/${tab === "conteudo" ? "jogar" : tab}` : `/${i.kind}/${i.id}/${tab}`);

function since(sec: number | null) {
  if (!sec) return "ainda não jogada";
  const m = Math.floor((Date.now() / 1000 - sec) / 60);
  if (m < 60) return m < 1 ? "jogada agora" : `jogada há ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `jogada há ${h} h`;
  const d = Math.floor(h / 24);
  return `jogada há ${d} ${d === 1 ? "dia" : "dias"}`;
}

/** Faixa fixa no rodapé: o que está acontecendo agora e a ação correspondente. */
export function Dock() {
  const { instances, installs, games, play, cancelInstall, kill } = useApp();
  const navigate = useNavigate();
  const [, tick] = useState(0);
  const [arming, setArming] = useState(false);
  const list = instances ?? [];
  const runningId = Object.values(games).find((g) => g.state === "running")?.instanceId;
  useEffect(() => {
    if (!runningId) return;
    const t = setInterval(() => tick((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, [runningId]);
  useEffect(() => {
    if (!arming) return;
    const t = setTimeout(() => setArming(false), 3000);
    return () => clearTimeout(t);
  }, [arming]);

  const bar = "flex h-11 shrink-0 items-center gap-3 border-t border-line bg-surface px-5 text-xs";
  const ghost = "px-3 py-1.5 text-xs font-medium text-soft hover:bg-raised hover:text-ink";
  const name = (i: Instance) => (
    <button onClick={() => navigate(pathOf(i, "conteudo"))} className="max-w-[280px] truncate p-0 text-xs font-medium text-ink hover:underline">{i.name}</button>
  );

  const dl = Object.values(installs).find((p) => isDownloading(p.stage));
  const dlInst = dl && list.find((i) => i.id === dl.instanceId);
  if (dl && dlInst) {
    const pct = dl.filesTotal ? Math.round((dl.filesDone / dl.filesTotal) * 100) : 0;
    return (
      <div className={bar}>
        <span className="text-muted">{dl.stage === "loader" ? "Instalando loader" : "Baixando"}</span>
        {name(dlInst)}
        <span className="h-1 w-60 overflow-hidden rounded-[2px] bg-active"><span className="block h-full bg-ink transition-[width] duration-300" style={{ width: `${pct}%` }} /></span>
        <span className="text-soft">{pct}%{dl.filesTotal ? ` · ${dl.filesDone} de ${dl.filesTotal} arquivos` : ""}</span>
        <span className="flex-1" />
        <button className={ghost} onClick={() => cancelInstall(dl.instanceId)}>Cancelar</button>
      </div>
    );
  }

  const run = runningId ? list.find((i) => i.id === runningId) : undefined;
  if (run) {
    const mins = Math.max(0, Math.floor((Date.now() - games[run.id].startedAt * (games[run.id].startedAt < 1e12 ? 1000 : 1)) / 60000));
    return (
      <div className={bar}>
        <span className="h-2 w-2 animate-[rog-breathe_2s_ease-in-out_infinite] rounded-full bg-playing" />
        <span className="font-medium text-playing">Em jogo</span>
        {name(run)}
        <span className="text-muted">· {mins < 1 ? "agora" : mins < 60 ? `há ${mins} min` : `há ${Math.floor(mins / 60)} h ${mins % 60} min`}</span>
        <span className="flex-1" />
        <button className={ghost} onClick={() => navigate(pathOf(run, "logs"))}>Ver logs</button>
        <button className={`px-3 py-1.5 text-xs font-medium ${arming ? "bg-danger text-[#111112]" : "text-danger hover:bg-danger/15"}`} onClick={() => (arming ? (kill(run.id), setArming(false)) : setArming(true))}>
          {arming ? "Clique de novo para encerrar" : "Encerrar"}
        </button>
      </div>
    );
  }

  const last = [...list].sort((a, b) => (b.lastPlayedAt ?? 0) - (a.lastPlayedAt ?? 0))[0];
  if (!last) return null;
  return (
    <div className={bar}>
      <span className="text-muted">Continuar</span>
      {name(last)}
      <span className="text-muted">· {since(last.lastPlayedAt)}</span>
      <span className="flex-1" />
      <button className="bg-active px-3 py-1.5 text-xs font-medium text-ink hover:bg-[#34343a]" onClick={() => { play(last.id); navigate(pathOf(last, "conteudo")); }}>Jogar</button>
    </div>
  );
}
