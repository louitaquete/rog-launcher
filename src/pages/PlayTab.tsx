import { api, type Instance, type Progress, type Stage } from "../lib/api";
import { useApp } from "../lib/store";
import { Button, Chip, Icon } from "../components/ui";
import type { IconName } from "../components/icons";

const STEPS: { stage: Stage; label: (i: Instance) => string }[] = [
  { stage: "java", label: () => "Java" },
  { stage: "version", label: (i) => `Minecraft ${i.mcVersion}` },
  { stage: "libraries", label: () => "Bibliotecas" },
  { stage: "assets", label: () => "Assets (sons e texturas)" },
  { stage: "loader", label: (i) => `Loader ${i.loader.type}${i.loader.version ? ` ${i.loader.version}` : ""}` },
];
const ORDER: Stage[] = ["java", "version", "libraries", "assets", "loader", "done"];
const RUNNING: Stage[] = ["java", "version", "libraries", "assets", "loader"];
const hasLoader = (i: Instance) => !["Vanilla", "OptiFine"].includes(i.loader.type);

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
  const { installs, play, cancelInstall, games, logs, launchErrors, setLoginOpen } = useApp();
  const p: Progress | undefined = installs[instance.id];
  const game = games[instance.id];
  const inGame = game?.state === "running";
  const crashed = game?.state === "exited" && !game.killed && game.exitCode !== 0 && game.exitCode !== null;
  const launchError = launchErrors[instance.id];
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
            {instance.kind === "pvp" ? <Chip>Competitivo</Chip> : (<><Chip>{instance.loader.type}{instance.loader.version && hasLoader(instance) ? ` ${instance.loader.version}` : ""}</Chip><Chip>{instance.mcVersion}</Chip></>)}
          </div>
          <h1 className="m-0 text-4xl font-semibold">{instance.name}</h1>
          <p className="m-0 text-[13px] text-muted">
            {instance.lastPlayedAt ? `Última vez jogado: ${new Date(instance.lastPlayedAt * 1000).toLocaleString("pt-BR")}` : "Ainda não jogado"}
          </p>

          {running ? (
            <div className="mt-1 flex flex-col gap-2.5">
              <div className="flex w-[560px] flex-col gap-2.5 border border-edge bg-[#1a1a1a] px-[18px] py-3.5">
                <div className="flex items-center text-sm font-semibold">
                  <span className="flex-1">
                    {p!.stage === "loader" ? `Instalando ${instance.loader.type}` : `Baixando ${STEPS.find((s) => s.stage === p!.stage)?.label(instance).toLowerCase()}`}
                  </span>
                  {p!.filesTotal > 0 && (
                    <span>
                      {p!.filesDone.toLocaleString("pt-BR")} / {p!.filesTotal.toLocaleString("pt-BR")} {unit(p!.stage)}
                    </span>
                  )}
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
          ) : inGame ? (
            <div className="mt-1 flex items-center gap-3">
              <div className="flex h-14 w-60 items-center justify-center gap-3 border border-edge bg-raised text-[17px] font-semibold text-[#9a9a9a]">
                <span className="h-2 w-2 animate-pulse bg-[#9a9a9a]" />
                Em jogo
              </div>
            </div>
          ) : (
            <div className="mt-1 flex items-center gap-2">
              <button
                onClick={() => play(instance.id)}
                className="flex h-14 w-60 items-center justify-center gap-3 bg-ink text-[17px] font-semibold text-[#111] transition-colors hover:bg-white"
              >
                <svg width="14" height="14" viewBox="0 0 12 12"><path d="M2 1 L11 6 L2 11 Z" fill="currentColor" /></svg>
                Jogar
              </button>
              {p?.stage === "cancelled" && <span className="text-[13px] text-muted">Download cancelado. O que já baixou fica salvo.</span>}
            </div>
          )}
        </div>
      </div>

      {launchError && !inGame && (
        <div className="flex items-center gap-4 border-l-2 border-[#4a4a4a] bg-[#1a1a1a] px-4 py-3">
          <div className="flex-1">
            {launchError.includes("NEEDS_ACCOUNT") ? (
              <>
                <p className="m-0 text-[13px] font-semibold">Conecte sua conta Microsoft para jogar</p>
                <p className="m-0 mt-0.5 text-xs text-[#9a9a9a]">Os arquivos já estão baixados. É só entrar e jogar.</p>
              </>
            ) : (
              <>
                <p className="m-0 text-[13px] font-semibold">Não deu para abrir o jogo</p>
                <p className="m-0 mt-0.5 text-xs break-all text-[#9a9a9a]">{launchError.replace(/^NO_GAME: /, "")}</p>
              </>
            )}
          </div>
          {launchError.includes("NEEDS_ACCOUNT") && (
            <button onClick={() => setLoginOpen(true)} className="bg-ink px-4 py-2 text-[13px] font-semibold text-[#111] hover:bg-white">Entrar</button>
          )}
        </div>
      )}

      {crashed && (
        <div className="flex flex-col border border-edge bg-surface">
          <div className="flex items-center gap-4 px-5 py-4">
            <div className="flex h-11 w-11 items-center justify-center bg-ink">
              <svg width="20" height="20" viewBox="0 0 24 24"><path d="M12 2 L23 21 H1 Z" fill="#111" /><rect x="11" y="9" width="2" height="6" fill="#EDEDED" /><rect x="11" y="17" width="2" height="2" fill="#EDEDED" /></svg>
            </div>
            <div className="flex-1">
              <p className="m-0 text-base font-semibold">O jogo fechou inesperadamente</p>
              <p className="m-0 mt-0.5 text-xs text-muted">Código de saída {game!.exitCode}. O fim do log está abaixo.</p>
            </div>
            <Button variant="outline" onClick={() => navigator.clipboard.writeText((logs[instance.id] ?? []).join("\n"))}>Copiar log</Button>
            <Button variant="outline" onClick={() => api.openFolder(instance.id)}>Abrir pasta da instância</Button>
          </div>
          <pre className="m-0 max-h-64 overflow-auto border-t border-line bg-[#0a0a0a] px-5 py-3 font-mono text-xs leading-5 text-[#9a9a9a] select-text">
            {(logs[instance.id] ?? []).slice(-40).join("\n") || "Sem log."}
          </pre>
        </div>
      )}

      {p?.stage === "error" && (
        <div className="flex items-center gap-4 border-l-2 border-[#4a4a4a] bg-[#1a1a1a] px-4 py-3">
          <div className="flex-1">
            <p className="m-0 text-[13px] font-semibold">Não deu para baixar os arquivos</p>
            <p className="m-0 mt-0.5 text-xs break-all text-[#9a9a9a]">{p.error}</p>
          </div>
          <Button variant="outline" onClick={() => play(instance.id)}>Tentar de novo</Button>
        </div>
      )}

      {/* Etapas */}
      {p && !["done", "cancelled", "error"].includes(p.stage) && (
        <div className="flex flex-col border border-line bg-surface [&>*+*]:border-t [&>*+*]:border-line">
          {STEPS.filter((s) => s.stage !== "loader" || hasLoader(instance)).map((s, i) => {
            const state = i < at || p.stage === "done" ? "done" : i === at && running ? "now" : "wait";
            return (
              <div key={s.stage} className={`flex items-center gap-3.5 px-[18px] py-3 ${state === "now" ? "bg-[#1b1b1b]" : ""}`}>
                <StepIcon state={state} />
                <span className={`flex-1 text-[13px] font-medium ${state === "wait" ? "text-[#8a8a8a]" : ""}`}>{s.label(instance)}</span>
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
