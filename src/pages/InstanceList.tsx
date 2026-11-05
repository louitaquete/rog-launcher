import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { extrasApi, type Kind } from "../lib/api";
import { useApp } from "../lib/store";
import { InstanceCard, NewInstanceCard } from "../components/InstanceCard";
import { NewInstanceModal } from "../components/NewInstanceModal";
import { Button, Icon, PageHeader, SectionLabel } from "../components/ui";

const copy = {
  all: { title: "Início", subtitle: "Todas as suas instâncias em um só lugar" },
  vanilla: { title: "Vanilla", subtitle: "Instâncias sem mods, do jeito que a Mojang fez" },
  mods: { title: "Mods", subtitle: "Instâncias com loader e mods" },
};

// Vanilla e PVP primeiro, depois as de mods.
const order: Record<Kind, number> = { vanilla: 0, pvp: 1, mods: 2 };

export function InstanceList({ filter }: { filter: "all" | "vanilla" | "mods" }) {
  const { instances } = useApp();
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();
  const { refresh, setLoginOpen } = useApp();
  const [importMsg, setImportMsg] = useState<string | null>(null);
  async function doImport() {
    setImportMsg(null);
    try {
      const inst = await extrasApi.importInstance();
      if (!inst) return;
      await refresh();
      navigate(`/${inst.kind}/${inst.id}/jogar`);
    } catch (e) {
      setImportMsg(String(e));
    }
  }
  const { title, subtitle } = copy[filter];

  const list = (instances ?? []).filter((i) => filter === "all" || i.kind === filter).sort((a, b) => order[a.kind] - order[b.kind]);
  const firstRun = filter === "all" && instances !== null && !instances.some((i) => i.kind !== "pvp");
  const modal = creating && <NewInstanceModal onClose={() => setCreating(false)} defaultKind={filter === "mods" ? "mods" : "vanilla"} />;

  if (firstRun) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
        <Icon name="logo" size={90} />
        <h1 className="m-0 text-[26px] font-semibold">Bem-vindo ao Rog Launcher</h1>
        <p className="m-0 max-w-[460px] text-sm leading-relaxed text-muted">
          Comece criando sua primeira instância ou traga as que você já tem em outros launchers.
        </p>
        <div className="flex gap-2.5 pt-2">
          <Button variant="primary" onClick={() => setCreating(true)}>+ Nova instância</Button>
          <Button variant="outline" onClick={doImport}>Importar</Button>
        </div>
        <div className="flex gap-3 pt-6">
          {[
            { t: "Vanilla", d: "Minecraft puro, última versão", go: () => setCreating(true) },
            { t: "PVP", d: "Versões de combate prontas", go: () => navigate("/pvp") },
            { t: "Conectar conta", d: "Entre com a Microsoft", go: () => setLoginOpen(true) },
          ].map((q) => (
            <button key={q.t} onClick={q.go} className="w-[220px] border border-line bg-surface px-[18px] py-4 text-left hover:border-edge hover:bg-raised">
              <p className="m-0 text-sm font-semibold text-ink">{q.t}</p>
              <p className="m-0 mt-1 text-xs text-muted">{q.d}</p>
            </button>
          ))}
        </div>
        {importMsg && <p className="m-0 text-xs text-[#9a9a9a]">{importMsg}</p>}
        {modal}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-7 overflow-y-auto px-10 py-8">
      <PageHeader
        title={title}
        subtitle={subtitle}
        actions={
          <>
            {importMsg && <span className="max-w-[320px] truncate text-xs text-[#9a9a9a]" title={importMsg}>{importMsg}</span>}
            <Button variant="dark" className="border border-edge" onClick={doImport}>Importar</Button>
            <Button variant="primary" onClick={() => setCreating(true)}>+ Nova instância</Button>
          </>
        }
      />
      <SectionLabel>Instâncias</SectionLabel>
      <div className="flex flex-wrap gap-5">
        {list.map((i) => (
          <InstanceCard key={i.id} instance={i} />
        ))}
        <NewInstanceCard onClick={() => setCreating(true)} />
      </div>
      {modal}
    </div>
  );
}
