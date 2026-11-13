import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { updateAll } from "../lib/modrinth";
import { NavLink, Navigate, useParams, Link, useNavigate } from "react-router-dom";
import { ConsolePanel } from "../components/GameControls";
import { PlayButton } from "../components/PlayButton";
import { ago } from "../components/InstanceCard";
import { useCover } from "../lib/tint";
import { useApp } from "../lib/store";
import { Button, Chip, Modal } from "../components/ui";
import { InstanceCover } from "../components/InstanceCover";
import { useDismiss } from "../lib/useDismiss";
import { api, extrasApi, type Instance } from "../lib/api";
import { PlayTab } from "./PlayTab";
import { PvpPlay } from "./PvpPlay";
import { ModsTab } from "./ModsTab";
import { InstanceSkinsTab } from "./SkinPages";
import { InstanceSettingsTab } from "./InstanceSettingsTab";
import { PrintsTab } from "./PrintsTab";

const tabs = [
  { slug: "conteudo", label: "Conteúdo" },
  { slug: "logs", label: "Logs" },
  { slug: "prints", label: "Prints" },
  { slug: "skins", label: "Skins" },
  { slug: "config", label: "Configurações" },
];
const pvpTabs = [
  { slug: "jogar", label: "Visão geral" },
  { slug: "logs", label: "Logs" },
  { slug: "skins", label: "Skins" },
  { slug: "config", label: "Configurações" },
];

export function InstancePage({ area }: { area: "vanilla" | "mods" | "pvp" }) {
  const { id = "pvp" } = useParams();
  const { instances, settings } = useApp();
  const [modsVersion, setModsVersion] = useState(0);
  const autoChecked = useRef<string | null>(null);
  const found = instances?.find((i) => i.id === id);
  // "Atualizar mods automaticamente": confere uma vez ao abrir a instância.
  useEffect(() => {
    if (!found || found.kind === "pvp" || !settings?.downloads.autoUpdateMods || autoChecked.current === found.id) return;
    autoChecked.current = found.id;
    updateAll(found).then((n) => n && setModsVersion((v) => v + 1));
  }, [found, settings]);
  if (instances === null) return null;
  if (!found) return <Navigate to={area === "pvp" ? "/" : `/${area}`} replace />;
  return <Page inst={found} area={area} modsVersion={modsVersion} />;
}

// ---------- Esqueleto único: cabeçalho com o tom da capa + abas (Vanilla, Mods e PVP) ----------

const playTime = (s: number) => (s < 3600 ? `${Math.max(1, Math.round(s / 60))} min` : `${(s / 3600).toFixed(1).replace(".", ",")} h`);

function Page({ inst, area, modsVersion }: { inst: Instance; area: "vanilla" | "mods" | "pvp"; modsVersion: number }) {
  const pvp = area === "pvp";
  const list = pvp ? pvpTabs : tabs;
  const { tab = list[0].slug } = useParams();
  const { games, refresh } = useApp();
  const navigate = useNavigate();
  const base = pvp ? "/pvp" : `/${area}/${inst.id}`;
  const current = list.find((t) => t.slug === tab) ?? list[0];
  const running = games[inst.id]?.state === "running";
  const { tint } = useCover(inst);

  const [menu, setMenu] = useState(false);
  const closeMenu = useCallback(() => setMenu(false), []);
  const menuRef = useDismiss<HTMLDivElement>(menu, closeMenu);
  const [confirm, setConfirm] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const item = "flex w-full items-center !rounded-none px-3.5 py-2.5 text-left text-sm text-soft hover:bg-[#34343a] hover:text-ink";

  let body: ReactNode;
  if (current.slug === "logs") body = <div className="h-full px-10 py-5"><div className="h-full overflow-hidden rounded-[10px]"><ConsolePanel id={inst.id} full /></div></div>;
  else if (current.slug === "skins") body = <InstanceSkinsTab key={inst.id} instance={inst} />;
  else if (current.slug === "config") body = <InstanceSettingsTab key={inst.id} instance={inst} />;
  else if (current.slug === "prints") body = <PrintsTab instance={inst} />;
  else if (pvp) body = <PvpPlay key={inst.id} instance={inst} />;
  else body = <ModsTab key={`${inst.id}-${modsVersion}`} instance={inst} />;

  return (
    <div className="flex h-full flex-col">
      {/* Cabeçalho: o tom vem da capa da instância */}
      <div className="shrink-0 transition-[background] duration-300" style={{ backgroundImage: `linear-gradient(to bottom, rgb(${tint} / 0.34), rgb(${tint} / 0))` }}>
        <div className="px-10 pt-[18px]">
          <Link to={pvp ? "/" : `/${area}`} className="text-xs font-medium text-soft no-underline hover:text-ink">‹&nbsp;&nbsp;{pvp ? "Início" : area === "vanilla" ? "Vanilla" : "Mods"}</Link>
        </div>
        <div className="flex items-center gap-5 px-10 py-5">
          <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-[10px] bg-raised">
            <InstanceCover instance={inst} mode="card" />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <h1 className="m-0 truncate text-[28px] leading-9 font-semibold">{inst.name}</h1>
            <div className="flex items-center gap-2">
              {pvp ? <Chip>Competitivo</Chip> : <Chip>{inst.mcVersion}</Chip>}
              {!pvp && inst.loader.type !== "Vanilla" && <Chip>{inst.loader.type}{inst.loader.version ? ` ${inst.loader.version}` : ""}</Chip>}
              <span className={`text-xs ${running ? "font-medium text-playing" : "text-soft"}`}>
                {running ? "Em jogo" : ago(inst.lastPlayedAt)}
                {inst.playTimeSecs > 0 && <span className="text-soft"> · {playTime(inst.playTimeSecs)} jogadas</span>}
              </span>
            </div>
          </div>
          {!(pvp && current.slug === "jogar") && <PlayButton id={inst.id} />}
          <div ref={menuRef} className="relative">
            <button aria-label="Mais opções" onClick={() => setMenu((m) => !m)} className={`flex h-12 w-12 items-center justify-center text-ink hover:bg-[#34343a] ${menu ? "bg-[#34343a]" : "bg-active"}`}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="3" r="1.4" /><circle cx="8" cy="8" r="1.4" /><circle cx="8" cy="13" r="1.4" /></svg>
            </button>
            {menu && (
              <div className="absolute top-full right-0 z-20 mt-1 w-[210px] overflow-hidden rounded-[10px] bg-active py-1 shadow-[0_12px_30px_rgba(0,0,0,0.5)]">
                <button className={item} onClick={() => { closeMenu(); api.openFolder(inst.id); }}>Abrir pasta</button>
                {!pvp && <button className={item} onClick={async () => { closeMenu(); try { setNote(`Exportada em ${await extrasApi.exportInstance(inst.id)}`); } catch (e) { setNote(String(e)); } }}>Exportar instância</button>}
                <button className={item} onClick={() => { closeMenu(); navigate(`${base}/config`); }}>Configurações</button>
                {!pvp && <button className={`${item} !text-danger`} onClick={() => { closeMenu(); setConfirm(true); }}>Excluir instância</button>}
              </div>
            )}
          </div>
        </div>
        {note && <p className="m-0 truncate px-10 pb-2 text-xs text-muted">{note}</p>}
        <div className="flex gap-[26px] border-b border-line px-10">
          {list.map((t) => (
            <NavLink key={t.slug} to={`${base}/${t.slug}`} className={`relative px-0.5 pt-3 pb-2.5 text-sm font-medium no-underline transition-colors ${t.slug === current.slug ? "text-ink" : "text-muted hover:text-soft"}`}>
              {t.label}
              {t.slug === current.slug && <span className="absolute right-0 bottom-[-1px] left-0 h-0.5 rounded-t-[2px] bg-ink" />}
            </NavLink>
          ))}
        </div>
      </div>

      {/* Avisos (erro ao abrir, crash, falha no download) */}
      {!pvp && <PlayTab instance={inst} hero={false} />}

      <div className={`min-h-0 flex-1 ${current.slug === "logs" ? "" : "overflow-y-auto"}`}>{body}</div>

      {confirm && (
        <Modal
          title="Excluir instância?"
          subtitle={inst.name}
          onClose={() => setConfirm(false)}
          width={460}
          footer={
            <>
              <span className="flex-1" />
              <Button variant="ghost" onClick={() => setConfirm(false)}>Cancelar</Button>
              <button
                onClick={async () => {
                  await api.deleteInstance(inst.id);
                  setConfirm(false);
                  await refresh();
                  navigate(`/${area}`);
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
