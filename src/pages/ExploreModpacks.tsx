import { useCallback, useEffect, useRef, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { api, cfApi, cfModpackApi, importApi, installApi, type Instance } from "../lib/api";
import { fmtCount, modpackVersions, searchModpacks, type Hit, type PackVersion, type Sort } from "../lib/modrinth";
import { useApp } from "../lib/store";
import { Chip, Segmented } from "../components/ui";

type Src = "modrinth" | "curseforge";
type Item = Hit & { src: Src };
const SRC: Record<Src, string> = { modrinth: "Modrinth", curseforge: "CurseForge" };
const LOADERS = [
  { value: "", label: "Todos", cf: undefined },
  { value: "fabric", label: "Fabric", cf: 4 },
  { value: "forge", label: "Forge", cf: 1 },
  { value: "neoforge", label: "NeoForge", cf: 6 },
  { value: "quilt", label: "Quilt", cf: 5 },
];
const SORTS: { value: Sort; label: string; cf: number }[] = [
  { value: "relevance", label: "Populares", cf: 2 },
  { value: "downloads", label: "Mais baixados", cf: 6 },
  { value: "updated", label: "Atualizados", cf: 3 },
];

/** Abas da página Mods: o que você tem × o que dá pra instalar. */
export function ModsTabs() {
  const tab = (to: string, label: string, end?: boolean) => (
    <NavLink to={to} end={end} className={({ isActive }) => `relative px-0.5 pt-3 pb-2.5 text-sm font-medium no-underline ${isActive ? "text-ink" : "text-muted hover:text-soft"}`}>
      {({ isActive }) => (
        <>
          {label}
          {isActive && <span className="absolute right-0 bottom-[-1px] left-0 h-0.5 rounded-t-[2px] bg-ink" />}
        </>
      )}
    </NavLink>
  );
  return (
    <div className="flex shrink-0 gap-6 border-b border-line">
      {tab("/mods", "Minhas instâncias", true)}
      {tab("/mods/explorar", "Explorar modpacks")}
    </div>
  );
}

function Filter({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <label className="flex h-11 shrink-0 items-center gap-2 rounded-[6px] bg-surface pl-3 text-sm text-muted">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)} className="h-full cursor-pointer border-0 bg-transparent pr-2 text-sm font-medium text-ink outline-none">
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

export function ExploreModpacks() {
  const [cf, setCf] = useState(false);
  const [source, setSource] = useState<"all" | Src>("all");
  const [query, setQuery] = useState("");
  const [version, setVersion] = useState("");
  const [loader, setLoader] = useState("");
  const [sort, setSort] = useState<Sort>("relevance");
  const [mc, setMc] = useState<string[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [open, setOpen] = useState<Item | null>(null);
  const pages = useRef(0);
  const seq = useRef(0);

  useEffect(() => {
    cfApi.available().then(setCf).catch(() => setCf(false));
    installApi.listVersions(false).then((v) => setMc(v.map((x) => x.id))).catch(() => {});
  }, []);

  const load = useCallback(
    async (more: boolean) => {
      const n = ++seq.current;
      const page = more ? pages.current + 1 : 0;
      setLoading(true);
      setError(null);
      const want: Src[] = source === "all" ? (cf ? ["modrinth", "curseforge"] : ["modrinth"]) : [source];
      const res = await Promise.allSettled(
        want.map((s) =>
          s === "modrinth"
            ? searchModpacks(query, page * 20, { version, loader, sort })
            : cfModpackApi.search(query, page * 20, { version, loader: LOADERS.find((l) => l.value === loader)?.cf, sort: SORTS.find((x) => x.value === sort)!.cf }),
        ),
      );
      if (n !== seq.current) return;
      const lists: Item[][] = [];
      const failed: Src[] = [];
      let sum = 0;
      res.forEach((r, i) => {
        if (r.status === "fulfilled") {
          lists.push(r.value.hits.map((h) => ({ ...h, src: want[i] })));
          sum += r.value.total_hits;
        } else failed.push(want[i]);
      });
      // Intercala as fontes para nenhuma dominar a página.
      const merged: Item[] = [];
      for (let i = 0; lists.some((l) => i < l.length); i++) for (const l of lists) if (l[i]) merged.push(l[i]);
      if (sort === "downloads") merged.sort((a, b) => b.downloads - a.downloads);
      pages.current = page;
      setItems((old) => (more ? [...old, ...merged] : merged));
      setTotal(sum);
      setNote(failed.length && lists.length ? `O ${SRC[failed[0]]} não respondeu agora; mostrando só o ${SRC[want.find((s) => !failed.includes(s))!]}.` : null);
      if (!lists.length) {
        const msg = String((res[0] as PromiseRejectedResult).reason);
        setError(msg.includes("403") ? "O CurseForge recusou a chave do launcher." : `Não deu para buscar: ${msg.replace(/^Error: /, "")}`);
      }
      setLoading(false);
    },
    [source, cf, query, version, loader, sort],
  );

  useEffect(() => {
    const t = setTimeout(() => load(false), 300);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col gap-[18px] overflow-y-auto px-10 pt-7 pb-8">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <h1 className="m-0 text-[28px] leading-9 font-semibold text-ink">Mods</h1>
            <p className="m-0 text-sm text-muted">Escolha um pacote pronto e a instância é criada para você</p>
          </div>
          {cf && (
            <Segmented
              value={source}
              onChange={setSource}
              options={[
                { value: "all", label: "Todas" },
                { value: "modrinth", label: "Modrinth" },
                { value: "curseforge", label: "CurseForge" },
              ]}
            />
          )}
        </div>
        <ModsTabs />
        <div className="flex gap-2.5">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={cf ? "Buscar modpacks no Modrinth e no CurseForge…" : "Buscar modpacks no Modrinth…"}
            className="h-11 min-w-0 flex-1 border border-transparent bg-surface px-3.5 text-sm text-ink outline-none placeholder:text-[#55555b] focus:border-[#5a5a5f]"
          />
          <Filter label="Versão" value={version} onChange={setVersion} options={[{ value: "", label: "Todas" }, ...mc.map((v) => ({ value: v, label: v }))]} />
          <Filter label="Loader" value={loader} onChange={setLoader} options={LOADERS} />
          <Filter label="Ordenar" value={sort} onChange={(v) => setSort(v as Sort)} options={SORTS} />
        </div>
        {note && <p className="m-0 text-xs text-muted">{note}</p>}
        {error && <p className="m-0 text-sm text-danger">{error}</p>}

        <div className="grid grid-cols-[repeat(auto-fill,minmax(340px,1fr))] gap-4">
          {items.map((h) => (
            <button
              key={h.src + h.project_id}
              onClick={() => setOpen(h)}
              className={`group flex flex-col overflow-hidden !rounded-[10px] border-2 bg-surface text-left ${open?.project_id === h.project_id && open.src === h.src ? "border-ink" : "border-transparent hover:border-[#3a3a40]"}`}
            >
              <span className="relative block h-[138px] w-full overflow-hidden bg-raised">
                {(h.featured_gallery || h.icon_url) && (
                  <img src={h.featured_gallery || h.icon_url!} alt="" loading="lazy" className={`h-full w-full object-cover transition-[transform,filter] duration-200 group-hover:scale-[1.03] group-hover:brightness-110 ${h.featured_gallery ? "" : "scale-110 blur-xl brightness-75"}`} />
                )}
                {!h.featured_gallery && h.icon_url && <img src={h.icon_url} alt="" className="absolute top-1/2 left-1/2 h-20 w-20 -translate-x-1/2 -translate-y-1/2 rounded-[10px] object-cover shadow-[0_8px_24px_rgba(0,0,0,0.5)]" />}
                <span className="absolute top-2.5 left-2.5 rounded-[6px] bg-black/60 px-2 py-[3px] text-xs font-medium text-ink">{SRC[h.src]}</span>
              </span>
              <span className="flex w-full flex-col gap-1.5 px-4 py-3.5">
                <span className="flex items-baseline gap-2">
                  <span className="truncate text-base font-semibold text-ink">{h.title}</span>
                  <span className="shrink-0 text-xs text-muted">por {h.author}</span>
                </span>
                <span className="truncate text-sm text-soft">{h.description}</span>
                <span className="flex items-center gap-1.5 pt-1">
                  {(h.categories ?? []).filter((c) => ["fabric", "forge", "neoforge", "quilt"].includes(c)).slice(0, 2).map((c) => <Chip key={c}>{LOADERS.find((l) => l.value === c)?.label}</Chip>)}
                  <span className="flex-1" />
                  <span className="text-xs font-medium text-muted">↓ {fmtCount(h.downloads)}</span>
                </span>
              </span>
            </button>
          ))}
          {loading && Array.from({ length: items.length ? 3 : 6 }, (_, i) => <div key={i} className="h-[246px] animate-pulse rounded-[10px] bg-surface" style={{ opacity: 1 - i * 0.12 }} />)}
        </div>
        {!loading && !error && items.length === 0 && <p className="m-0 py-10 text-center text-sm text-muted">Nenhum modpack encontrado com esses filtros.</p>}
        {!loading && items.length > 0 && items.length < total && (
          <button onClick={() => load(true)} className="self-center bg-active px-4 py-2 text-sm font-medium text-ink hover:bg-[#34343a]">Carregar mais</button>
        )}
      </div>
      {open && <Details item={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function Details({ item, onClose }: { item: Item; onClose: () => void }) {
  const { refresh } = useApp();
  const navigate = useNavigate();
  const [name, setName] = useState(item.title);
  const [versions, setVersions] = useState<PackVersion[] | null>(item.src === "modrinth" ? null : []);
  const [vid, setVid] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cover = item.featured_gallery || item.icon_url;

  useEffect(() => {
    setName(item.title);
    setError(null);
    if (item.src !== "modrinth") return setVersions([]);
    let live = true;
    setVersions(null);
    modpackVersions(item.project_id)
      .then((v) => {
        if (!live) return;
        setVersions(v);
        setVid(v[0]?.id ?? "");
      })
      .catch((e) => live && (setVersions([]), setError(String(e).replace(/^Error: /, ""))));
    return () => {
      live = false;
    };
  }, [item]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [busy, onClose]);

  async function install() {
    setBusy(true);
    setError(null);
    try {
      let inst: Instance;
      if (item.src === "curseforge") inst = await cfModpackApi.install(Number(item.project_id), cover);
      else {
        const v = versions?.find((x) => x.id === vid);
        if (!v) throw new Error("esse modpack não tem arquivo para baixar");
        inst = await importApi.url(v.url, cover);
      }
      const wanted = name.trim();
      if (wanted && wanted !== inst.name) {
        const made = inst;
        inst = await api.updateInstance({ ...made, name: wanted }).catch(() => made);
      }
      await refresh();
      navigate(`/${inst.kind}/${inst.id}/conteudo`);
    } catch (e) {
      setError(String(e).replace(/^Error: /, ""));
      setBusy(false);
    }
  }

  const label = "m-0 mb-1.5 text-xs font-medium text-muted";
  const stat = (a: string, b: string) => (
    <div className="flex-1 rounded-[6px] bg-raised px-3 py-2.5">
      <p className="m-0 text-base font-semibold text-ink">{a}</p>
      <p className="m-0 text-xs text-muted">{b}</p>
    </div>
  );
  const updated = item.date_modified ? new Date(item.date_modified).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" }) : null;

  return (
    <>
      <div className="absolute inset-0 z-10 bg-black/55" onClick={() => !busy && onClose()} />
      <aside className="absolute top-0 right-0 bottom-0 z-20 flex w-[480px] max-w-[92%] flex-col overflow-hidden rounded-l-[14px] bg-surface shadow-[-16px_0_40px_rgba(0,0,0,0.5)]">
        <div className="relative h-[210px] shrink-0 overflow-hidden bg-raised">
          {cover && <img src={cover} alt="" className={`h-full w-full object-cover ${item.featured_gallery ? "" : "scale-125 blur-2xl brightness-75"}`} />}
          <div className="absolute inset-0 bg-gradient-to-b from-transparent from-25% to-surface" />
          <button aria-label="Fechar" onClick={onClose} disabled={busy} className="absolute top-3 right-3 flex h-8 w-8 items-center justify-center bg-black/55 text-ink hover:bg-black/80">
            <svg width="12" height="12" viewBox="0 0 12 12"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
          </button>
          <div className="absolute right-7 bottom-4 left-7">
            <p className="m-0 truncate text-xl font-semibold text-ink">{item.title}</p>
            <p className="m-0 text-xs text-soft">por {item.author} · via {SRC[item.src]}</p>
          </div>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-7 py-2">
          <div className="flex gap-2.5">
            {stat(fmtCount(item.downloads), "downloads")}
            {item.follows > 0 && stat(fmtCount(item.follows), "seguidores")}
            {updated && stat(updated, "atualizado")}
          </div>
          <p className="m-0 text-sm leading-[22px] text-soft">{item.description}</p>
          <div>
            <p className={label}>Nome da instância</p>
            <input value={name} maxLength={64} onChange={(e) => setName(e.target.value)} className="h-11 w-full border border-transparent bg-raised px-3.5 text-sm text-ink outline-none focus:border-[#5a5a5f]" />
          </div>
          <div>
            <p className={label}>Versão do modpack</p>
            {item.src === "curseforge" ? (
              <div className="flex h-11 items-center rounded-[6px] bg-raised px-3.5 text-sm text-soft">A mais recente estável</div>
            ) : versions === null ? (
              <div className="h-11 animate-pulse rounded-[6px] bg-raised" />
            ) : (
              <select value={vid} onChange={(e) => setVid(e.target.value)} className="h-11 w-full cursor-pointer border-0 bg-raised px-3 text-sm text-ink outline-none">
                {versions.map((v, i) => <option key={v.id} value={v.id}>{v.label}{i === 0 ? " (mais recente)" : ""}</option>)}
              </select>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-2.5 border-t border-line px-7 py-5">
          <button
            onClick={install}
            disabled={busy || versions === null || (item.src === "modrinth" && !vid)}
            className={`relative flex h-12 items-center justify-center overflow-hidden text-base font-semibold ${busy ? "bg-active text-ink" : "bg-ink text-[#111112] hover:bg-white disabled:opacity-40"}`}
          >
            {busy && <span className="absolute inset-y-0 left-0 w-1/3 animate-[rog-slide_1.2s_ease-in-out_infinite] bg-white/15" />}
            <span className="relative">{busy ? "Instalando…" : "Instalar"}</span>
          </button>
          <p className={`m-0 text-xs ${error ? "text-danger" : "text-muted"}`}>
            {error ?? (busy ? "Baixando o modpack e os mods. Pode levar alguns minutos; não feche o launcher." : "Cria a instância e baixa todos os mods do pacote.")}
          </p>
        </div>
      </aside>
    </>
  );
}
