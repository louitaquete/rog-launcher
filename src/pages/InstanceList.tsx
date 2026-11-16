import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { contentApi, type Instance, type Kind } from "../lib/api";
import { useApp } from "../lib/store";
import { InstanceCard, InstanceRow, NewInstanceCard, type CardInfo } from "../components/InstanceCard";
import { NewInstanceModal } from "../components/NewInstanceModal";
import { ImportModal } from "../components/ImportModal";
import { ModsTabs } from "./ExploreModpacks";
import { Button, Icon, PageHeader } from "../components/ui";

interface Prefs { sort: "recent" | "name" | "time"; group: "pinned" | "loader" | "version" | "none"; view: "grid" | "list" }
const loadPrefs = (): Prefs => {
  try { return { sort: "recent", group: "pinned", view: "grid", ...JSON.parse(localStorage.getItem("rog.lib") || "{}") }; } catch { return { sort: "recent", group: "pinned", view: "grid" }; }
};

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
  const [query, setQuery] = useState("");
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const setPref = (p: Partial<Prefs>) => setPrefs((old) => { const n = { ...old, ...p }; try { localStorage.setItem("rog.lib", JSON.stringify(n)); } catch { /* sem armazenamento */ } return n; });
  const [info, setInfo] = useState<Record<string, CardInfo>>({});
  const ids = (instances ?? []).filter((i) => i.kind === "mods").map((i) => i.id).join(",");
  // Quantos mods cada instância tem (e quantas atualizações a aba Conteúdo encontrou da última vez).
  useEffect(() => {
    let live = true;
    for (const id of ids ? ids.split(",") : []) {
      contentApi.list(id).then((l) => {
        if (!live) return;
        let updates = 0;
        try { updates = Number(localStorage.getItem(`rog.updates.${id}`)) || 0; } catch { /* sem armazenamento */ }
        setInfo((m) => ({ ...m, [id]: { mods: l.filter((x) => x.kind === "mod").length, updates } }));
      }).catch(() => {});
    }
    return () => { live = false; };
  }, [ids]);

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

  // Preferências da biblioteca (ordem, grupos e visão), lembradas por aba.
  const total = list.reduce((n, i) => n + i.playTimeSecs, 0);
  const q = query.trim().toLowerCase();
  const shown = list
    .filter((i) => !q || i.name.toLowerCase().includes(q) || i.mcVersion.includes(q) || i.loader.type.toLowerCase().includes(q))
    .sort((a, b) => (prefs.sort === "name" ? a.name.localeCompare(b.name) : prefs.sort === "time" ? b.playTimeSecs - a.playTimeSecs : (b.lastPlayedAt ?? 0) - (a.lastPlayedAt ?? 0) || b.createdAt - a.createdAt));
  const lastId = [...list].filter((i) => i.lastPlayedAt).sort((a, b) => b.lastPlayedAt! - a.lastPlayedAt!)[0]?.id;
  const keyOf = (i: Instance) => (prefs.group === "pinned" ? (i.pinned ? "Fixadas" : "Todas") : prefs.group === "loader" ? i.loader.type : prefs.group === "version" ? i.mcVersion.split(".").slice(0, 2).join(".") : "");
  const groups: { name: string; items: Instance[] }[] = [];
  for (const i of shown) {
    const k = keyOf(i);
    (groups.find((g) => g.name === k) ?? groups[groups.push({ name: k, items: [] }) - 1]).items.push(i);
  }
  if (prefs.group === "pinned") groups.sort((a, b) => (a.name === "Fixadas" ? -1 : b.name === "Fixadas" ? 1 : 0));
  else groups.sort((a, b) => b.name.localeCompare(a.name, undefined, { numeric: true }));
  // O destaque largo vai na frente do grupo em que estiver.
  for (const g of groups) g.items.sort((a, b) => (a.id === lastId ? -1 : b.id === lastId ? 1 : 0));
  const wideOk = prefs.view === "grid" && !q && list.length > 1;
  const sel = "h-10 cursor-pointer border-0 bg-transparent pr-2 text-sm font-medium text-ink outline-none";
  const lab = "flex h-10 shrink-0 items-center gap-2 rounded-[6px] bg-surface pl-3 text-sm text-muted";

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto px-10 pt-7 pb-8">
      <PageHeader
        title={title}
        subtitle={list.length ? `${list.length} ${list.length === 1 ? "instância" : "instâncias"}${total >= 3600 ? `, ${Math.round(total / 3600)} h jogadas no total` : ""}` : subtitle || "Nenhuma instância ainda"}
        actions={
          <>
            <Button variant="ghost" onClick={doImport}>Importar</Button>
            <Button variant="primary" onClick={() => setCreating(true)}>+ Nova instância</Button>
          </>
        }
      />
      {filter === "mods" && <ModsTabs />}
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
        <>
          <div className="flex shrink-0 flex-wrap items-center gap-2.5">
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar instância…" className="h-10 w-[300px] max-w-full border border-transparent bg-surface px-3.5 text-sm text-ink outline-none placeholder:text-[#55555b] focus:border-[#5a5a5f]" />
            <label className={lab}>Ordenar
              <select value={prefs.sort} onChange={(e) => setPref({ sort: e.target.value as Prefs["sort"] })} className={sel}>
                <option value="recent">Jogadas recentemente</option><option value="name">Nome</option><option value="time">Tempo de jogo</option>
              </select>
            </label>
            <label className={lab}>Agrupar
              <select value={prefs.group} onChange={(e) => setPref({ group: e.target.value as Prefs["group"] })} className={sel}>
                <option value="pinned">Fixadas primeiro</option><option value="loader">Por loader</option><option value="version">Por versão</option><option value="none">Sem grupos</option>
              </select>
            </label>
            <span className="flex-1" />
            <div className="flex gap-0.5 rounded-[6px] bg-surface p-1">
              {(["grid", "list"] as const).map((v) => (
                <button key={v} aria-label={v === "grid" ? "Ver em grade" : "Ver em lista"} title={v === "grid" ? "Grade" : "Lista"} onClick={() => setPref({ view: v })} className={`flex h-8 w-8 items-center justify-center !rounded-[4px] ${prefs.view === v ? "bg-active text-ink" : "text-muted hover:text-ink"}`}>
                  {v === "grid" ? (
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect x="2" y="2" width="5" height="5" rx="1.2" /><rect x="9" y="2" width="5" height="5" rx="1.2" /><rect x="2" y="9" width="5" height="5" rx="1.2" /><rect x="9" y="9" width="5" height="5" rx="1.2" /></svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M2.5 4h11M2.5 8h11M2.5 12h11" /></svg>
                  )}
                </button>
              ))}
            </div>
          </div>

          {shown.length === 0 && <p className="m-0 py-10 text-center text-sm text-muted">Nenhuma instância com “{query}”.</p>}
          {prefs.view === "list" && shown.length > 0 && (
            <div className="flex shrink-0 items-center gap-3.5 px-3.5 text-xs font-medium text-muted">
              <span className="w-14 shrink-0" /><span className="flex-1">Instância</span><span className="w-[190px] shrink-0">Versão</span><span className="w-[70px] shrink-0">Mods</span><span className="w-[110px] shrink-0">Tempo de jogo</span><span className="w-[130px] shrink-0">Última vez</span><span className="w-[150px] shrink-0" />
            </div>
          )}
          {groups.map((g, gi) => (
            <section key={g.name || "all"} className="flex shrink-0 flex-col gap-3">
              {g.name && (groups.length > 1 || g.name === "Fixadas") && (
                <p className="m-0 flex items-center gap-2 pt-1 text-xs font-medium text-soft">{g.name}<span className="font-normal text-muted">{g.items.length}</span></p>
              )}
              {prefs.view === "grid" ? (
                <div className="rog-cascade grid auto-rows-[300px] grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
                  {g.items.map((i) => <InstanceCard key={i.id} instance={i} wide={wideOk && i.id === lastId} info={info[i.id]} />)}
                  {gi === groups.length - 1 && !q && <NewInstanceCard onClick={() => setCreating(true)} />}
                </div>
              ) : (
                <div className="rog-cascade flex flex-col gap-2">{g.items.map((i) => <InstanceRow key={i.id} instance={i} info={info[i.id]} />)}</div>
              )}
            </section>
          ))}
        </>
      )}
      {modal}
      {importModal}
    </div>
  );
}
