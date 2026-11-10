import { useCallback, useEffect, useRef, useState } from "react";
import { updateAll } from "../lib/modrinth";
import { NavLink, Navigate, useParams, Link, useNavigate } from "react-router-dom";
import { ConsolePanel, GameBar } from "../components/GameControls";
import { useApp } from "../lib/store";
import { Button, Chip, Icon, Modal } from "../components/ui";
import type { IconName } from "../components/icons";
import { InstanceCover } from "../components/InstanceCover";
import { useDismiss } from "../lib/useDismiss";
import { api, extrasApi, type Instance } from "../lib/api";
import { PlayTab } from "./PlayTab";
import { PvpPlay } from "./PvpPlay";
import { ModsTab } from "./ModsTab";
import { InstanceSkinsTab } from "./SkinPages";
import { InstanceSettingsTab } from "./InstanceSettingsTab";
import { PrintsTab } from "./PrintsTab";

const pvpTabs: { slug: string; label: string; icon: IconName }[] = [
  { slug: "jogar", label: "Jogar", icon: "play" },
  { slug: "skins", label: "Skins", icon: "skins" },
  { slug: "config", label: "Configurações", icon: "settings" },
];

const tabs = [
  { slug: "conteudo", label: "Conteúdo" },
  { slug: "logs", label: "Logs" },
  { slug: "prints", label: "Prints" },
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
  return area === "pvp" ? <PvpPage inst={found} /> : <ModernPage inst={found} area={area} modsVersion={modsVersion} />;
}

// ---------- Vanilla / Mods: cabeçalho + abas Conteúdo, Logs, Prints, Skins, Configurações ----------

function ago(sec: number | null) {
  if (!sec) return "Ainda não jogada";
  const m = Math.floor((Date.now() / 1000 - sec) / 60);
  if (m < 1) return "Jogada agora";
  if (m < 60) return `Jogada há ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `Jogada há ${h} h`;
  const d = Math.floor(h / 24);
  return `Jogada há ${d} ${d === 1 ? "dia" : "dias"}`;
}
const playTime = (s: number) => (s < 3600 ? `${Math.max(1, Math.round(s / 60))} min` : `${(s / 3600).toFixed(1).replace(".", ",")} h`);

function ModernPage({ inst, area, modsVersion }: { inst: Instance; area: "vanilla" | "mods"; modsVersion: number }) {
  const { tab = "conteudo" } = useParams();
  const { games, installs, play, cancelInstall, refresh } = useApp();
  const navigate = useNavigate();
  const base = `/${area}/${inst.id}`;
  const current = tabs.find((t) => t.slug === tab) ?? tabs[0];
  const game = games[inst.id];
  const inGame = game?.state === "running";
  const p = installs[inst.id];
  const downloading = p && ["java", "version", "libraries", "assets", "loader"].includes(p.stage);
  const pct = p && p.filesTotal ? Math.round((p.filesDone / p.filesTotal) * 100) : 0;

  const [menu, setMenu] = useState(false);
  const closeMenu = useCallback(() => setMenu(false), []);
  const menuRef = useDismiss<HTMLDivElement>(menu, closeMenu);
  const [confirm, setConfirm] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const item = "flex w-full items-center px-3.5 py-2 text-left text-[13px] text-ink hover:bg-raised";

  return (
    <div className="flex h-full flex-col">
      {/* Breadcrumb + barra do jogo */}
      <div className="flex h-11 shrink-0 items-center gap-2.5 bg-[#101010] pr-3 pl-5 text-[13px] font-medium">
        <Link to={`/${area}`} className="flex items-center gap-2.5 text-[#8a8a8a] no-underline hover:text-ink">
          <svg width="14" height="14" viewBox="0 0 14 14"><path d="M9 2 L4 7 L9 12" stroke="currentColor" strokeWidth="1.6" fill="none" /></svg>
          {area === "vanilla" ? "Vanilla" : "Mods"}
        </Link>
        <span className="text-[#4a4a4a]">/</span>
        <span className="text-ink">{inst.name}</span>
        <span className="flex-1" />
        <GameBar id={inst.id} consoleOpen={current.slug === "logs"} onToggleConsole={() => navigate(current.slug === "logs" ? `${base}/conteudo` : `${base}/logs`)} />
      </div>

      {/* Cabeçalho */}
      <div className="flex shrink-0 items-center gap-5 px-10 pt-7 pb-5">
        <div className="relative h-[88px] w-[88px] shrink-0 overflow-hidden bg-[#1c1c1c]">
          <InstanceCover instance={inst} mode="card" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <h1 className="m-0 truncate text-[26px] font-semibold">{inst.name}</h1>
          <div className="flex items-center gap-1.5">
            <Chip>{inst.mcVersion}</Chip>
            {inst.loader.type !== "Vanilla" && <Chip>{inst.loader.type}{inst.loader.version ? ` ${inst.loader.version}` : ""}</Chip>}
            <span className="pl-1.5 text-xs text-muted">
              {ago(inst.lastPlayedAt)}
              {inst.playTimeSecs > 0 && ` · ${playTime(inst.playTimeSecs)} jogadas`}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {downloading ? (
            <>
              <div className="flex h-11 w-[220px] flex-col justify-center gap-1.5 bg-[#1a1a1a] px-3.5">
                <div className="flex text-xs font-medium">
                  <span className="flex-1">{p!.stage === "loader" ? `Instalando ${inst.loader.type}` : "Baixando arquivos"}</span>
                  <span className="text-muted">{pct}%</span>
                </div>
                <div className="h-1 bg-[#2a2a2a]"><div className="h-full bg-ink transition-[width]" style={{ width: `${pct}%` }} /></div>
              </div>
              <Button variant="ghost" onClick={() => cancelInstall(inst.id)}>Cancelar</Button>
            </>
          ) : inGame ? (
            <div className="flex h-11 items-center gap-2.5 bg-raised px-6 text-sm font-semibold text-[#9a9a9a]">
              <span className="h-2 w-2 animate-pulse bg-[#9a9a9a]" /> Em jogo
            </div>
          ) : (
            <button onClick={() => play(inst.id)} className="flex h-11 items-center gap-2.5 bg-ink px-8 text-sm font-semibold text-[#111] hover:bg-white">
              <svg width="11" height="11" viewBox="0 0 12 12"><path d="M2 1 L11 6 L2 11 Z" fill="currentColor" /></svg>
              Jogar
            </button>
          )}
          <div ref={menuRef} className="relative">
            <button aria-label="Mais opções" onClick={() => setMenu((m) => !m)} className={`flex h-11 w-11 items-center justify-center text-[#bdbdbd] hover:bg-raised hover:text-ink ${menu ? "bg-raised text-ink" : "bg-[#1a1a1a]"}`}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect x="7" y="2" width="2.2" height="2.2" /><rect x="7" y="7" width="2.2" height="2.2" /><rect x="7" y="12" width="2.2" height="2.2" /></svg>
            </button>
            {menu && (
              <div className="absolute right-0 top-full z-20 mt-1 w-[210px] bg-[#1c1c1c] py-1.5 shadow-[0_12px_30px_rgba(0,0,0,0.5)]">
                <button className={item} onClick={() => { closeMenu(); api.openFolder(inst.id); }}>Abrir pasta</button>
                <button className={item} onClick={async () => { closeMenu(); try { const f = await extrasApi.exportInstance(inst.id); setNote(`Exportada em ${f}`); } catch (e) { setNote(String(e)); } }}>Exportar instância</button>
                <button className={item} onClick={() => { closeMenu(); navigate(`${base}/config`); }}>Configurações</button>
                <div className="my-1 h-px bg-line" />
                <button className={item.replace("text-ink", "text-[#e5484d]")} onClick={() => { closeMenu(); setConfirm(true); }}>Excluir instância</button>
              </div>
            )}
          </div>
        </div>
      </div>
      {note && <p className="m-0 shrink-0 truncate px-10 pb-2 text-xs text-muted">{note}</p>}

      {/* Abas */}
      <div className="flex shrink-0 gap-1 border-b border-line px-10">
        {tabs.map((t) => (
          <NavLink
            key={t.slug}
            to={`${base}/${t.slug}`}
            className={`relative px-3.5 py-3 text-[13px] font-medium no-underline transition-colors ${t.slug === current.slug ? "text-ink" : "text-[#7a7a7a] hover:text-soft"}`}
          >
            {t.label}
            {t.slug === current.slug && <span className="absolute right-0 bottom-[-1px] left-0 h-0.5 bg-ink" />}
          </NavLink>
        ))}
      </div>

      {/* Avisos (erro ao abrir, crash, download) */}
      <PlayTab instance={inst} hero={false} />

      <div className={`min-h-0 flex-1 ${current.slug === "logs" ? "" : "overflow-y-auto"}`}>
        {current.slug === "conteudo" ? (
          <ModsTab key={`${inst.id}-${modsVersion}`} instance={inst} />
        ) : current.slug === "logs" ? (
          <div className="h-full px-10 py-5"><ConsolePanel id={inst.id} full /></div>
        ) : current.slug === "prints" ? (
          <PrintsTab instance={inst} />
        ) : current.slug === "skins" ? (
          <InstanceSkinsTab key={inst.id} instance={inst} />
        ) : (
          <InstanceSettingsTab key={inst.id} instance={inst} />
        )}
      </div>

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
      )}
    </div>
  );
}

// ---------- PVP: continua como antes ----------

function PvpPage({ inst }: { inst: Instance }) {
  const { tab = "jogar" } = useParams();
  const { games } = useApp();
  const [consoleOpen, setConsoleOpen] = useState(false);
  const current = pvpTabs.find((t) => t.slug === tab) ?? pvpTabs[0];
  return (
    <div className="flex h-full flex-col">
      {games[inst.id]?.state === "running" && (
        <div className="flex h-11 shrink-0 items-center gap-2.5 bg-[#101010] pr-3 pl-5 text-[13px] font-medium">
          <span className="flex-1" />
          <GameBar id={inst.id} consoleOpen={consoleOpen} onToggleConsole={() => setConsoleOpen((v) => !v)} />
        </div>
      )}
      <div className="flex shrink-0 border-b border-line bg-bar">
        {pvpTabs.map((t) => (
          <NavLink
            key={t.slug}
            to={`/pvp/${t.slug}`}
            className={() =>
              `rog-tab ${t.slug === current.slug ? "active" : ""} group relative flex h-11 w-[180px] items-center gap-2.5 border-r border-line px-[18px] text-[13px] font-medium no-underline transition-colors ${
                t.slug === current.slug ? "bg-bg text-ink" : "text-[#7a7a7a] hover:bg-[#1a1a1a] hover:text-soft"
              }`
            }
          >
            {t.slug === current.slug && <span className="absolute top-0 left-0 h-0.5 w-full bg-[#e6e6e6]" />}
            <Icon name={t.icon} size={16} className={t.slug === current.slug ? "" : "opacity-45 group-hover:opacity-80"} />
            {t.label}
          </NavLink>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {current.slug === "jogar" ? <PvpPlay key={inst.id} instance={inst} /> : current.slug === "skins" ? <InstanceSkinsTab key={inst.id} instance={inst} /> : <InstanceSettingsTab key={inst.id} instance={inst} />}
      </div>
      {consoleOpen && <ConsolePanel id={inst.id} onClose={() => setConsoleOpen(false)} />}
    </div>
  );
}
