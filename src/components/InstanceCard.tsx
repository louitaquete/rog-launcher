import { useDismiss } from "../lib/useDismiss";
import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, extrasApi, type Instance } from "../lib/api";
import { useApp } from "../lib/store";
import { Button, Chip, Modal } from "./ui";
import { InstanceCover } from "./InstanceCover";


export function instancePath(i: Instance) {
  return i.kind === "pvp" ? "/pvp" : `/${i.kind}/${i.id}`;
}

export function InstanceCard({ instance }: { instance: Instance }) {
  const navigate = useNavigate();
  const { play, refresh } = useApp();
  const open = () => navigate(instancePath(instance));
  const [menu, setMenu] = useState(false);
  const menuRef = useDismiss<HTMLDivElement>(menu, useCallback(() => setMenu(false), []));
  const [confirm, setConfirm] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const isPvp = instance.kind === "pvp";

  const item = "block w-full px-3.5 py-2.5 text-left text-[13px] text-[#d0d0d0] hover:bg-active";

  return (
    <div
      onClick={open}
      className="group flex h-[360px] w-[208px] cursor-pointer flex-col border border-line bg-card transition-all duration-150 hover:-translate-y-0.5 hover:border-[#3a3a3a] hover:bg-[#1e1e1e] hover:shadow-[0_8px_24px_rgba(0,0,0,0.55)]"
    >
      <div className="relative h-[208px] overflow-hidden">
        <InstanceCover instance={instance} mode="card" />
      </div>
      <div className="flex flex-1 flex-col gap-2.5 p-3.5">
        <p className="m-0 truncate text-sm font-semibold text-ink">{instance.name}</p>
        <div className="flex gap-1.5">
          {instance.kind === "pvp" ? (
            <Chip>Competitivo</Chip>
          ) : (
            <>
              <Chip>{instance.mcVersion}</Chip>
              <Chip>{instance.loader.type}</Chip>
            </>
          )}
        </div>
        <div className="flex-1" />
        <div className="flex gap-1.5">
          <button
            onClick={(e) => {
              e.stopPropagation();
              play(instance.id);
              navigate(instance.kind === "pvp" ? "/pvp/jogar" : `/${instance.kind}/${instance.id}/jogar`);
            }}
            className="flex h-[38px] flex-1 items-center justify-center gap-2 bg-active text-[13px] font-semibold text-[#d0d0d0] transition-colors group-hover:bg-ink group-hover:text-[#111]"
          >
            <svg width="10" height="10" viewBox="0 0 12 12">
              <path d="M2 1 L11 6 L2 11 Z" fill="currentColor" />
            </svg>
            Jogar
          </button>
          <div ref={menuRef} className="relative" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => setMenu((m) => !m)}
            aria-label="Opções"
            className="flex h-[38px] w-[38px] items-center justify-center bg-active text-soft hover:bg-[#2e2e2e] hover:text-ink"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <rect x="7" y="2" width="2.4" height="2.4" />
              <rect x="7" y="6.8" width="2.4" height="2.4" />
              <rect x="7" y="11.6" width="2.4" height="2.4" />
            </svg>
          </button>
          {menu && (
            <div className="absolute right-0 bottom-full z-30 w-48 border border-edge bg-[#1c1c1c] py-1 shadow-[0_8px_24px_rgba(0,0,0,0.6)]">
              <button className={item} onClick={() => { setMenu(false); api.openFolder(instance.id); }}>Abrir pasta</button>
              {!isPvp && (
                <button
                  className={item}
                  onClick={async () => {
                    setMenu(false);
                    setNote("Exportando…");
                    try {
                      const path = await extrasApi.exportInstance(instance.id);
                      setNote(`Salvo em ${path}`);
                    } catch (e) {
                      setNote(String(e));
                    }
                    setTimeout(() => setNote(null), 5000);
                  }}
                >
                  Exportar instância
                </button>
              )}
              {!isPvp && (
                <button className={`${item} text-[#e5484d] hover:text-[#e5484d]`} onClick={() => { setMenu(false); setConfirm(true); }}>
                  Excluir instância
                </button>
              )}
            </div>
          )}
          </div>
        </div>
        {note && <p className="m-0 truncate text-[11px] text-muted" title={note}>{note}</p>}
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
                  className="bg-[#e5484d] px-4 py-2.5 text-[13px] font-semibold text-[#111] hover:bg-[#f06368]"
                >
                  Excluir
                </button>
              </>
            }
          >
            <p className="m-0 text-left text-[13px] leading-relaxed text-[#9a9a9a]">
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
    <button onClick={onClick} className="flex h-[360px] w-[208px] flex-col items-center justify-center gap-1.5 border border-dashed border-edge text-[#8a8a8a] transition-colors hover:border-[#4a4a4a] hover:text-soft">
      <span className="text-[32px] leading-none">+</span>
      <span className="text-[13px] font-medium">Nova instância</span>
    </button>
  );
}
