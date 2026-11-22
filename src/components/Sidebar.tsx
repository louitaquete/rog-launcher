import { useDismiss } from "../lib/useDismiss";
import { NavLink, useLocation } from "react-router-dom";
import type { IconName } from "./icons";
import { Icon } from "./ui";
import { useCallback, useState } from "react";
import { AnonymousHead, PlayerHead } from "./Avatar";
import { accountApi } from "../lib/api";
import { useApp } from "../lib/store";

const TOP = [
  { to: "/", icon: "home", label: "Início", kind: "" },
  { to: "/vanilla", icon: "vanilla", label: "Vanilla", kind: "vanilla" },
  { to: "/mods", icon: "mods", label: "Mods", kind: "mods" },
  { to: "/pvp", icon: "pvp", label: "PVP", kind: "pvp" },
] as const;
const BOTTOM = [
  { to: "/skin", icon: "skins", label: "Skin global", kind: "" },
  { to: "/config", icon: "settings", label: "Configurações", kind: "" },
] as const;

function Group({ items }: { items: readonly { to: string; icon: IconName; label: string; kind: string }[] }) {
  const { pathname } = useLocation();
  const { games, instances } = useApp();
  const playing = new Set((instances ?? []).filter((i) => games[i.id]?.state === "running").map((i) => i.kind as string));
  const active = items.findIndex((i) => (i.to === "/" ? pathname === "/" : pathname.startsWith(i.to)));
  return (
    <div className="relative">
      {/* A cápsula desliza até o item ativo em vez de piscar. */}
      <span
        className="pointer-events-none absolute top-[5px] left-2.5 h-11 w-11 rounded-[10px] bg-active transition-[transform,opacity] duration-200 ease-out"
        style={{ transform: `translateY(${Math.max(0, active) * 54}px)`, opacity: active < 0 ? 0 : 1 }}
      />
      {items.map((i, n) => (
        <NavLink key={i.to} to={i.to} aria-label={i.label} className="group relative flex h-[54px] w-16 items-center justify-center">
          <span className={`flex h-11 w-11 items-center justify-center rounded-[10px] transition-colors ${n === active ? "" : "group-hover:bg-raised"}`}>
            <Icon name={i.icon} size={22} className={`relative transition-opacity ${n === active ? "opacity-100" : "opacity-50 group-hover:opacity-85"}`} />
          </span>
          {i.kind && playing.has(i.kind) && <span className="absolute top-[7px] right-[11px] h-2.5 w-2.5 animate-[rog-breathe_2s_ease-in-out_infinite] rounded-full border-2 border-sidebar bg-playing" />}
          <span className="pointer-events-none absolute left-[70px] z-30 rounded-[6px] bg-active px-2.5 py-1.5 text-xs font-medium whitespace-nowrap text-ink opacity-0 shadow-[0_4px_12px_rgba(0,0,0,0.5)] transition-opacity group-hover:opacity-100">
            {i.label}
          </span>
        </NavLink>
      ))}
    </div>
  );
}

export function Sidebar() {
  return (
    <nav className="relative z-10 flex w-16 shrink-0 flex-col justify-between bg-sidebar py-2">
      <div>
        <Group items={TOP} />
        <span className="mx-auto mt-1.5 block h-px w-6 bg-line" />
      </div>
      <div>
        <Group items={BOTTOM} />
        <AccountButton />
      </div>
    </nav>
  );
}

/** Nick válido no Minecraft: 3–16 caracteres, letras, números e _. */
export const validNick = (n: string) => /^[A-Za-z0-9_]{3,16}$/.test(n);

/** Build de testes: no lugar da conta, um seletor de nick para o modo offline. */
function NickButton() {
  const { settings, updateSettings } = useApp();
  const nick = settings?.general.devNickname?.trim() || "Jogador";
  const [menu, setMenu] = useState(false);
  const [draft, setDraft] = useState(nick);
  const menuRef = useDismiss<HTMLDivElement>(menu, useCallback(() => setMenu(false), []));
  const ok = validNick(draft.trim());
  function save() {
    if (!ok) return;
    updateSettings((s) => ({ ...s, general: { ...s.general, devNickname: draft.trim() } }));
    setMenu(false);
  }
  return (
    <div ref={menuRef} className="relative">
      <button
        aria-label="Nick do modo offline"
        onClick={() => {
          setDraft(nick);
          setMenu((m) => !m);
        }}
        className="group flex h-16 w-16 items-center justify-center hover:bg-raised"
      >
        <span className="flex h-8 w-8 items-center justify-center bg-active font-brand text-sm font-bold text-ink">{nick.slice(0, 1).toUpperCase()}</span>
        {!menu && (
          <span className="pointer-events-none absolute left-[74px] z-30 rounded-[6px] bg-active px-2.5 py-1.5 text-xs font-medium whitespace-nowrap text-ink opacity-0 shadow-[0_4px_12px_rgba(0,0,0,0.5)] transition-opacity group-hover:opacity-100">
            {nick} · offline
          </span>
        )}
      </button>
      {menu && (
        <div className="absolute bottom-0 left-16 z-30 w-64 border border-edge bg-raised shadow-[0_8px_24px_rgba(0,0,0,0.6)]">
          <div className="border-b border-line px-4 py-3">
            <p className="m-0 text-sm font-semibold">Modo offline</p>
            <p className="m-0 text-xs text-muted">Build de testes · sem conta</p>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
            className="flex flex-col gap-2 px-4 py-3"
          >
            <label className="text-xs text-muted" htmlFor="rog-nick">Nick</label>
            <input
              id="rog-nick"
              autoFocus
              value={draft}
              maxLength={16}
              onChange={(e) => setDraft(e.target.value)}
              className="h-9 border border-edge bg-bar px-2.5 text-sm text-ink outline-none focus:border-soft"
            />
            {!ok && <p className="m-0 text-xs text-danger">3 a 16 caracteres: letras, números e _</p>}
            <button type="submit" disabled={!ok} className="h-9 bg-ink text-xs font-semibold text-[#111112] hover:bg-white disabled:opacity-40">
              Salvar nick
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function AccountButton() {
  const { devOffline } = useApp();
  return devOffline ? <NickButton /> : <MicrosoftAccountButton />;
}

function MicrosoftAccountButton() {
  const { account, setAccount, setLoginOpen } = useApp();
  const [menu, setMenu] = useState(false);
  const menuRef = useDismiss<HTMLDivElement>(menu, useCallback(() => setMenu(false), []));
  return (
    <div ref={menuRef} className="relative">
      <button
        aria-label="Conta"
        onClick={() => (account ? setMenu((m) => !m) : setLoginOpen(true))}
        className="group flex h-16 w-16 items-center justify-center hover:bg-raised"
      >
        {account ? <PlayerHead uuid={account.uuid} size={32} /> : <AnonymousHead size={32} />}
        {!menu && (
          <span className="pointer-events-none absolute left-[74px] z-30 rounded-[6px] bg-active px-2.5 py-1.5 text-xs font-medium whitespace-nowrap text-ink opacity-0 shadow-[0_4px_12px_rgba(0,0,0,0.5)] transition-opacity group-hover:opacity-100">
            {account ? account.name : "Entrar com a Microsoft"}
          </span>
        )}
      </button>
      {menu && account && (
        <div className="absolute bottom-0 left-16 z-30 w-56 border border-edge bg-raised shadow-[0_8px_24px_rgba(0,0,0,0.6)]">
          <div className="flex items-center gap-3 border-b border-line px-4 py-3">
            <PlayerHead uuid={account.uuid} size={28} />
            <div className="min-w-0">
              <p className="m-0 truncate text-sm font-semibold">{account.name}</p>
              <p className="m-0 text-xs text-muted">Conta Microsoft</p>
            </div>
          </div>
          <button
            onClick={async () => {
              await accountApi.logout();
              setAccount(null);
              setMenu(false);
            }}
            className="w-full px-4 py-2.5 text-left text-sm text-soft hover:bg-active"
          >
            Sair da conta
          </button>
        </div>
      )}
    </div>
  );
}
