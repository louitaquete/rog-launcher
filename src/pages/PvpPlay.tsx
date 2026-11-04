import { useState } from "react";
import { api, type Instance, type LoaderType } from "../lib/api";
import { useApp } from "../lib/store";

/** Bases de PVP: versão principal, subversões e uma frase. */
const BASES = [
  { base: "1.8", subs: ["1.8.9", "1.8.8"], desc: 'A 1.8, de 2014, é a casa do PvP clássico: sem cooldown de ataque, combos rápidos e o famoso "block hit". É a versão preferida dos servidores competitivos até hoje.' },
  { base: "1.9", subs: ["1.9.4"], desc: "A Combat Update trouxe o cooldown de ataque, o escudo e a segunda mão. Mudou o PvP para sempre." },
  { base: "1.12", subs: ["1.12.2"], desc: "World of Color: a versão estável que muitos servidores e modpacks usaram por anos." },
  { base: "1.16", subs: ["1.16.5"], desc: "Nether Update: netherite, novos biomas e o começo da era Sodium para mais FPS." },
  { base: "1.17", subs: ["1.17.1"], desc: "Caves & Cliffs parte 1: cobre, ametista e cabras. Primeira versão com Java 16+." },
  { base: "1.18", subs: ["1.18.2"], desc: "Caves & Cliffs parte 2: mundo mais alto e cavernas gigantes. Base de muitos servidores modernos." },
  { base: "1.20", subs: ["1.20.6", "1.20.4", "1.20.1"], desc: "Trails & Tales: arqueologia, cerejeiras e acabamentos de armadura." },
  { base: "1.21", subs: ["1.21.4", "1.21.1"], desc: "Tricky Trials: a maça, as câmaras de desafio e o combate mais recente do jogo." },
];

const baseOf = (mc: string) => BASES.find((b) => b.subs.includes(mc) || mc.startsWith(b.base + "."))?.base ?? "1.8";
const fabricAllowed = (base: string) => Number(base.split(".")[1]) >= 16;

/** Arte provisória da versão: degradê + silhueta de blocos + "VERSÃO X". Troque por imagens reais em `src/assets/pvp/`. */
function VersionArt({ base, big, dim }: { base: string; big?: boolean; dim?: boolean }) {
  const seed = Number(base.split(".")[1]) || 8;
  const blocks = Array.from({ length: big ? 26 : 14 }, (_, i) => 22 + ((seed * (i + 3) * 37) % 45));
  return (
    <div className="relative h-full w-full overflow-hidden bg-gradient-to-br from-[#2a2a2a] to-[#121212]">
      <div className="absolute inset-x-0 bottom-0 flex h-full items-end opacity-[0.07]">
        {blocks.map((h, i) => (
          <div key={i} className="flex-1 bg-white" style={{ height: `${h}%` }} />
        ))}
      </div>
      <div className="absolute inset-0 flex items-center justify-center">
        <span
          className={`font-black italic tracking-[-0.01em] text-white drop-shadow-[0_4px_16px_rgba(0,0,0,0.6)] ${big ? "text-7xl" : "text-[40px]"}`}
          style={{ fontFamily: "Poppins" }}
        >
          VERSÃO {base}
        </span>
      </div>
      {dim && <div className="absolute inset-0 bg-[#080808]/55 transition-opacity group-hover:opacity-40" />}
    </div>
  );
}

const label = "font-brand text-[11px] font-bold tracking-[0.14em]";

export function PvpPlay({ instance }: { instance: Instance }) {
  const { play, installs, games, launchErrors, cancelInstall, refresh } = useApp();
  const [inst, setInst] = useState(instance);
  const savedBase = baseOf(instance.mcVersion);
  const [base, setBase] = useState(savedBase);
  const current = BASES.find((b) => b.base === base)!;
  const sub = current.subs.includes(inst.mcVersion) ? inst.mcVersion : current.subs[0];
  const module: LoaderType = inst.loader.type === "Fabric" && fabricAllowed(base) ? "Fabric" : "OptiFine";

  const p = installs[instance.id];
  const downloading = p && ["java", "version", "libraries", "assets", "loader"].includes(p.stage);
  const inGame = games[instance.id]?.state === "running";
  const err = (p?.stage === "error" && p.error) || launchErrors[instance.id];

  /** Grava na instância PVP (versão + módulo). A pasta do loader é refeita no próximo Jogar. */
  async function save(mc: string, mod: LoaderType) {
    const loaderType: LoaderType = mod === "Fabric" && fabricAllowed(baseOf(mc)) ? "Fabric" : "OptiFine";
    const next: Instance = { ...inst, mcVersion: mc, loader: { type: loaderType, version: null }, launchVersion: null };
    setInst(next);
    await api.updateInstance(next);
    await refresh();
  }

  return (
    <div className="flex h-full gap-10 px-10 py-8">
      {/* Esquerda: versões */}
      <div className="flex min-w-0 flex-[1.1] flex-col gap-4">
        <p className={`${label} m-0 text-[#9a9a9a]`}>SELECIONE UMA VERSÃO PARA DEFINIR COMO PADRÃO</p>
        <div className="grid grid-cols-2 gap-3.5 overflow-y-auto pr-1">
          {BASES.map((b) => {
            const sel = b.base === base;
            return (
              <button
                key={b.base}
                onClick={() => {
                  setBase(b.base);
                  save(b.subs[0], module);
                }}
                className={`group relative aspect-[400/190] overflow-hidden text-left ${sel ? "outline-2 -outline-offset-2 outline-ink" : ""}`}
              >
                <VersionArt base={b.base} dim={!sel} />
                {sel && <span className={`${label} absolute top-3 left-3 bg-ink px-2 py-0.5 text-[9px] text-[#111]`}>PADRÃO</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Direita: opções de inicialização */}
      <div className="flex min-w-0 flex-1 flex-col gap-5">
        <h2 className="m-0 text-center text-[30px] font-black italic tracking-[0.01em]" style={{ fontFamily: "Poppins" }}>
          OPÇÕES DE INICIALIZAÇÃO
        </h2>
        <div className="aspect-video w-full border border-edge">
          <VersionArt base={base} big />
        </div>
        <p className="m-0 text-sm leading-relaxed text-soft">{current.desc}</p>

        <div className="flex-1" />

        {/* Jogar + subversão */}
        {downloading ? (
          <div className="flex flex-col gap-2 border border-edge bg-[#1a1a1a] px-4 py-3">
            <div className="flex text-[13px] font-semibold">
              <span className="flex-1">{p!.stage === "loader" ? "Instalando o loader" : "Baixando arquivos do jogo"}</span>
              {p!.filesTotal > 0 && <span>{p!.filesDone.toLocaleString("pt-BR")} / {p!.filesTotal.toLocaleString("pt-BR")}</span>}
            </div>
            <div className="h-1.5 bg-[#2a2a2a]">
              <div className="h-full bg-ink transition-[width]" style={{ width: `${p!.filesTotal ? (p!.filesDone / p!.filesTotal) * 100 : 0}%` }} />
            </div>
            <button onClick={() => cancelInstall(instance.id)} className="self-start text-xs text-muted hover:text-ink">Cancelar</button>
          </div>
        ) : (
          <div className="flex h-[60px]">
            <button
              disabled={inGame}
              onClick={() => play(instance.id)}
              className="flex flex-1 items-center justify-center gap-3 bg-ink text-[#111] transition-colors hover:bg-white disabled:bg-raised disabled:text-[#9a9a9a]"
            >
              {inGame ? <span className="h-2 w-2 animate-pulse bg-[#9a9a9a]" /> : <svg width="16" height="16" viewBox="0 0 12 12"><path d="M2 1 L11 6 L2 11 Z" fill="currentColor" /></svg>}
              <span className="font-brand text-xl font-black tracking-[0.08em]">{inGame ? "EM JOGO" : "JOGAR"}</span>
            </button>
            <label className="relative flex w-28 items-center bg-[#d6d6d6] text-[#111]">
              <select
                value={sub}
                disabled={inGame || current.subs.length < 2}
                onChange={(e) => save(e.target.value, module)}
                className="h-full w-full cursor-pointer appearance-none bg-transparent pr-7 pl-5 font-brand text-base font-bold outline-none disabled:cursor-default"
              >
                {current.subs.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              {current.subs.length > 1 && (
                <svg className="pointer-events-none absolute right-3" width="12" height="12" viewBox="0 0 12 12"><path d="M2 4 L6 8 L10 4" stroke="#111" strokeWidth="1.6" fill="none" /></svg>
              )}
            </label>
          </div>
        )}

        {err && <p className="m-0 border-l-2 border-ink bg-[#1a1a1a] px-3 py-2 text-xs break-all text-[#9a9a9a]">{String(err).replace("NEEDS_ACCOUNT: ", "")}</p>}

        {/* Módulos */}
        <div className="flex items-center gap-3">
          <span className={`${label} text-soft`}>MÓDULOS:</span>
          {([
            { id: "OptiFine", mark: "OF", ok: true },
            { id: "Fabric", mark: "FB", ok: fabricAllowed(base) },
          ] as const).map((m) => {
            const on = module === m.id;
            return (
              <button
                key={m.id}
                title={m.ok ? m.id : "Fabric + Sodium a partir da 1.16"}
                disabled={!m.ok || inGame}
                onClick={() => save(sub, m.id)}
                className={`relative flex h-11 w-11 items-center justify-center border font-brand text-[13px] font-black ${on ? "border-ink bg-ink text-[#111]" : "border-edge bg-raised text-[#9a9a9a]"} disabled:opacity-35`}
              >
                {m.mark}
                {on && (
                  <svg className="absolute -right-1 -bottom-1" width="16" height="16" viewBox="0 0 16 16"><rect width="16" height="16" fill="#111" /><path d="M4 8 L7 11 L12 5" stroke="#EDEDED" strokeWidth="1.8" fill="none" /></svg>
                )}
              </button>
            );
          })}
          <span className="text-xs text-[#6a6a6a]">
            {module === "OptiFine" ? "OptiFine: coloque o arquivo na pasta mods (sem download automático)" : "Fabric ativo"} · Fabric a partir da 1.16
          </span>
        </div>
      </div>
    </div>
  );
}
