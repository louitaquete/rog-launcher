import { useNavigate } from "react-router-dom";
import type { Instance } from "../lib/api";
import { Chip, Icon } from "./ui";
import type { IconName } from "./icons";

const coverIcon: Record<Instance["kind"], IconName> = { vanilla: "vanilla", pvp: "pvp", mods: "mods" };

export function instancePath(i: Instance) {
  return i.kind === "pvp" ? "/pvp" : `/${i.kind}/${i.id}`;
}

export function InstanceCard({ instance }: { instance: Instance }) {
  const navigate = useNavigate();
  const open = () => navigate(instancePath(instance));

  return (
    <div
      onClick={open}
      className="group flex h-[360px] w-[208px] cursor-pointer flex-col border border-line bg-card transition-all duration-150 hover:-translate-y-0.5 hover:border-[#3a3a3a] hover:bg-[#1e1e1e] hover:shadow-[0_8px_24px_rgba(0,0,0,0.55)]"
    >
      <div className="flex h-[208px] items-center justify-center overflow-hidden bg-gradient-to-b from-[#262626] to-[#171717]">
        <Icon
          name={coverIcon[instance.kind]}
          size={72}
          className="opacity-35 transition-transform duration-200 group-hover:scale-110"
        />
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
            onClick={(e) => e.stopPropagation()}
            className="flex h-[38px] flex-1 items-center justify-center gap-2 bg-active text-[13px] font-semibold text-[#d0d0d0] transition-colors group-hover:bg-ink group-hover:text-[#111]"
          >
            <svg width="10" height="10" viewBox="0 0 12 12">
              <path d="M2 1 L11 6 L2 11 Z" fill="currentColor" />
            </svg>
            Jogar
          </button>
          <button
            onClick={(e) => e.stopPropagation()}
            aria-label="Opções"
            className="flex h-[38px] w-[38px] items-center justify-center bg-active text-soft hover:bg-[#2e2e2e] hover:text-ink"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <rect x="7" y="2" width="2.4" height="2.4" />
              <rect x="7" y="6.8" width="2.4" height="2.4" />
              <rect x="7" y="11.6" width="2.4" height="2.4" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

export function NewInstanceCard({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex h-[360px] w-[208px] flex-col items-center justify-center gap-1.5 border border-dashed border-edge text-[#6a6a6a] transition-colors hover:border-[#4a4a4a] hover:text-soft">
      <span className="text-[32px] leading-none">+</span>
      <span className="text-[13px] font-medium">Nova instância</span>
    </button>
  );
}
