import { useCallback, useEffect, useRef, useState } from "react";
import { cfApi, cfModpackApi, importApi, type Instance } from "../lib/api";
import { fmtCount, modpackFile, searchModpacks, type Hit } from "../lib/modrinth";
import { Segmented } from "./ui";

/** Aba Modpacks da Nova instância: busca no Modrinth ou CurseForge e cria a instância do pack. */
export function ModpackSearch({ onDone }: { onDone: (inst: Instance) => void }) {
  const [source, setSource] = useState<"modrinth" | "curseforge">("modrinth");
  const [cf, setCf] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    cfApi.available().then(setCf);
  }, []);

  const load = useCallback(
    async (offset: number) => {
      const n = ++seq.current;
      setLoading(true);
      setError(null);
      try {
        const r = source === "curseforge" ? await cfModpackApi.search(query, offset) : await searchModpacks(query, offset);
        if (n !== seq.current) return;
        setHits((h) => (offset ? [...h, ...r.hits] : r.hits));
        setTotal(r.total_hits);
      } catch (e) {
        if (n !== seq.current) return;
        const msg = String(e);
        setError(msg.includes("403") ? "O CurseForge ainda não liberou a chave do launcher. Use o Modrinth por enquanto." : `Não deu para buscar: ${msg}`);
        if (!offset) {
          setHits([]);
          setTotal(0);
        }
      } finally {
        if (n === seq.current) setLoading(false);
      }
    },
    [source, query],
  );

  useEffect(() => {
    const t = setTimeout(() => load(0), 300);
    return () => clearTimeout(t);
  }, [load]);

  async function install(h: Hit) {
    setBusy(h.project_id);
    setError(null);
    try {
      const cover = h.featured_gallery || h.icon_url;
      const inst = source === "curseforge" ? await cfModpackApi.install(Number(h.project_id), cover) : await importApi.url(await modpackFile(h.project_id), cover);
      onDone(inst);
    } catch (e) {
      setError(String(e).replace(/^Error: /, ""));
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
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
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar modpacks…"
          className="h-10 flex-1 border border-edge bg-[#141414] px-3 text-[13px] text-ink outline-none placeholder:text-[#6f6f6f] focus:border-[#5a5a5a]"
        />
      </div>

      <div className="flex max-h-[420px] min-h-[300px] flex-col gap-2 overflow-y-auto pr-1">
        {hits.map((h) => (
          <div key={h.project_id} className="flex items-center gap-3 border border-line bg-[#141414] p-3 hover:border-[#3a3a3a]">
            {h.icon_url ? <img src={h.icon_url} alt="" className="h-12 w-12 shrink-0 border border-edge object-cover" /> : <div className="h-12 w-12 shrink-0 border border-edge bg-raised" />}
            <div className="min-w-0 flex-1 text-left">
              <div className="flex items-baseline gap-2">
                <p className="m-0 truncate text-[13px] font-semibold">{h.title}</p>
                <span className="shrink-0 text-[11px] text-muted">por {h.author}</span>
              </div>
              <p className="m-0 line-clamp-1 text-xs text-[#9a9a9a]">{h.description}</p>
              <span className="text-[11px] text-muted">↓ {fmtCount(h.downloads)}</span>
            </div>
            <button
              disabled={!!busy}
              onClick={() => install(h)}
              className="shrink-0 bg-ink px-4 py-2 text-xs font-semibold text-[#111] hover:bg-white disabled:opacity-40"
            >
              {busy === h.project_id ? "Instalando…" : "Instalar"}
            </button>
          </div>
        ))}
        {loading && <p className="m-0 text-[13px] text-muted">Carregando…</p>}
        {!loading && !error && hits.length === 0 && <p className="m-0 text-[13px] text-muted">Nenhum modpack encontrado.</p>}
        {!loading && !error && hits.length < total && (
          <button onClick={() => load(hits.length)} className="self-center border border-edge px-4 py-1.5 text-xs text-[#d0d0d0] hover:bg-raised">
            Carregar mais
          </button>
        )}
      </div>
      <p className="m-0 text-left text-xs text-muted">{error ?? (busy ? "Baixando o modpack e os mods. Pode levar alguns minutos…" : `Conteúdo do ${source === "curseforge" ? "CurseForge" : "Modrinth"}.`)}</p>
    </div>
  );
}
