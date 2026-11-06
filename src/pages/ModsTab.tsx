import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LoaderIcon } from "../components/LoaderIcon";
import { useApp } from "../lib/store";
import { extrasApi, loaderApi, type LoaderType, type LoaderVersion } from "../lib/api";
import { api, cfApi, contentApi, openUrl, type ContentItem, type ContentKind, type Instance } from "../lib/api";
import { fmtCount, install, kindsFor, search, type Hit, type Sort } from "../lib/modrinth";
import { Segmented, Select, Toggle } from "../components/ui";

const kindLabel: Record<ContentKind, string> = { mod: "Mods", resourcepack: "Resource packs", shader: "Shaders" };
const kindSingular: Record<ContentKind, string> = { mod: "mod", resourcepack: "resource pack", shader: "shader" };

function ProjectIcon({ url, size = 48 }: { url: string | null | undefined; size?: number }) {
  return url ? (
    <img src={url} width={size} height={size} alt="" className="shrink-0 border border-edge bg-raised object-cover" style={{ width: size, height: size }} />
  ) : (
    <div className="shrink-0 border border-edge bg-raised" style={{ width: size, height: size }} />
  );
}

/** Aba de conteúdo da instância: instalados + explorar no Modrinth. */
export function ModsTab({ instance }: { instance: Instance }) {
  const kinds = kindsFor(instance);
  const [view, setView] = useState<"installed" | "explore">("installed");
  const [kind, setKind] = useState<ContentKind>(kinds[0]);
  const [items, setItems] = useState<ContentItem[]>([]);

  const reload = useCallback(() => contentApi.list(instance.id).then(setItems), [instance.id]);
  useEffect(() => {
    reload();
  }, [reload]);

  const ofKind = items.filter((i) => i.kind === kind);

  return (
    <div className="flex h-full flex-col gap-5 px-10 py-8">
      <div className="flex items-center gap-4">
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: "installed", label: `Instalados (${items.length})` },
            { value: "explore", label: "Explorar" },
          ]}
        />
        {kinds.length > 1 && <Segmented value={kind} onChange={setKind} options={kinds.map((k) => ({ value: k, label: kindLabel[k] }))} />}
        <span className="flex-1" />
        <button onClick={() => api.openFolder(instance.id)} className="text-[13px] text-muted hover:text-ink">
          Abrir pasta
        </button>
      </div>

      {instance.loader.type === "Vanilla" && <AddLoader instance={instance} />}

      {view === "installed" ? (
        <Installed instance={instance} items={ofKind} kind={kind} reload={reload} onExplore={() => setView("explore")} />
      ) : (
        <Explore instance={instance} kind={kind} installed={items} reload={reload} />
      )}
    </div>
  );
}

function Installed({ instance, items, kind, reload, onExplore }: { instance: Instance; items: ContentItem[]; kind: ContentKind; reload: () => void; onExplore: () => void }) {
  if (!items.length)
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <p className="m-0 text-sm text-[#9a9a9a]">Nenhum {kindSingular[kind]} instalado ainda.</p>
        <button onClick={onExplore} className="bg-ink px-5 py-2.5 text-[13px] font-semibold text-[#111] hover:bg-white">
          Explorar {kindLabel[kind].toLowerCase()}
        </button>
      </div>
    );
  return (
    <div className="flex flex-col border border-line">
      {items.map((i) => (
        <div key={i.file} className={`flex items-center gap-4 border-b border-line px-4 py-3 last:border-b-0 ${i.enabled ? "" : "opacity-50"}`}>
          <ProjectIcon url={i.meta?.iconUrl} size={40} />
          <div className="min-w-0 flex-1">
            <p className="m-0 truncate text-sm font-semibold">{i.meta?.title ?? i.file}</p>
            <p className="m-0 truncate text-xs text-muted">
              {i.meta ? `${i.meta.versionNumber} · ${i.file}` : `${i.file} · adicionado manualmente`}
            </p>
          </div>
          <Toggle on={i.enabled} onChange={(v) => contentApi.toggle(instance.id, i.kind, i.file, v).then(reload)} />
          <button
            onClick={() => contentApi.remove(instance.id, i.kind, i.file).then(reload)}
            title="Remover"
            className="flex h-8 w-8 items-center justify-center text-muted hover:bg-active hover:text-ink"
          >
            <svg width="14" height="14" viewBox="0 0 14 14"><path d="M2 2 L12 12 M12 2 L2 12" stroke="currentColor" strokeWidth="1.6" /></svg>
          </button>
        </div>
      ))}
    </div>
  );
}

function Explore({ instance, kind, installed, reload }: { instance: Instance; kind: ContentKind; installed: ContentItem[]; reload: () => void }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("relevance");
  const [hits, setHits] = useState<Hit[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Record<string, "installing" | string>>({});
  const [source, setSource] = useState<"modrinth" | "curseforge">("modrinth");
  const [cf, setCf] = useState(false);
  useEffect(() => {
    cfApi.available().then(setCf);
  }, []);
  const seq = useRef(0);

  const load = useCallback(
    async (offset: number) => {
      const n = ++seq.current;
      setLoading(true);
      setError(null);
      try {
        const r =
          source === "curseforge"
            ? await cfApi.search(kind, instance.mcVersion, instance.loader.type, query, sort, offset)
            : await search(instance, kind, query, sort, offset);
        if (n !== seq.current) return;
        setHits((h) => (offset ? [...h, ...r.hits] : r.hits));
        setTotal(r.total_hits);
      } catch (e) {
        if (n === seq.current) {
          setError(String(e));
          if (!offset) {
            setHits([]);
            setTotal(0);
          }
        }
      } finally {
        if (n === seq.current) setLoading(false);
      }
    },
    [instance, kind, query, sort, source],
  );

  useEffect(() => {
    const t = setTimeout(() => load(0), 300);
    return () => clearTimeout(t);
  }, [load]);

  const isInstalled = (id: string) => installed.some((i) => i.meta?.projectId === id);

  async function add(h: Hit) {
    setBusy((b) => ({ ...b, [h.project_id]: "installing" }));
    try {
      if (source === "curseforge") await cfApi.install(instance.id, kind, Number(h.project_id));
      else await install(instance, kind, h.project_id);
      setBusy(({ [h.project_id]: _, ...rest }) => rest);
    } catch (e) {
      setBusy((b) => ({ ...b, [h.project_id]: String(e).replace(/^Error: /, "") }));
    }
    reload();
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex gap-3">
        {cf && (
          <Segmented
            value={source}
            onChange={(v) => {
              setHits([]);
              setSource(v);
            }}
            options={[
              { value: "modrinth", label: "Modrinth" },
              { value: "curseforge", label: "CurseForge" },
            ]}
          />
        )}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Buscar ${kindLabel[kind].toLowerCase()} para ${instance.mcVersion}…`}
          className="h-10 flex-1 border border-edge bg-[#171717] px-4 text-[13px] text-ink outline-none placeholder:text-[#6f6f6f] focus:border-[#555]"
        />
        <Select
          value={sort}
          onChange={(v) => setSort(v as Sort)}
          className="w-44"
          options={[
            { value: "relevance", label: "Relevância" },
            { value: "downloads", label: "Mais baixados" },
            { value: "follows", label: "Mais seguidos" },
            { value: "updated", label: "Atualizados" },
          ]}
        />
      </div>

      {error && <p className="m-0 text-[13px] text-[#9a9a9a]">{error.includes("403") ? "O CurseForge recusou a chave (403). A chave ainda não foi liberada para apps de terceiros." : `Não deu para buscar: ${error}`}</p>}

      <div className="grid grid-cols-[repeat(auto-fill,minmax(420px,1fr))] gap-3">
        {hits.map((h) => {
          const state = busy[h.project_id];
          const has = isInstalled(h.project_id);
          return (
            <div key={h.project_id} className="flex gap-4 border border-line bg-[#141414] p-4 transition-colors hover:border-[#3a3a3a] hover:bg-[#181818]">
              <ProjectIcon url={h.icon_url} size={56} />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex items-baseline gap-2">
                  <p className="m-0 truncate text-sm font-semibold">{h.title}</p>
                  <span className="shrink-0 text-xs text-muted">por {h.author}</span>
                </div>
                <p className="m-0 line-clamp-2 text-xs leading-relaxed text-[#9a9a9a]">{h.description}</p>
                <div className="mt-auto flex items-center gap-3 pt-2">
                  <span className="text-[11px] text-muted">↓ {fmtCount(h.downloads)}</span>
                  <span className="text-[11px] text-muted">♥ {fmtCount(h.follows)}</span>
                  <span className="flex-1" />
                  {state?.includes("BLOCKED:") ? (
                    <button onClick={() => openUrl(state.slice(state.indexOf("BLOCKED:") + 8))} className="text-[11px] text-[#9a9a9a] underline hover:text-ink" title="O autor não libera download por outros apps">
                      Baixar no site
                    </button>
                  ) : (
                    state && state !== "installing" && <span className="max-w-[180px] truncate text-[11px] text-[#9a9a9a]" title={state}>{state}</span>
                  )}
                  <button
                    disabled={has || state === "installing"}
                    onClick={() => add(h)}
                    className={`px-4 py-1.5 text-xs font-semibold ${has ? "border border-edge text-muted" : "bg-ink text-[#111] hover:bg-white"} disabled:cursor-default`}
                  >
                    {has ? "Instalado" : state === "installing" ? "Instalando…" : "Instalar"}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {!loading && !error && hits.length === 0 && <p className="m-0 text-[13px] text-muted">Nada encontrado para {instance.mcVersion}.</p>}
      {loading && <p className="m-0 text-[13px] text-muted">Carregando…</p>}
      {!loading && !error && hits.length < total && (
        <button onClick={() => load(hits.length)} className="self-center border border-edge px-5 py-2 text-[13px] text-[#d0d0d0] hover:bg-raised">
          Carregar mais
        </button>
      )}
      <p className="m-0 pb-2 text-[11px] text-[#7a7a7a]">Conteúdo do {source === "curseforge" ? "CurseForge" : "Modrinth"}.</p>
    </div>
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
      <div className="flex items-center gap-4 border border-line bg-[#151515] px-4 py-3">
        <p className="m-0 flex-1 text-[13px] text-[#9a9a9a]">Instâncias Vanilla não rodam mods, só resource packs. Adicione um loader para usar mods aqui.</p>
        <button onClick={() => setOpen(true)} className="bg-ink px-4 py-2 text-[13px] font-semibold text-[#111] hover:bg-white">Adicionar loader</button>
      </div>
    );

  return (
    <div className="flex flex-col gap-4 border border-line bg-[#151515] p-5">
      <p className="m-0 text-[13px] text-[#9a9a9a]">Escolha o loader. A instância passa para a aba Mods e o loader é baixado no próximo Jogar.</p>
      <div className="grid max-w-[560px] grid-cols-4 gap-2">
        {MOD_LOADERS.map((l) => (
          <button
            key={l}
            onClick={() => setLoader(l)}
            className={`flex flex-col items-center gap-2 border px-2 pt-3 pb-2.5 ${l === loader ? "border-[#454545] bg-active" : "border-edge bg-[#121212] hover:border-[#4a4a4a]"}`}
          >
            <span className={l === loader ? "" : "opacity-60"}><LoaderIcon loader={l} size={34} /></span>
            <span className={`text-xs font-medium ${l === loader ? "text-ink" : "text-[#9a9a9a]"}`}>{l}</span>
          </button>
        ))}
      </div>
      <div className="flex items-center gap-3">
        {versions === null ? (
          <span className="text-[13px] text-muted">Buscando versões…</span>
        ) : versions.length === 0 ? (
          <span className="text-[13px] text-[#9a9a9a]">O {loader} ainda não tem versão para o Minecraft {instance.mcVersion}.</span>
        ) : (
          <Select value={version} onChange={setVersion} className="w-64" options={versions.map((v) => ({ value: v.version, label: `${v.version}${v.recommended ? " (recomendada)" : v.stable ? "" : " · beta"}` }))} />
        )}
        <span className="flex-1" />
        <button onClick={() => setOpen(false)} className="px-3 py-2 text-[13px] text-muted hover:text-ink">Cancelar</button>
        <button disabled={busy || !version} onClick={apply} className="bg-ink px-4 py-2 text-[13px] font-semibold text-[#111] hover:bg-white disabled:opacity-40">
          {busy ? "Aplicando…" : `Usar ${loader}`}
        </button>
      </div>
    </div>
  );
}
