import { useState } from "react";
import { PlayButton } from "../components/PlayButton";
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

/** Banners: coloque `src/assets/pvp/<versão>.webp|jpg|png` (ex.: 1.21.webp), 16:9. */
const ART = Object.fromEntries(
  Object.entries(import.meta.glob("../assets/pvp/*.{webp,jpg,jpeg,png}", { eager: true, import: "default" })).map(([k, v]) => [
    k.split("/").pop()!.replace(/\.(webp|jpe?g|png)$/, ""),
    v as string,
  ]),
);

const baseOf = (mc: string) => BASES.find((b) => b.subs.includes(mc) || mc.startsWith(b.base + "."))?.base ?? "1.8";
const fabricAllowed = (base: string) => Number(base.split(".")[1]) >= 16;

export function PvpPlay({ instance }: { instance: Instance }) {
  const { installs, games, launchErrors, cancelInstall, refresh, setLoginOpen, account } = useApp();
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

  const row = "flex items-center gap-3";
  const lab = "w-[92px] shrink-0 text-xs font-medium text-muted";
  const sel = "h-10 min-w-0 flex-1 cursor-pointer border-0 bg-active px-3 text-sm font-medium text-ink outline-none disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div className="relative h-full min-h-[440px] overflow-hidden">
      {/* Fundo: a arte da versão escolhida, ocupando a aba inteira */}
      {ART[base] && <img key={base} src={ART[base]} alt="" className="absolute inset-0 h-full w-full animate-[rog-fade_300ms_ease-out] object-cover" />}
      <div className="absolute inset-0 bg-gradient-to-r from-bg/95 via-bg/55 to-bg/30" />
      <div className="absolute inset-0 bg-gradient-to-t from-bg via-transparent to-bg/40" />

      <div className="relative flex h-full items-end gap-8 px-10 py-8">
        {/* Esquerda: a versão em destaque e a troca rápida */}
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <p className="m-0 text-xs font-medium tracking-[0.06em] text-soft uppercase">Versão de combate</p>
          <h2 className="m-0 font-brand text-[56px] leading-none font-bold text-ink">{base}</h2>
          <p className="m-0 max-w-[520px] text-sm leading-[22px] text-soft">{current.desc}</p>
          <div className="flex flex-wrap gap-2 pt-3">
            {BASES.map((b) => {
              const on = b.base === base;
              return (
                <button
                  key={b.base}
                  disabled={inGame}
                  onClick={() => {
                    setBase(b.base);
                    save(b.subs[0], module);
                  }}
                  className={`group relative h-12 w-[84px] overflow-hidden border-[1.5px] disabled:cursor-not-allowed ${on ? "border-ink" : "border-transparent hover:border-muted"}`}
                >
                  {ART[b.base] && <img src={ART[b.base]} alt="" className={`absolute inset-0 h-full w-full object-cover transition-[filter] duration-200 ${on ? "" : "brightness-50 grayscale-[0.6] group-hover:brightness-75 group-hover:grayscale-0"}`} />}
                  <span className="absolute inset-0 flex items-center justify-center bg-black/25 text-sm font-semibold text-ink">{b.base}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Direita: cartão compacto de opções */}
        <div className="flex w-[340px] shrink-0 flex-col gap-3.5 rounded-[14px] bg-surface/90 p-5 shadow-[0_16px_40px_rgba(0,0,0,0.45)] backdrop-blur-md">
          <p className="m-0 pb-0.5 text-base font-semibold text-ink">Opções de jogo</p>
          <div className={row}>
            <span className={lab}>Versão</span>
            <select
              value={sub}
              disabled={inGame}
              onChange={(e) => {
                setBase(baseOf(e.target.value));
                save(e.target.value, module);
              }}
              className={sel}
            >
              {BASES.map((b) => (
                <optgroup key={b.base} label={b.base}>
                  {b.subs.map((v) => <option key={v} value={v}>{v}</option>)}
                </optgroup>
              ))}
            </select>
          </div>
          <div className={row}>
            <span className={lab}>Módulo</span>
            <div className="flex min-w-0 flex-1 gap-0.5 rounded-[6px] bg-active p-1">
              {([
                { id: "OptiFine", ok: true },
                { id: "Fabric", ok: fabricAllowed(base) },
              ] as const).map((m) => (
                <button
                  key={m.id}
                  title={m.ok ? undefined : "Disponível a partir da 1.16"}
                  disabled={!m.ok || inGame}
                  onClick={() => save(sub, m.id)}
                  className={`h-8 flex-1 !rounded-[4px] text-sm font-medium disabled:cursor-not-allowed disabled:opacity-35 ${module === m.id ? "bg-ink text-[#111112]" : "text-soft hover:text-ink"}`}
                >
                  {m.id}
                </button>
              ))}
            </div>
          </div>
          <div className={row}>
            <span className={lab}>Conta</span>
            {account ? (
              <span className="flex h-10 min-w-0 flex-1 items-center truncate rounded-[6px] bg-active px-3 text-sm font-medium text-ink">{account.name}</span>
            ) : (
              <button onClick={() => setLoginOpen(true)} className="h-10 flex-1 bg-active px-3 text-left text-sm font-medium text-soft hover:text-ink">Entrar →</button>
            )}
          </div>

          <PlayButton id={instance.id} className="mt-1.5 w-full" />
          {downloading && <button onClick={() => cancelInstall(instance.id)} className="self-center p-0 text-xs text-muted hover:text-ink">Cancelar download</button>}

          {err && (
            <div className="flex items-center gap-3 rounded-[6px] bg-danger/10 px-3 py-2">
              <p className="m-0 flex-1 text-xs break-words text-soft">{String(err).replace(/^(NEEDS_ACCOUNT|NO_GAME): /, "")}</p>
              {String(err).includes("NEEDS_ACCOUNT") && (
                <button onClick={() => setLoginOpen(true)} className="bg-ink px-3 py-1.5 text-xs font-semibold text-[#111112] hover:bg-white">Entrar</button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
