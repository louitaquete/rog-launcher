import { useDismiss } from "../lib/useDismiss";
import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, extrasApi, type Instance } from "../lib/api";
import { useApp } from "../lib/store";
import { Button, Chip, Modal } from "./ui";
import { InstanceCover } from "./InstanceCover";
import { isDownloading, PlayButton } from "./PlayButton";

export function ago(sec: number | null) {
  if (!sec) return "Ainda não jogada";
  const m = Math.floor((Date.now() / 1000 - sec) / 60);
  if (m < 60) return m < 1 ? "Jogada agora" : `Jogada há ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `Jogada há ${h} h`;
  const d = Math.floor(h / 24);
  return d < 14 ? `Jogada há ${d} ${d === 1 ? "dia" : "dias"}` : d < 60 ? `Jogada há ${Math.floor(d / 7)} semanas` : `Jogada há ${Math.floor(d / 30)} meses`;
}


export function instancePath(i: Instance) {
  return i.kind === "pvp" ? "/pvp" : `/${i.kind}/${i.id}`;
}

export const agoShort = (sec: number | null) => (sec ? ago(sec).replace("Jogada ", "") : "nunca jogada");
export const hoursShort = (s: number) => (s < 3600 ? `${Math.round(s / 60)} min` : `${Math.round(s / 3600)} h`);
const Star = ({ on, size = 15 }: { on: boolean; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"><path d="M8 1.8l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.6l-3.8 2 .7-4.3-3.1-3 4.3-.6z" /></svg>
);
const PlayTri = () => <svg width="12" height="12" viewBox="0 0 12 12"><path d="M3 1.8 L10 6 L3 10.2 Z" fill="currentColor" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /></svg>;

/** Estado ao vivo de uma instância (jogo aberto, download). */
function useLive(instance: Instance) {
  const { games, installs } = useApp();
  const p = installs[instance.id];
  return { running: games[instance.id]?.state === "running", downloading: isDownloading(p?.stage), pct: p && p.filesTotal ? Math.round((p.filesDone / p.filesTotal) * 100) : 0 };
}

/** Fixar/desafixar no topo da biblioteca. */
function usePin(instance: Instance) {
  const { refresh } = useApp();
  return async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    await api.updateInstance({ ...instance, pinned: !instance.pinned });
    refresh();
  };
}

/** Menu ⋮ da instância, com a confirmação de exclusão. */
function Menu({ instance, open, setOpen, onNote, className = "" }: { instance: Instance; open: boolean; setOpen: (v: boolean) => void; onNote: (s: string | null) => void; className?: string }) {
  const { refresh } = useApp();
  const ref = useDismiss<HTMLDivElement>(open, useCallback(() => setOpen(false), [setOpen]));
  const [confirm, setConfirm] = useState(false);
  const pin = usePin(instance);
  const isPvp = instance.kind === "pvp";
  const item = "block w-full !rounded-none px-3.5 py-2.5 text-left text-sm text-soft hover:bg-[#34343a] hover:text-ink";
  return (
    <div ref={ref} className={`relative ${className}`} onClick={(e) => e.stopPropagation()}>
      <button onClick={() => setOpen(!open)} aria-label="Opções" className="flex h-[30px] w-[30px] items-center justify-center bg-black/60 text-ink hover:bg-black/85">
        <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="3" r="1.4" /><circle cx="8" cy="8" r="1.4" /><circle cx="8" cy="13" r="1.4" /></svg>
      </button>
      {open && (
        <div className="absolute top-full right-0 z-30 mt-1 w-48 overflow-hidden rounded-[10px] bg-active py-1 shadow-[0_8px_24px_rgba(0,0,0,0.6)]">
          {!isPvp && <button className={item} onClick={() => { setOpen(false); pin(); }}>{instance.pinned ? "Desafixar" : "Fixar no topo"}</button>}
          <button className={item} onClick={() => { setOpen(false); api.openFolder(instance.id); }}>Abrir pasta</button>
          {!isPvp && (
            <button
              className={item}
              onClick={async () => {
                setOpen(false);
                onNote("Exportando…");
                try {
                  onNote(`Salvo em ${await extrasApi.exportInstance(instance.id)}`);
                } catch (e) {
                  onNote(String(e));
                }
                setTimeout(() => onNote(null), 5000);
              }}
            >
              Exportar instância
            </button>
          )}
          {!isPvp && <button className={`${item} !text-danger`} onClick={() => { setOpen(false); setConfirm(true); }}>Excluir instância</button>}
        </div>
      )}
      {confirm && (
        <Modal
          title="Excluir instância?"
          subtitle={instance.name}
          onClose={() => setConfirm(false)}
          width={460}
          footer={
            <>
              <span className="flex-1" />
              <Button variant="ghost" onClick={() => setConfirm(false)}>Cancelar</Button>
              <button
                onClick={async () => {
                  await api.deleteInstance(instance.id);
                  setConfirm(false);
                  refresh();
                }}
                className="bg-danger px-4 py-2.5 text-sm font-semibold text-[#111112] hover:brightness-110"
              >
                Excluir
              </button>
            </>
          }
        >
          <p className="m-0 text-left text-sm leading-relaxed text-soft">
            Mundos, mods, prints e configurações desta instância vão ser apagados. Isso não dá pra desfazer. Se quiser guardar, use "Exportar instância" antes.
          </p>
        </Modal>
      )}
    </div>
  );
}

function Badge({ tone, children }: { tone?: "play" | "up"; children: React.ReactNode }) {
  return (
    <span className={`flex items-center gap-1.5 rounded-[6px] bg-[#0b0b0c]/75 px-2 py-1 text-xs font-medium ${tone === "play" ? "text-playing" : tone === "up" ? "text-update" : "text-ink"}`}>
      {tone === "play" && <span className="h-[7px] w-[7px] animate-[rog-breathe_2s_ease-in-out_infinite] rounded-full bg-playing" />}
      {tone === "up" && <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M8 12.5V4M4.5 7.5L8 4l3.5 3.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>}
      {children}
    </span>
  );
}

export interface CardInfo { mods?: number; updates?: number }

/** Card da biblioteca. `wide` é o destaque da última instância jogada. */
export function InstanceCard({ instance, wide, info = {} }: { instance: Instance; wide?: boolean; info?: CardInfo }) {
  const navigate = useNavigate();
  const { play } = useApp();
  const { running, downloading, pct } = useLive(instance);
  const pin = usePin(instance);
  const [menu, setMenu] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const isPvp = instance.kind === "pvp";
  const go = (e: React.MouseEvent) => {
    e.stopPropagation();
    play(instance.id);
    navigate(isPvp ? "/pvp/jogar" : `/${instance.kind}/${instance.id}/conteudo`);
  };
  const show = menu ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-within:opacity-100";
  const stats = [info.mods !== undefined && `${info.mods} ${info.mods === 1 ? "mod" : "mods"}`, instance.playTimeSecs > 0 && (wide ? `${hoursShort(instance.playTimeSecs)} jogadas` : hoursShort(instance.playTimeSecs)), wide && instance.lastPlayedAt ? ago(instance.lastPlayedAt).toLowerCase() : agoShort(instance.lastPlayedAt)].filter(Boolean) as string[];

  return (
    <div
      onClick={() => navigate(instancePath(instance))}
      className={`group relative flex h-full cursor-pointer flex-col justify-between overflow-hidden rounded-[10px] border-[1.5px] bg-raised p-3 transition-[border-color,box-shadow] duration-150 hover:shadow-[0_10px_28px_rgba(0,0,0,0.5)] ${wide ? "col-span-2" : ""} ${running ? "border-playing/70" : menu ? "border-muted" : "border-transparent hover:border-muted"}`}
    >
      <InstanceCover instance={instance} mode="card" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#0b0b0c]/10 from-30% to-[#0b0b0c]/95 transition-opacity group-hover:opacity-90" />

      <div className="relative flex items-start gap-1.5">
        {wide && <Badge>Última jogada</Badge>}
        {running ? <Badge tone="play">Em jogo</Badge> : downloading ? <Badge>Baixando {pct}%</Badge> : info.updates ? <Badge tone="up">{info.updates} {info.updates === 1 ? "atualização" : "atualizações"}</Badge> : null}
        <span className="flex-1" />
        {!isPvp && (
          <button onClick={pin} aria-label={instance.pinned ? "Desafixar" : "Fixar no topo"} title={instance.pinned ? "Desafixar" : "Fixar no topo"} className={`flex h-[30px] w-[30px] items-center justify-center bg-black/60 hover:bg-black/85 ${instance.pinned ? "text-ink" : `text-soft ${show}`}`}>
            <Star on={!!instance.pinned} />
          </button>
        )}
        <Menu instance={instance} open={menu} setOpen={setMenu} onNote={setNote} className={`transition-opacity ${show}`} />
      </div>

      <div className="relative flex items-end gap-2.5">
        <div className="flex min-w-0 flex-1 flex-col gap-[7px]">
          <p className={`m-0 truncate font-semibold text-ink ${wide ? "text-xl" : "text-base"}`}>{instance.name}</p>
          <div className="flex gap-1.5">
            {isPvp ? <Chip>Competitivo</Chip> : <><Chip>{instance.mcVersion}</Chip>{instance.loader.type !== "Vanilla" && <Chip>{instance.loader.type}</Chip>}</>}
          </div>
          <p className="m-0 flex gap-3 truncate text-xs text-soft" title={note ?? undefined}>{note ?? stats.map((s) => <span key={s}>{s}</span>)}</p>
        </div>
        {wide ? (
          <PlayButton id={instance.id} onPlay={() => navigate(isPvp ? "/pvp/jogar" : `/${instance.kind}/${instance.id}/conteudo`)} />
        ) : (
          !running && !downloading && (
            <button aria-label={`Jogar ${instance.name}`} onClick={go} className={`flex h-11 w-11 shrink-0 items-center justify-center bg-ink text-[#111112] transition-opacity hover:bg-white ${show}`}>
              <PlayTri />
            </button>
          )
        )}
      </div>
      {downloading && <span className="absolute bottom-0 left-0 h-1 bg-ink transition-[width] duration-300" style={{ width: `${pct}%` }} />}
    </div>
  );
}

/** A mesma instância como linha da visão em lista. */
export function InstanceRow({ instance, info = {} }: { instance: Instance; info?: CardInfo }) {
  const navigate = useNavigate();
  const { play } = useApp();
  const { running, downloading, pct } = useLive(instance);
  const [menu, setMenu] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const cell = "shrink-0 truncate text-sm text-soft";
  return (
    <div onClick={() => navigate(instancePath(instance))} className={`group flex cursor-pointer items-center gap-3.5 rounded-[10px] px-3.5 py-2 ${menu ? "bg-raised" : "bg-surface hover:bg-raised"}`}>
      <div className="relative h-10 w-14 shrink-0 overflow-hidden rounded-[6px] bg-raised"><InstanceCover instance={instance} mode="mini" /></div>
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        {instance.pinned && <span className="text-ink"><Star on size={13} /></span>}
        <span className="truncate text-sm font-medium text-ink" title={note ?? undefined}>{note ?? instance.name}</span>
        {running ? <span className="flex items-center gap-1.5 rounded-[6px] bg-active px-2 py-0.5 text-xs font-medium text-playing"><span className="h-[7px] w-[7px] rounded-full bg-playing" />Em jogo</span> : info.updates ? <span className="rounded-[6px] bg-active px-2 py-0.5 text-xs font-medium text-update">{info.updates} {info.updates === 1 ? "atualização" : "atualizações"}</span> : null}
      </div>
      <div className="flex w-[190px] shrink-0 gap-1.5"><Chip>{instance.mcVersion}</Chip>{instance.loader.type !== "Vanilla" && <Chip>{instance.loader.type}</Chip>}</div>
      <span className={`${cell} w-[70px]`}>{info.mods ?? "–"}</span>
      <span className={`${cell} w-[110px]`}>{instance.playTimeSecs > 0 ? hoursShort(instance.playTimeSecs) : "–"}</span>
      <span className={`${cell} w-[130px]`}>{agoShort(instance.lastPlayedAt)}</span>
      <div className="flex w-[150px] shrink-0 items-center justify-end gap-2">
        {running ? null : downloading ? (
          <span className="text-xs font-medium text-ink">Baixando {pct}%</span>
        ) : (
          <button onClick={(e) => { e.stopPropagation(); play(instance.id); navigate(`${instancePath(instance)}/conteudo`); }} className="bg-active px-4 py-1.5 text-sm font-medium text-ink group-hover:bg-ink group-hover:text-[#111112]">Jogar</button>
        )}
        <Menu instance={instance} open={menu} setOpen={setMenu} onNote={setNote} className="[&>button]:bg-transparent [&>button]:text-soft" />
      </div>
    </div>
  );
}

export function NewInstanceCard({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex h-full flex-col items-center justify-center gap-1.5 !rounded-[10px] border-[1.5px] border-dashed border-active text-muted hover:border-muted hover:text-ink">
      <span className="text-[28px] leading-none">+</span>
      <span className="text-sm font-medium">Nova instância</span>
    </button>
  );
}
