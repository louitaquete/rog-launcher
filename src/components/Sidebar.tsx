import { NavLink } from "react-router-dom";
import type { IconName } from "./icons";
import { Icon } from "./ui";
import { useState } from "react";
import { AnonymousHead, PlayerHead } from "./Avatar";
import { accountApi } from "../lib/api";
import { useApp } from "../lib/store";

function NavItem({ to, icon, label, end }: { to: string; icon: IconName; label: string; end?: boolean }) {
  return (
    <NavLink to={to} end={end} aria-label={label} className="group relative block">
      {({ isActive }) => (
        <span
          className={`flex h-16 w-16 items-center justify-center transition-colors ${isActive ? "bg-active" : "hover:bg-raised"}`}
        >
          {isActive && <span className="absolute top-0 left-0 h-16 w-[3px] bg-[#e6e6e6]" />}
          <Icon
            name={icon}
            className={`transition-opacity ${isActive ? "opacity-100" : "opacity-45 group-hover:opacity-80"}`}
          />
          {/* Tooltip */}
          <span className="pointer-events-none absolute left-[74px] z-30 border border-edge bg-[#262626] px-2.5 py-1.5 text-xs font-medium whitespace-nowrap text-ink opacity-0 shadow-[0_4px_12px_rgba(0,0,0,0.5)] transition-opacity group-hover:opacity-100">
            {label}
          </span>
        </span>
      )}
    </NavLink>
  );
}

export function Sidebar() {
  return (
    <nav className="relative z-10 flex w-16 shrink-0 flex-col justify-between border-r border-line bg-sidebar py-2 shadow-[4px_0_16px_rgba(0,0,0,0.5)]">
      <div>
        <NavItem to="/" end icon="home" label="Início" />
        <NavItem to="/vanilla" icon="vanilla" label="Vanilla" />
        <NavItem to="/mods" icon="mods" label="Mods" />
        <NavItem to="/pvp" icon="pvp" label="PVP" />
      </div>
      <div>
        <NavItem to="/skin" icon="skins" label="Skin global" />
        <NavItem to="/config" icon="settings" label="Configurações" />
        <AccountButton />
      </div>
    </nav>
  );
}

function AccountButton() {
  const { account, setAccount, setLoginOpen } = useApp();
  const [menu, setMenu] = useState(false);
  return (
    <div className="relative" onMouseLeave={() => setMenu(false)}>
      <button
        aria-label="Conta"
        onClick={() => (account ? setMenu((m) => !m) : setLoginOpen(true))}
        className="group flex h-16 w-16 items-center justify-center hover:bg-raised"
      >
        {account ? <PlayerHead uuid={account.uuid} size={32} /> : <AnonymousHead size={32} />}
        {!menu && (
          <span className="pointer-events-none absolute left-[74px] z-30 border border-edge bg-[#262626] px-2.5 py-1.5 text-xs font-medium whitespace-nowrap text-ink opacity-0 shadow-[0_4px_12px_rgba(0,0,0,0.5)] transition-opacity group-hover:opacity-100">
            {account ? account.name : "Entrar com a Microsoft"}
          </span>
        )}
      </button>
      {menu && account && (
        <div className="absolute bottom-0 left-16 z-30 w-56 border border-edge bg-[#1c1c1c] shadow-[0_8px_24px_rgba(0,0,0,0.6)]">
          <div className="flex items-center gap-3 border-b border-line px-4 py-3">
            <PlayerHead uuid={account.uuid} size={28} />
            <div className="min-w-0">
              <p className="m-0 truncate text-sm font-semibold">{account.name}</p>
              <p className="m-0 text-[11px] text-muted">Conta Microsoft</p>
            </div>
          </div>
          <button
            onClick={async () => {
              await accountApi.logout();
              setAccount(null);
              setMenu(false);
            }}
            className="w-full px-4 py-2.5 text-left text-[13px] text-[#d0d0d0] hover:bg-active"
          >
            Sair da conta
          </button>
        </div>
      )}
    </div>
  );
}
