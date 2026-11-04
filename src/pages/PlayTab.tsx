import type { Instance, Progress, Stage } from "../lib/api";
import { useApp } from "../lib/store";
import { Button, Chip, Icon } from "../components/ui";
import type { IconName } from "../components/icons";

const STEPS: { stage: Stage; label: (i: Instance) => string }[] = [
  { stage: "java", label: () => "Java" },
  { stage: "version", label: (i) => `Minecraft ${i.mcVersion}` },
  { stage: "libraries", label: () => "Bibliotecas" },
  { stage: "assets", label: () => "Assets (sons e texturas)" },
];
const ORDER: Stage[] = ["java", "version", "libraries", "assets", "done"];
const RUNNING: Stage[] = ["java", "version", "libraries", "assets"];

const fmtSpeed = (b: number) => (b >= 1_000_000 ? `${(b / 1_000_000).toFixed(1).replace(".", ",")} MB/s` : `${Math.round(b / 1000)} KB/s`);
const watermark: Record<Instance["kind"], IconName> = { vanilla: "vanilla", mods: "mods", pvp: "pvp" };

function Bar({ value }: { value: number }) {
  return (
    <div className="h-1.5 w-full bg-[#2a2a2a]">
      <div className="h-full bg-ink transition-[width] duration-150" style={{ width: `${Math.min(100, value * 100)}%` }} />
    </div>
  );
}

function StepIcon({ state }: { state: "done" | "now" | "wait" }) {
  if (state === "done")
    return (
      <svg width="16" height="16" viewBox="0 0 16 16"><rect width="16" height="16" fill="#EDEDED" /><path d="M4 8 L7 11 L12 5" stroke="#111" strokeWidth="1.8" fill="none" /></svg>
    );
  if (state === "now")
    return (
      <svg width="16" height="16" viewBox="0 0 16 16"><rect x=".5" y=".5" width="15" height="15" stroke="#EDEDED" fill="none" /><rect x="4" y="4" width="8" height="8" fill="#EDEDED" className="animate-pulse" /></svg>
    );
  return <svg width="16" height="16" viewBox="0 0 16 16"><rect x=".5" y=".5" width="15" height="15" stroke="#3A3A3A" fill="none" /></svg>;
}

function unit(stage: Stage) {
  return stage === "assets" ? "arquivos" : stage === "libraries" ? "bibliotecas" : "arquivos";
}

export function PlayTab({ instance }: { instance: Instance }) {
  const { installs, startInstall, cancelInstall } = useApp();
  const p: Progress | undefined = installs[instance.id];
  const running = p && RUNNING.includes(p.stage);
  const ratio = p && p.filesTotal ? p.filesDone / p.filesTotal : 0;
  const at = p ? ORDER.indexOf(p.stage) : -1;

  return (
    <div className="flex flex-col gap-6 px-12 py-8">
      {/* Destaque */}
      <div className="relative flex min-h-[230px] items-end overflow-hidden border border-line bg-gradient-to-r from-[#212121] to-[#121212] px-10 py-9">
        <Icon name={watermark[instance.kind]} size={300} className="pointer-events-none absolute -top-10 right-16 opacity-[0.07]" />
        <div className="relative flex flex-col gap-3">
          <div className="flex gap-1.5">
            {instance.kind === "pvp" ? <Chip>Competitivo</Chip> : (<><Chip>{instance.loader.type}</Chip><Chip>{instance.mcVersion}</Chip></>)}
          </div>
          <h1 className="m-0 text-4xl font-semibold">{instance.name}</h1>
          <p className="m-0 text-[13px] text-muted">
            {instance.lastPlayedAt ? `Última vez jogado: ${new Date(instance.lastPlayedAt * 1000).toLocaleString("pt-BR")}` : "Ainda não jogado"}
          </p>

          {running ? (
            <div className="mt-1 flex flex-col gap-2.5">
              <div className="flex w-[560px] flex-col gap-2.5 border border-edge bg-[#1a1a1a] px-[18px] py-3.5">
                <div className="flex items-center text-sm font-semibold">
                  <span className="flex-1">Baixando {STEPS.find((s) => s.stage === p!.stage)?.label(instance).toLowerCase()}</span>
                  <span>
                    {p!.filesDone.toLocaleString("pt-BR")} / {p!.filesTotal.toLocaleString("pt-BR")} {unit(p!.stage)}
                  </span>
                </div>
                <Bar value={ratio} />
                <div className="flex text-xs text-muted">
                  <span className="flex-1 truncate font-mono">{p!.current}</span>
                  <span>{p!.bytesPerSec > 0 && fmtSpeed(p!.bytesPerSec)}</span>
                </div>
              </div>
              <div>
                <Button variant="ghost" onClick={() => cancelInstall(instance.id)}>Cancelar</Button>
              </div>
            </div>
          ) : (
            <div className="mt-1 flex items-center gap-2">
              <button
                onClick={() => startInstall(instance.id)}
                className="flex h-14 w-60 items-center justify-center gap-3 bg-ink text-[17px] font-semibold text-[#111] transition-colors hover:bg-white"
              >
                <svg width="14" height="14" viewBox="0 0 12 12"><path d="M2 1 L11 6 L2 11 Z" fill="currentColor" /></svg>
                Jogar
              </button>
              {p?.stage === "done" && <span className="text-[13px] text-soft">Arquivos prontos. Abrir o jogo chega na próxima etapa.</span>}
              {p?.stage === "cancelled" && <span className="text-[13px] text-muted">Download cancelado. O que já baixou fica salvo.</span>}
            </div>
          )}
        </div>
      </div>

      {p?.stage === "error" && (
        <div className="flex items-center gap-4 border-l-2 border-ink bg-[#1a1a1a] px-4 py-3">
          <div className="flex-1">
            <p className="m-0 text-[13px] font-semibold">Não deu para baixar os arquivos</p>
            <p className="m-0 mt-0.5 text-xs break-all text-[#9a9a9a]">{p.error}</p>
          </div>
          <Button variant="outline" onClick={() => startInstall(instance.id)}>Tentar de novo</Button>
        </div>
      )}

      {/* Etapas */}
      {p && p.stage !== "done" && (
        <div className="flex flex-col border border-line bg-surface [&>*+*]:border-t [&>*+*]:border-line">
          {STEPS.map((s, i) => {
            const state = i < at || p.stage === "done" ? "done" : i === at && running ? "now" : "wait";
            return (
              <div key={s.stage} className={`flex items-center gap-3.5 px-[18px] py-3 ${state === "now" ? "bg-[#1b1b1b]" : ""}`}>
                <StepIcon state={state} />
                <span className={`flex-1 text-[13px] font-medium ${state === "wait" ? "text-[#6a6a6a]" : ""}`}>{s.label(instance)}</span>
                {state === "now" && (
                  <div className="w-[220px]">
                    <Bar value={ratio} />
                  </div>
                )}
                <span className={`w-28 text-right text-xs ${state === "wait" ? "text-faint" : "text-[#9a9a9a]"}`}>
                  {state === "done" ? "Pronto" : state === "now" ? `${p.filesDone} / ${p.filesTotal}` : "Na fila"}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
