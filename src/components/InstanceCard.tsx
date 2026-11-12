import { useDismiss } from "../lib/useDismiss";
import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, extrasApi, type Instance } from "../lib/api";
import { useApp } from "../lib/store";
import { Button, Chip, Modal } from "./ui";
import { InstanceCover } from "./InstanceCover";
import { isDownloading } from "./PlayButton";

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

export function InstanceCard({ instance }: { instance: Instance }) {
  const navigate = useNavigate();
  const { play, refresh, games, installs } = useApp();
  const open = () => navigate(instancePath(instance));
  const [menu, setMenu] = useState(false);
  const menuRef = useDismiss<HTMLDivElement>(menu, useCallback(() => setMenu(false), []));
  const [confirm, setConfirm] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const isPvp = instance.kind === "pvp";

  const item = "block w-full !rounded-none px-3.5 py-2.5 text-left text-sm text-soft hover:bg-[#34343a] hover:text-ink";

  const running = games[instance.id]?.state === "running";
  const p = installs[instance.id];
  const downloading = isDownloading(p?.stage);
  const pct = p && p.filesTotal ? Math.round((p.filesDone / p.filesTotal) * 100) : 0;

  return (
    <div
      onClick={open}
      className={`group relative flex aspect-[246/300] cursor-pointer flex-col justify-end overflow-hidden rounded-[10px] border bg-raised p-3.5 transition-[border-color,box-shadow] duration-150 hover:shadow-[0_10px_28px_rgba(0,0,0,0.5)] ${menu ? "border-muted" : "border-transparent hover:border-muted"}`}
    >
      <InstanceCover instance={instance} mode="card" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent from-35% to-[#0b0b0c]/95 transition-opacity group-hover:opacity-90" />
      <div className="relative flex min-w-0 flex-col gap-2">
        <p className="m-0 truncate text-base font-semibold text-ink">{instance.name}</p>
        <div className="flex gap-1.5">
          {isPvp ? <Chip>Competitivo</Chip> : (
            <>
              <Chip>{instance.mcVersion}</Chip>
              {instance.loader.type !== "Vanilla" && <Chip>{instance.loader.type}</Chip>}
            </>
          )}
        </div>
        <p className={`m-0 truncate text-xs ${running ? "font-medium text-playing" : "text-soft"}`} title={note ?? undefined}>
          {note ?? (running ? "Em jogo" : downloading ? `Baixando · ${pct}%` : ago(instance.lastPlayedAt))}
        </p>
      </div>
      {downloading && <span className="absolute bottom-0 left-0 h-[3px] bg-ink transition-[width] duration-300" style={{ width: `${pct}%` }} />}

      {/* Ações: só aparecem no hover (ou com o menu aberto). */}
      {!running && !downloading && (
        <button
          aria-label={`Jogar ${instance.name}`}
          onClick={(e) => {
            e.stopPropagation();
            play(instance.id);
            navigate(isPvp ? "/pvp/jogar" : `/${instance.kind}/${instance.id}/conteudo`);
          }}
          className={`absolute right-3.5 bottom-3.5 flex h-11 w-11 items-center justify-center bg-ink text-[#111112] transition-opacity hover:bg-white ${menu ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"}`}
        >
          <svg width="12" height="12" viewBox="0 0 12 12"><path d="M3 1.8 L10 6 L3 10.2 Z" fill="currentColor" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /></svg>
        </button>
      )}
      <div ref={menuRef} className={`absolute top-3 right-3 transition-opacity ${menu ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-within:opacity-100"}`} onClick={(e) => e.stopPropagation()}>
        <button onClick={() => setMenu((m) => !m)} aria-label="Opções" className="flex h-8 w-8 items-center justify-center bg-black/55 text-ink hover:bg-black/80">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="3" r="1.4" /><circle cx="8" cy="8" r="1.4" /><circle cx="8" cy="13" r="1.4" /></svg>
        </button>
        {menu && (
          <div className="absolute top-full right-0 z-30 mt-1 w-48 overflow-hidden rounded-[10px] bg-active py-1 shadow-[0_8px_24px_rgba(0,0,0,0.6)]">
            <button className={item} onClick={() => { setMenu(false); api.openFolder(instance.id); }}>Abrir pasta</button>
            {!isPvp && (
              <button
                className={item}
                onClick={async () => {
                  setMenu(false);
                  setNote("Exportando…");
                  try {
                    setNote(`Salvo em ${await extrasApi.exportInstance(instance.id)}`);
                  } catch (e) {
                    setNote(String(e));
                  }
                  setTimeout(() => setNote(null), 5000);
                }}
              >
                Exportar instância
              </button>
            )}
            {!isPvp && <button className={`${item} !text-danger`} onClick={() => { setMenu(false); setConfirm(true); }}>Excluir instância</button>}
          </div>
        )}
      </div>
      {confirm && (
        <div onClick={(e) => e.stopPropagation()} className="cursor-default">
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
                  className="bg-danger px-4 py-2.5 text-sm font-semibold text-[#111112] hover:bg-[#f06368]"
                >
                  Excluir
                </button>
              </>
            }
          >
            <p className="m-0 text-left text-sm leading-relaxed text-muted">
              Mundos, mods, prints e configurações desta instância vão ser apagados. Isso não dá pra desfazer. Se quiser guardar, use "Exportar instância" antes.
            </p>
          </Modal>
        </div>
      )}
    </div>
  );
}

export function NewInstanceCard({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex aspect-[246/300] flex-col items-center justify-center gap-1.5 !rounded-[10px] border-[1.5px] border-dashed border-active text-muted hover:border-muted hover:text-ink">
      <span className="text-[28px] leading-none">+</span>
      <span className="text-sm font-medium">Nova instância</span>
    </button>
  );
}
