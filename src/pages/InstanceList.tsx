import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Kind } from "../lib/api";
import { useApp } from "../lib/store";
import { InstanceCard, NewInstanceCard } from "../components/InstanceCard";
import { NewInstanceModal } from "../components/NewInstanceModal";
import { ImportModal } from "../components/ImportModal";
import { ModsTabs } from "./ExploreModpacks";
import { Button, Icon, PageHeader, SectionLabel } from "../components/ui";

const copy = {
  all: { title: "Início", subtitle: "Todas as suas instâncias em um só lugar" },
  vanilla: { title: "Vanilla", subtitle: "Instâncias sem mods, do jeito que a Mojang fez" },
  mods: { title: "Mods", subtitle: "" },
};

// Vanilla e PVP primeiro, depois as de mods.
const order: Record<Kind, number> = { vanilla: 0, pvp: 1, mods: 2 };

export function InstanceList({ filter }: { filter: "all" | "vanilla" | "mods" }) {
  const { instances } = useApp();
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();
  const { setLoginOpen } = useApp();
  const [importing, setImporting] = useState(false);
  const doImport = () => setImporting(true);
  const importModal = importing && <ImportModal onClose={() => setImporting(false)} />;
  const { title, subtitle } = copy[filter];

  const list = (instances ?? []).filter((i) => filter === "all" || i.kind === filter).sort((a, b) => order[a.kind] - order[b.kind]);
  const firstRun = filter === "all" && instances !== null && !instances.some((i) => i.kind !== "pvp");
  const modal = creating && <NewInstanceModal onClose={() => setCreating(false)} onImport={doImport} />;

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
            <button key={q.t} onClick={q.go} className="w-[220px] !rounded-[10px] bg-surface px-[18px] py-4 text-left hover:bg-raised">
              <p className="m-0 text-sm font-semibold text-ink">{q.t}</p>
              <p className="m-0 mt-1 text-xs text-muted">{q.d}</p>
            </button>
          ))}
        </div>
        {modal}
        {importModal}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-7 overflow-y-auto px-10 py-8">
      <PageHeader
        title={title}
        subtitle={subtitle || `${list.length} ${list.length === 1 ? "instância" : "instâncias"}`}
        actions={
          <>
            <Button variant="dark" onClick={doImport}>Importar</Button>
            <Button variant="primary" onClick={() => setCreating(true)}>+ Nova instância</Button>
          </>
        }
      />
      {filter === "mods" ? <ModsTabs /> : <SectionLabel>Instâncias</SectionLabel>}
      {list.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2.5 pb-10 text-center">
          <span className="mb-2.5 flex h-28 w-28 items-center justify-center rounded-[14px] bg-surface"><Icon name={filter === "mods" ? "mods" : "vanilla"} size={52} className="opacity-45" /></span>
          <h2 className="m-0 text-xl font-semibold text-ink">{filter === "mods" ? "Sua forja está vazia" : "Nenhuma instância ainda"}</h2>
          <p className="m-0 text-sm text-muted">{filter === "mods" ? "Crie uma instância do zero ou instale um modpack pronto." : "Crie a primeira e ela aparece aqui."}</p>
          <div className="flex gap-2.5 pt-3.5">
            <Button variant="primary" onClick={() => setCreating(true)}>+ Nova instância</Button>
            {filter === "mods" && <Button variant="dark" onClick={() => navigate("/mods/explorar")}>Explorar modpacks</Button>}
          </div>
        </div>
      ) : (
        <div className="rog-cascade grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-4">
          {list.map((i) => (
            <InstanceCard key={i.id} instance={i} />
          ))}
          <NewInstanceCard onClick={() => setCreating(true)} />
        </div>
      )}
      {modal}
      {importModal}
    </div>
  );
}
