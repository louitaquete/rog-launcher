import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LoaderIcon } from "../components/LoaderIcon";
import { useApp } from "../lib/store";
import { extrasApi, loaderApi, type LoaderType, type LoaderVersion } from "../lib/api";
import { api, cfApi, contentApi, openUrl, type ContentItem, type ContentKind, type Instance } from "../lib/api";
import { checkUpdates, fmtCount, install, kindsFor, search, type Hit, type Sort } from "../lib/modrinth";
import { Segmented, Select, Toggle } from "../components/ui";

const kindLabel: Record<ContentKind, string> = { mod: "Mods", resourcepack: "Resource packs", shader: "Shaders" };

type KindFilter = "all" | ContentKind;
const SRC: Record<string, string> = { modrinth: "Modrinth", curseforge: "CurseForge" };
const keyOf = (i: ContentItem) => `${i.kind}/${i.file}`;
const pill = (on: boolean) => `shrink-0 px-3 py-1.5 text-sm font-medium ${on ? "bg-ink text-[#111112]" : "bg-surface text-soft hover:bg-raised hover:text-ink"}`;
const Up = ({ size = 14 }: { size?: number }) => <svg width={size} height={size} viewBox="0 0 16 16" fill="none"><path d="M8 12.5V4M4.5 7.5L8 4l3.5 3.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>;

function ProjectIcon({ url, size = 36, dim }: { url: string | null | undefined; size?: number; dim?: boolean }) {
  const cls = `shrink-0 rounded-[6px] bg-active object-cover ${dim ? "opacity-45" : ""}`;
  return url ? <img src={url} alt="" loading="lazy" className={cls} style={{ width: size, height: size }} /> : <div className={cls} style={{ width: size, height: size }} />;
}

/** Aba Conteúdo: o que está instalado e, ao lado, o que dá para instalar nesta instância. */
export function ModsTab({ instance }: { instance: Instance }) {
  const kinds = kindsFor(instance);
  const [mode, setMode] = useState<"installed" | "discover">("installed");
  const [items, setItems] = useState<ContentItem[] | null>(null);
  const [updates, setUpdates] = useState<Record<string, string>>({});

  const reload = useCallback(() => contentApi.list(instance.id).then(setItems), [instance.id]);
  useEffect(() => {
    reload();
  }, [reload]);

  // Procura versões novas sempre que a lista muda; a biblioteca usa essa contagem nos cards.
  const sig = (items ?? []).map((i) => i.meta?.versionId ?? i.file).join(",");
  useEffect(() => {
    if (!items) return;
    let live = true;
    checkUpdates(instance, items).then((u) => {
      if (!live) return;
      setUpdates(u);
      try { localStorage.setItem(`rog.updates.${instance.id}`, String(Object.keys(u).length)); } catch { /* sem armazenamento */ }
    });
    return () => {
      live = false;
    };
  }, [sig, instance.id]);

  return (
    <div className="flex min-h-full flex-col gap-3 px-10 py-[18px]">
      {instance.loader.type === "Vanilla" && <AddLoader instance={instance} />}
      {mode === "installed" ? (
        <Installed instance={instance} items={items} kinds={kinds} updates={updates} reload={reload} mode={<ModeSwitch mode={mode} setMode={setMode} n={items?.length ?? 0} />} onDiscover={() => setMode("discover")} />
      ) : (
        <Discover instance={instance} kinds={kinds} installed={items ?? []} reload={reload} mode={<ModeSwitch mode={mode} setMode={setMode} n={items?.length ?? 0} />} />
      )}
    </div>
  );
}

function ModeSwitch({ mode, setMode, n }: { mode: "installed" | "discover"; setMode: (m: "installed" | "discover") => void; n: number }) {
  return <Segmented value={mode} onChange={setMode} options={[{ value: "installed", label: `Instalados · ${n}` }, { value: "discover", label: "Descobrir" }]} />;
}

function Installed({ instance, items, kinds, updates, reload, mode, onDiscover }: { instance: Instance; items: ContentItem[] | null; kinds: ContentKind[]; updates: Record<string, string>; reload: () => Promise<void>; mode: React.ReactNode; onDiscover: () => void }) {
  const [q, setQ] = useState("");
  const [show, setShow] = useState<"all" | "on" | "off" | "updates">("all");
  const [kind, setKind] = useState<KindFilter>("all");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [armed, setArmed] = useState<string | null>(null);
  const all = items ?? [];
  const upOf = (i: ContentItem) => (i.meta ? updates[i.meta.projectId] : undefined);
  const neededBy = (i: ContentItem) => (i.meta ? all.filter((o) => o.meta?.deps?.includes(i.meta!.projectId)).length : 0);
  const text = q.trim().toLowerCase();
  const list = all.filter((i) => (kind === "all" || i.kind === kind) && (!text || (i.meta?.title ?? i.file).toLowerCase().includes(text)) && (show === "all" || (show === "on" && i.enabled) || (show === "off" && !i.enabled) || (show === "updates" && !!upOf(i))));
  const own = list.filter((i) => !i.meta?.auto), libs = list.filter((i) => i.meta?.auto);
  const withUp = all.filter((i) => upOf(i));
  const picked = all.filter((i) => sel.has(keyOf(i)));

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    try { await fn(); } catch { /* o item que falhou fica como estava */ }
    await reload();
    setBusy(null);
  };
  const update = (l: ContentItem[]) => run("Atualizando…", async () => { for (const i of l) if (i.meta && upOf(i)) await install(instance, i.kind, i.meta.projectId, new Set(), !!i.meta.auto); });
  const toggleSel = (i: ContentItem) => setSel((s) => { const n = new Set(s); n.has(keyOf(i)) ? n.delete(keyOf(i)) : n.add(keyOf(i)); return n; });

  const row = (i: ContentItem) => {
    const k = keyOf(i), on = sel.has(k), up = upOf(i), need = i.meta?.auto ? neededBy(i) : 0;
    return (
      <div key={k} className={`group flex items-center gap-3.5 rounded-[10px] border px-3.5 py-2 ${on ? "border-muted bg-raised" : "border-transparent bg-surface hover:bg-raised"}`}>
        <button role="checkbox" aria-checked={on} aria-label={`Selecionar ${i.meta?.title ?? i.file}`} onClick={() => toggleSel(i)} className={`h-[18px] w-[18px] shrink-0 !rounded-[5px] ${on ? "flex items-center justify-center bg-ink" : `border-[1.5px] border-[#55555b] ${sel.size ? "" : "hidden group-hover:block focus-visible:block"}`}`}>
          {on && <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M3.5 8.5l3 3 6-7" stroke="#111112" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
        </button>
        <ProjectIcon url={i.meta?.iconUrl} dim={!i.enabled} />
        <div className="min-w-0 flex-1">
          <p className={`m-0 truncate text-sm font-medium ${i.enabled ? "text-ink" : "text-muted"}`}>{i.meta?.title ?? i.file}</p>
          <p className="m-0 truncate text-xs text-muted">{i.meta ? `${i.meta.versionNumber} · ${SRC[i.meta.source] ?? i.meta.source}` : "adicionado manualmente"}{i.enabled ? "" : " · desativado"}</p>
        </div>
        {need > 0 && <span className="shrink-0 text-xs text-muted">Necessária para {need} {need === 1 ? "mod" : "mods"}</span>}
        {up && (
          <button onClick={() => update([i])} disabled={!!busy} title={`Atualizar para ${up}`} className="flex shrink-0 items-center gap-1.5 bg-update/15 px-2.5 py-1 text-xs font-medium text-update hover:bg-update/25 disabled:opacity-50">
            <Up /> {up}
          </button>
        )}
        <div className="hidden shrink-0 gap-1.5 group-hover:flex group-focus-within:flex">
          {i.meta?.source === "modrinth" && (
            <button title="Abrir página" aria-label="Abrir página" onClick={() => openUrl(`https://modrinth.com/project/${i.meta!.projectId}`)} className="flex h-8 w-8 items-center justify-center bg-active text-soft hover:text-ink">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 3h4v4M13 3L7.5 8.5M11 9.5V13H3V5h3.5" /></svg>
            </button>
          )}
          <button
            title={need && armed !== k ? `Remover (${need} ${need === 1 ? "mod precisa" : "mods precisam"} dela)` : "Remover"}
            aria-label="Remover"
            onClick={() => (need && armed !== k ? setArmed(k) : run("Removendo…", () => contentApi.remove(instance.id, i.kind, i.file)))}
            className={`flex h-8 items-center justify-center gap-1.5 px-2 ${armed === k ? "bg-danger text-xs font-medium text-[#111112]" : "w-8 bg-active text-soft hover:text-danger"}`}
          >
            {armed === k ? "Remover mesmo assim" : <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5" /></svg>}
          </button>
        </div>
        <Toggle on={i.enabled} onChange={(v) => contentApi.toggle(instance.id, i.kind, i.file, v).then(reload)} />
      </div>
    );
  };
  const group = (title: string, note: string | null, l: ContentItem[]) =>
    l.length > 0 && (
      <section className="flex flex-col gap-2">
        <p className="m-0 flex items-baseline gap-2 pt-1.5 text-xs font-medium text-soft">{title} · {l.length}{note && <span className="font-normal text-muted">{note}</span>}</p>
        {l.map(row)}
      </section>
    );

  return (
    <>
      <div className="flex flex-wrap items-center gap-2.5">
        {mode}
        <span className="flex-1" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar nos instalados…" className="h-10 w-[260px] border border-transparent bg-surface px-3.5 text-sm text-ink outline-none placeholder:text-[#55555b] focus:border-[#5a5a5f]" />
        <label className="flex h-10 items-center gap-2 rounded-[6px] bg-surface pl-3 text-sm text-muted">Mostrar
          <select value={show} onChange={(e) => setShow(e.target.value as typeof show)} className="h-10 cursor-pointer border-0 bg-transparent pr-2 text-sm font-medium text-ink outline-none">
            <option value="all">Todos</option><option value="on">Ativos</option><option value="off">Desativados</option><option value="updates">Com atualização</option>
          </select>
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button className={pill(kind === "all")} onClick={() => setKind("all")}>Tudo</button>
        {kinds.map((k) => <button key={k} className={pill(kind === k)} onClick={() => setKind(k)}>{kindLabel[k]} · {all.filter((i) => i.kind === k).length}</button>)}
        <span className="flex-1" />
        <button onClick={() => api.openFolder(instance.id)} className="p-0 text-xs text-muted hover:text-ink">Para adicionar arquivos seus, abra a pasta da instância</button>
      </div>

      {withUp.length > 0 && (
        <div className="flex items-center gap-3 rounded-[10px] bg-update/10 px-4 py-2.5">
          <span className="text-update"><Up size={16} /></span>
          <p className="m-0 text-sm font-medium text-ink">{withUp.length === 1 ? "1 item tem atualização" : `${withUp.length} itens têm atualização`}</p>
          <p className="m-0 min-w-0 flex-1 truncate text-xs text-soft">{withUp.slice(0, 3).map((i) => i.meta!.title).join(", ")}{withUp.length > 3 ? ` e mais ${withUp.length - 3}` : ""}</p>
          <button disabled={!!busy} onClick={() => update(withUp)} className="shrink-0 bg-active px-3 py-1.5 text-sm font-medium text-ink hover:bg-[#34343a] disabled:opacity-50">{busy ?? (withUp.length === 1 ? "Atualizar" : `Atualizar os ${withUp.length}`)}</button>
        </div>
      )}

      {items === null ? (
        Array.from({ length: 5 }, (_, n) => <div key={n} className="h-[52px] animate-pulse rounded-[10px] bg-surface" style={{ opacity: 1 - n * 0.16 }} />)
      ) : all.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2.5 py-14 text-center">
          <p className="m-0 text-xl font-semibold text-ink">Nada instalado ainda</p>
          <p className="m-0 text-sm text-muted">Encontre mods, resource packs e shaders que funcionam nesta instância.</p>
          <button onClick={onDiscover} className="mt-3 bg-ink px-5 py-2.5 text-sm font-semibold text-[#111112] hover:bg-white">Descobrir conteúdo</button>
        </div>
      ) : list.length === 0 ? (
        <p className="m-0 py-10 text-center text-sm text-muted">Nada encontrado com esses filtros.</p>
      ) : (
        <>
          {group(kind === "all" ? "Seus itens" : `Seus ${kindLabel[kind].toLowerCase()}`, null, own)}
          {group("Bibliotecas", "instaladas automaticamente porque outros mods precisam delas", libs)}
        </>
      )}

      {picked.length > 0 && (
        <div className="sticky bottom-4 z-10 mt-auto flex items-center gap-1.5 self-center rounded-[10px] bg-active py-2 pr-2 pl-[18px] shadow-[0_14px_36px_rgba(0,0,0,0.55)]">
          <span className="pr-3 text-sm font-medium text-ink">{busy ?? `${picked.length} ${picked.length === 1 ? "selecionado" : "selecionados"}`}</span>
          {[["Ativar", () => run("Ativando…", async () => { for (const i of picked) await contentApi.toggle(instance.id, i.kind, i.file, true); })], ["Desativar", () => run("Desativando…", async () => { for (const i of picked) await contentApi.toggle(instance.id, i.kind, i.file, false); })]].map(([t, fn]) => (
            <button key={t as string} disabled={!!busy} onClick={fn as () => void} className="px-3 py-1.5 text-sm font-medium text-soft hover:bg-[#34343a] hover:text-ink disabled:opacity-50">{t as string}</button>
          ))}
          {picked.some(upOf) && <button disabled={!!busy} onClick={() => update(picked)} className="px-3 py-1.5 text-sm font-medium text-soft hover:bg-[#34343a] hover:text-ink disabled:opacity-50">Atualizar</button>}
          <button disabled={!!busy} onClick={() => run("Removendo…", async () => { for (const i of picked) await contentApi.remove(instance.id, i.kind, i.file); setSel(new Set()); })} className="px-3 py-1.5 text-sm font-medium text-danger hover:bg-danger/15 disabled:opacity-50">Remover</button>
          <button aria-label="Limpar seleção" onClick={() => setSel(new Set())} className="flex h-8 w-8 items-center justify-center text-soft hover:text-ink">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M4 4l8 8M12 4l-8 8" /></svg>
          </button>
        </div>
      )}
    </>
  );
}

type DSrc = "modrinth" | "curseforge";
type DHit = Hit & { src: DSrc };

function Discover({ instance, kinds, installed, reload, mode }: { instance: Instance; kinds: ContentKind[]; installed: ContentItem[]; reload: () => Promise<void>; mode: React.ReactNode }) {
  const [kind, setKind] = useState<ContentKind>(kinds[0]);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("relevance");
  const [source, setSource] = useState<"all" | DSrc>("all");
  const [cf, setCf] = useState(false);
  const [hits, setHits] = useState<DHit[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Record<string, string>>({});
  const seq = useRef(0), page = useRef(0);
  useEffect(() => {
    cfApi.available().then(setCf).catch(() => setCf(false));
  }, []);

  const load = useCallback(
    async (more: boolean) => {
      const n = ++seq.current, pg = more ? page.current + 1 : 0;
      setLoading(true);
      setError(null);
      const want: DSrc[] = source === "all" ? (cf ? ["modrinth", "curseforge"] : ["modrinth"]) : [source];
      const res = await Promise.allSettled(want.map((s) => (s === "modrinth" ? search(instance, kind, query, sort, pg * 24) : cfApi.search(kind, instance.mcVersion, instance.loader.type, query, sort, pg * 20))));
      if (n !== seq.current) return;
      const lists: DHit[][] = [];
      let sum = 0;
      res.forEach((r, i) => { if (r.status === "fulfilled") { lists.push(r.value.hits.map((h) => ({ ...h, src: want[i] }))); sum += r.value.total_hits; } });
      const merged: DHit[] = [];
      for (let i = 0; lists.some((l) => i < l.length); i++) for (const l of lists) if (l[i]) merged.push(l[i]);
      if (!lists.length) {
        const msg = String((res[0] as PromiseRejectedResult).reason);
        setError(msg.includes("403") ? "O CurseForge recusou a chave do launcher." : `Não deu para buscar: ${msg.replace(/^Error: /, "")}`);
      }
      page.current = pg;
      setHits((old) => (more ? [...old, ...merged] : merged));
      setTotal(sum);
      setLoading(false);
    },
    [instance, kind, query, sort, source, cf],
  );
  useEffect(() => {
    const t = setTimeout(() => load(false), 300);
    return () => clearTimeout(t);
  }, [load]);

  const has = (h: DHit) => installed.some((i) => i.meta?.projectId === h.project_id);
  const id = (h: DHit) => h.src + h.project_id;
  async function add(h: DHit) {
    setBusy((b) => ({ ...b, [id(h)]: "installing" }));
    try {
      if (h.src === "curseforge") await cfApi.install(instance.id, kind, Number(h.project_id));
      else await install(instance, kind, h.project_id);
      setBusy(({ [id(h)]: _, ...rest }) => rest);
    } catch (e) {
      setBusy((b) => ({ ...b, [id(h)]: String(e).replace(/^Error: /, "") }));
    }
    reload();
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2.5">
        {mode}
        <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Buscar ${kindLabel[kind].toLowerCase()} para ${instance.loader.type === "Vanilla" ? "" : instance.loader.type + " "}${instance.mcVersion}…`} className="h-10 min-w-[200px] flex-1 border border-transparent bg-surface px-3.5 text-sm text-ink outline-none placeholder:text-[#55555b] focus:border-[#5a5a5f]" />
        {cf && <Segmented value={source} onChange={setSource} options={[{ value: "all", label: "Todas" }, { value: "modrinth", label: "Modrinth" }, { value: "curseforge", label: "CurseForge" }]} />}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {kinds.map((k) => <button key={k} className={pill(kind === k)} onClick={() => setKind(k)}>{kindLabel[k]}</button>)}
        <span className="flex-1" />
        <span className="text-xs text-muted">Só o que funciona nesta instância:</span>
        {kind === "mod" && instance.loader.type !== "Vanilla" && <span className="rounded-[6px] bg-active px-2 py-[3px] text-xs font-medium text-soft">{instance.loader.type}</span>}
        <span className="rounded-[6px] bg-active px-2 py-[3px] text-xs font-medium text-soft">{instance.mcVersion}</span>
        <label className="flex h-9 items-center gap-2 rounded-[6px] bg-surface pl-3 text-sm text-muted">Ordenar
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="h-9 cursor-pointer border-0 bg-transparent pr-2 text-sm font-medium text-ink outline-none">
            <option value="relevance">Populares</option><option value="downloads">Mais baixados</option><option value="follows">Mais seguidos</option><option value="updated">Atualizados</option>
          </select>
        </label>
      </div>
      {error && <p className="m-0 text-sm text-danger">{error}</p>}

      {hits.map((h) => {
        const st = busy[id(h)], mine = has(h);
        return (
          <div key={id(h)} className="flex items-center gap-3.5 rounded-[10px] bg-surface px-3.5 py-[11px]">
            <ProjectIcon url={h.icon_url} size={44} />
            <div className="min-w-0 flex-1">
              <p className="m-0 flex items-baseline gap-2"><span className="truncate text-sm font-medium text-ink">{h.title}</span><span className="shrink-0 text-xs text-muted">por {h.author}</span></p>
              <p className="m-0 truncate text-xs text-soft">{h.description}</p>
              {st && st !== "installing" && (st.includes("BLOCKED:") ? (
                <button onClick={() => openUrl(st.slice(st.indexOf("BLOCKED:") + 8))} className="p-0 text-xs text-muted underline hover:text-ink">O autor não libera o download por outros apps. Baixar no site</button>
              ) : <p className="m-0 truncate text-xs text-danger" title={st}>{st}</p>)}
            </div>
            <span className="shrink-0 text-xs font-medium text-muted">↓ {fmtCount(h.downloads)}</span>
            <span className="shrink-0 rounded-[6px] bg-active px-2 py-[3px] text-xs font-medium text-soft">{SRC[h.src]}</span>
            {mine ? (
              <span className="flex w-[116px] shrink-0 items-center justify-center gap-1.5 text-sm font-medium text-playing"><svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>Instalado</span>
            ) : st === "installing" ? (
              <span className="relative flex h-9 w-[116px] shrink-0 items-center justify-center overflow-hidden rounded-[6px] bg-active text-sm font-medium text-ink"><span className="absolute inset-y-0 left-0 w-1/3 animate-[rog-slide_1.2s_ease-in-out_infinite] bg-white/15" /><span className="relative">Instalando…</span></span>
            ) : (
              <button onClick={() => add(h)} className="h-9 w-[116px] shrink-0 bg-active text-sm font-medium text-ink hover:bg-ink hover:text-[#111112]">Instalar</button>
            )}
          </div>
        );
      })}
      {loading && Array.from({ length: hits.length ? 2 : 6 }, (_, n) => <div key={n} className="h-[66px] animate-pulse rounded-[10px] bg-surface" style={{ opacity: 1 - n * 0.14 }} />)}
      {!loading && !error && hits.length === 0 && <p className="m-0 py-10 text-center text-sm text-muted">Nada encontrado para {instance.mcVersion}.</p>}
      {!loading && hits.length > 0 && hits.length < total && <button onClick={() => load(true)} className="self-center bg-active px-4 py-2 text-sm font-medium text-ink hover:bg-[#34343a]">Carregar mais</button>}
    </>
  );
}

const MOD_LOADERS: LoaderType[] = ["Fabric", "Forge", "NeoForge", "Quilt"];

/** Instância Vanilla: escolher um loader para poder usar mods. */
function AddLoader({ instance }: { instance: Instance }) {
  const { refresh } = useApp();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [loader, setLoader] = useState<LoaderType>("Fabric");
  const [versions, setVersions] = useState<LoaderVersion[] | null>(null);
  const [version, setVersion] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    let live = true;
    setVersions(null);
    loaderApi
      .versions(loader, instance.mcVersion)
      .then((l) => {
        if (!live) return;
        setVersions(l);
        setVersion((l.find((v) => v.recommended) ?? l[0])?.version ?? "");
      })
      .catch(() => live && setVersions([]));
    return () => {
      live = false;
    };
  }, [open, loader, instance.mcVersion]);

  async function apply() {
    setBusy(true);
    await extrasApi.changeLoader(instance.id, { type: loader, version });
    await refresh();
    navigate(`/mods/${instance.id}/mods`);
  }

  if (!open)
    return (
      <div className="flex items-center gap-4 rounded-[10px] bg-surface px-4 py-3">
        <p className="m-0 flex-1 text-sm text-muted">Instâncias Vanilla não rodam mods, só resource packs. Adicione um loader para usar mods aqui.</p>
        <button onClick={() => setOpen(true)} className="bg-ink px-4 py-2 text-sm font-semibold text-[#111112] hover:bg-white">Adicionar loader</button>
      </div>
    );

  return (
    <div className="flex flex-col gap-4 rounded-[10px] bg-surface p-5">
      <p className="m-0 text-sm text-muted">Escolha o loader. A instância passa para a aba Mods e o loader é baixado no próximo Jogar.</p>
      <div className="grid max-w-[560px] grid-cols-4 gap-2">
        {MOD_LOADERS.map((l) => (
          <button
            key={l}
            onClick={() => setLoader(l)}
            className={`flex flex-col items-center gap-2 border px-2 pt-3 pb-2.5 ${l === loader ? "border-[#454545] bg-active" : "border-edge bg-bg hover:border-[#4a4a4a]"}`}
          >
            <span className={l === loader ? "" : "opacity-60"}><LoaderIcon loader={l} size={34} /></span>
            <span className={`text-xs font-medium ${l === loader ? "text-ink" : "text-muted"}`}>{l}</span>
          </button>
        ))}
      </div>
      <div className="flex items-center gap-3">
        {versions === null ? (
          <span className="text-sm text-muted">Buscando versões…</span>
        ) : versions.length === 0 ? (
          <span className="text-sm text-muted">O {loader} ainda não tem versão para o Minecraft {instance.mcVersion}.</span>
        ) : (
          <Select value={version} onChange={setVersion} className="w-64" options={versions.map((v) => ({ value: v.version, label: `${v.version}${v.recommended ? " (recomendada)" : v.stable ? "" : " · beta"}` }))} />
        )}
        <span className="flex-1" />
        <button onClick={() => setOpen(false)} className="px-3 py-2 text-sm text-muted hover:text-ink">Cancelar</button>
        <button disabled={busy || !version} onClick={apply} className="bg-ink px-4 py-2 text-sm font-semibold text-[#111112] hover:bg-white disabled:opacity-40">
          {busy ? "Aplicando…" : `Usar ${loader}`}
        </button>
      </div>
    </div>
  );
}
